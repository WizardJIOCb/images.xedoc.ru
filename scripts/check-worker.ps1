Param(
  [string]$ServerUrl = "https://images.xedoc.ru",
  [string]$ComfyUrl = "http://127.0.0.1:8188"
)

$ErrorActionPreference = "Stop"

Write-Host "Checking ComfyUI..." -ForegroundColor Cyan
try {
  $comfy = Invoke-WebRequest -UseBasicParsing $ComfyUrl -TimeoutSec 5
  Write-Host "ComfyUI OK: $($comfy.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "ComfyUI unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "Checking server API..." -ForegroundColor Cyan
$health = Invoke-WebRequest -UseBasicParsing "$ServerUrl/api/health" -TimeoutSec 10
Write-Host "Server OK: $($health.Content)" -ForegroundColor Green
