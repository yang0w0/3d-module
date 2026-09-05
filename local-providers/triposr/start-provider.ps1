$env:TRIPOSR_DIR = "D:\AI\TripoSR"
$env:TRIPOSR_PYTHON = "D:\AI\TripoSR\.venv\Scripts\python.exe"
$env:TRIPOSR_CACHE_DIR = "D:\AI\triposr-cache"
$env:TRIPOSR_PROVIDER_DATA_DIR = "D:\AI\triposr-provider"
$env:TRIPOSR_CHUNK_SIZE = "4096"
$env:TEMP = "D:\AI\pip-temp"
$env:TMP = "D:\AI\pip-temp"

New-Item -ItemType Directory -Force -Path $env:TRIPOSR_CACHE_DIR, $env:TRIPOSR_PROVIDER_DATA_DIR, $env:TEMP | Out-Null

& $env:TRIPOSR_PYTHON -m uvicorn td_server:app --host 127.0.0.1 --port 8000
