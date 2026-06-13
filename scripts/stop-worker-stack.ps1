Param(
  [string]$ProjectRoot = "C:\Projects\images.xedoc.ru"
)

$ErrorActionPreference = "Stop"

$runtimeDir = Join-Path $ProjectRoot ".runtime"
$comfyPidFile = Join-Path $runtimeDir "comfyui.pid"
$workerPidFile = Join-Path $runtimeDir "worker.pid"

function Get-PidFromFile([string]$PidFile) {
  if (-not (Test-Path $PidFile)) {
    return $null
  }

  $raw = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (-not $raw) {
    return $null
  }

  $pidValue = 0
  if ([int]::TryParse($raw, [ref]$pidValue)) {
    return $pidValue
  }

  return $null
}

function Find-WorkerProcessId {
  $process = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "node.exe" -and $_.CommandLine -match [regex]::Escape("apps\worker\dist\index.js")
  } | Select-Object -First 1

  if ($process) {
    return [int]$process.ProcessId
  }

  return $null
}

function Find-ComfyProcessId {
  $process = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "python.exe" -and $_.CommandLine -match [regex]::Escape("C:\AI\ComfyUI\main.py")
  } | Select-Object -First 1

  if ($process) {
    return [int]$process.ProcessId
  }

  return $null
}

function Stop-TrackedProcess([string]$Name, [string]$PidFile) {
  $pidValue = Get-PidFromFile $PidFile
  if (-not $pidValue) {
    if ($Name -eq "Worker") {
      $pidValue = Find-WorkerProcessId
    } elseif ($Name -eq "ComfyUI") {
      $pidValue = Find-ComfyProcessId
    }
  }

  if (-not $pidValue) {
    Write-Host "$Name PID file not found." -ForegroundColor Yellow
    return
  }

  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    Write-Host "$Name already stopped." -ForegroundColor Yellow
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    return
  }

  Stop-Process -Id $pidValue -Force
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  Write-Host "$Name stopped (PID $pidValue)." -ForegroundColor Green
}

Stop-TrackedProcess "Worker" $workerPidFile
Stop-TrackedProcess "ComfyUI" $comfyPidFile
