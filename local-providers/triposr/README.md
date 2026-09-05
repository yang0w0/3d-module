# TripoSR local provider

This folder wraps a local TripoSR checkout with the HTTP contract expected by the 3D workbench.

## 1. Install TripoSR

Clone TripoSR on the D drive:

```powershell
mkdir D:\AI
cd D:\AI
git clone https://github.com/VAST-AI-Research/TripoSR.git
cd TripoSR
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install omegaconf==2.3.0 Pillow==10.1.0 einops==0.7.0 transformers==4.35.0 trimesh==4.0.5 rembg "imageio[ffmpeg]" xatlas==0.0.9 moderngl==5.10.0 fastapi uvicorn python-multipart PyMCubes
pip install onnxruntime==1.18.1 numpy==1.26.4 sympy==1.13.1 opencv-python-headless==4.9.0.80
```

If TripoSR is somewhere else, set:

```powershell
$env:TRIPOSR_DIR="D:\path\to\TripoSR"
```

## 2. Start the provider

Use the same Python environment that can run TripoSR:

```powershell
cd C:\Users\lenovo\Desktop\创意工作台\3d-module\local-providers\triposr
.\start-provider.ps1
```

Open `http://localhost:8000/` to check readiness. `triposrReady` should be `true`.

On this Windows setup, `torchmcubes` may fail to compile without a full CUDA Toolkit. The local setup uses `PyMCubes` as a CPU mesh-extraction fallback: neural inference still uses the NVIDIA GPU, while final mesh extraction runs on CPU.

The first generation downloads model weights to `D:\AI\triposr-cache`. Uploaded inputs and generated outputs are stored under `D:\AI\triposr-provider`. Later generations reuse the cache.

## 3. Workbench settings

In the workbench, choose:

```text
生成源: 自定义/本地 API
接口类型: SD WebUI / TripoSR 包装代理
服务地址: http://localhost:8000
提交路径: /generate
查询路径: /tasks/{taskId}
```

The provider returns GLB files under `/outputs/...`. The workbench can preview the GLB, then export STL.
