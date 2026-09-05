from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


ROOT = Path(__file__).resolve().parent
PROVIDER_DATA_DIR = Path(os.environ.get("TRIPOSR_PROVIDER_DATA_DIR", "D:/AI/triposr-provider")).resolve()
OUTPUT_DIR = PROVIDER_DATA_DIR / "outputs"
INPUT_DIR = PROVIDER_DATA_DIR / "inputs"
TASKS: dict[str, dict[str, Any]] = {}

INPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def default_triposr_dir() -> Path:
    configured = os.environ.get("TRIPOSR_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    external_checkout = Path("D:/AI/TripoSR")
    if external_checkout.exists():
        return external_checkout.resolve()
    return (ROOT.parent.parent.parent / "TripoSR").resolve()


TRIPOSR_DIR = default_triposr_dir()
TRIPOSR_PYTHON = os.environ.get("TRIPOSR_PYTHON", sys.executable)
TRIPOSR_CACHE_DIR = Path(os.environ.get("TRIPOSR_CACHE_DIR", "D:/AI/triposr-cache")).resolve()
TRIPOSR_CHUNK_SIZE = os.environ.get("TRIPOSR_CHUNK_SIZE", "4096")


app = FastAPI(title="TD Studio TripoSR Provider", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")


@app.on_event("startup")
def ensure_dirs() -> None:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "provider": "triposr",
        "triposrDir": str(TRIPOSR_DIR),
        "triposrReady": triposr_run_py().exists(),
        "cacheDir": str(TRIPOSR_CACHE_DIR),
        "dataDir": str(PROVIDER_DATA_DIR),
        "chunkSize": TRIPOSR_CHUNK_SIZE,
    }


@app.post("/generate")
async def generate(
    image: UploadFile = File(...),
    options: str = Form("{}"),
) -> dict[str, Any]:
    if not triposr_run_py().exists():
        raise HTTPException(
            status_code=500,
            detail=(
                "TripoSR run.py not found. Clone TripoSR next to 3d-module, "
                "or set TRIPOSR_DIR to its folder."
            ),
        )

    task_id = f"triposr_{uuid.uuid4().hex[:12]}"
    task_input_dir = INPUT_DIR / task_id
    task_output_dir = OUTPUT_DIR / task_id
    task_input_dir.mkdir(parents=True, exist_ok=True)
    task_output_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(image.filename or "reference.png").suffix or ".png"
    input_path = task_input_dir / f"reference{suffix}"
    with input_path.open("wb") as file:
        shutil.copyfileobj(image.file, file)

    parsed_options = parse_options(options)
    TASKS[task_id] = {
        "taskId": task_id,
        "status": "queued",
        "progress": 0,
        "createdAt": time.time(),
        "options": parsed_options,
    }

    worker = threading.Thread(
        target=run_triposr,
        args=(task_id, input_path, task_output_dir),
        daemon=True,
    )
    worker.start()

    return {"taskId": task_id, "status": "queued", "progress": 0}


@app.get("/tasks/{task_id}")
def task(task_id: str) -> dict[str, Any]:
    if task_id not in TASKS:
        raise HTTPException(status_code=404, detail="Task not found")
    return TASKS[task_id]


def run_triposr(task_id: str, input_path: Path, output_dir: Path) -> None:
    TASKS[task_id].update(status="running", progress=10)
    command = [
        TRIPOSR_PYTHON,
        str(triposr_run_py()),
        str(input_path),
        "--output-dir",
        str(output_dir),
        "--model-save-format",
        "glb",
        "--chunk-size",
        TRIPOSR_CHUNK_SIZE,
    ]

    try:
        run_env = os.environ.copy()
        run_env.setdefault("HF_HOME", str(TRIPOSR_CACHE_DIR / "huggingface"))
        run_env.setdefault("HUGGINGFACE_HUB_CACHE", str(TRIPOSR_CACHE_DIR / "huggingface" / "hub"))
        run_env.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "600")
        run_env.setdefault("HF_HUB_ETAG_TIMEOUT", "60")
        run_env.setdefault("U2NET_HOME", str(TRIPOSR_CACHE_DIR / "rembg"))
        run_env.setdefault("XDG_CACHE_HOME", str(TRIPOSR_CACHE_DIR / "xdg"))
        for value in {
            run_env["HF_HOME"],
            run_env["HUGGINGFACE_HUB_CACHE"],
            run_env["U2NET_HOME"],
            run_env["XDG_CACHE_HOME"],
        }:
            Path(value).mkdir(parents=True, exist_ok=True)

        completed = subprocess.run(
            command,
            cwd=str(TRIPOSR_DIR),
            env=run_env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        if completed.returncode != 0:
            TASKS[task_id].update(
                status="failed",
                progress=100,
                error=tail(completed.stdout),
            )
            return

        glb = newest_file(output_dir, "*.glb")
        if not glb:
            TASKS[task_id].update(
                status="failed",
                progress=100,
                error="TripoSR finished but no GLB file was produced.",
            )
            return

        glb_path = glb.relative_to(output_dir).as_posix()
        TASKS[task_id].update(
            status="success",
            progress=100,
            glbUrl=f"/outputs/{task_id}/{glb_path}",
            stlUrl="",
            log=tail(completed.stdout),
        )
    except Exception as exc:
        TASKS[task_id].update(status="failed", progress=100, error=str(exc))


def parse_options(options: str) -> dict[str, Any]:
    try:
        parsed = json.loads(options or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def triposr_run_py() -> Path:
    return TRIPOSR_DIR / "run.py"


def newest_file(folder: Path, pattern: str) -> Path | None:
    files = list(folder.rglob(pattern))
    if not files:
        return None
    return max(files, key=lambda path: path.stat().st_mtime)


def tail(text: str, max_chars: int = 4000) -> str:
    return (text or "")[-max_chars:]
