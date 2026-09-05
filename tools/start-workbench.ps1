$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$node = Get-Command node -ErrorAction SilentlyContinue

if (-not $node) {
  Write-Host "Node.js was not found. Please install Node.js, then run this script again."
  Read-Host "Press Enter to close"
  exit 1
}

$port = 5173
while ($port -lt 5190) {
  $busy = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  if (-not $busy) {
    break
  }
  $port += 1
}

if ($port -ge 5190) {
  Write-Host "No free local port found between 5173 and 5189."
  Read-Host "Press Enter to close"
  exit 1
}

$env:TD_WORKBENCH_ROOT = $root
$env:TD_WORKBENCH_PORT = "$port"
$url = "http://127.0.0.1:$port/"

Start-Process $url
Write-Host "3D workbench is running:"
Write-Host $url
Write-Host ""
Write-Host "Keep this window open while using the workbench. Press Ctrl+C to stop."
node "$PSScriptRoot\static-server.js"
