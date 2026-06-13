Param(
  [string]$ProjectRoot = "C:\Projects\images.xedoc.ru",
  [string]$ComfyRoot = "C:\AI\ComfyUI",
  [string]$WorkerEnv = "C:\Projects\images.xedoc.ru\apps\worker\.env"
)

$ErrorActionPreference = "Stop"

$runtimeDir = Join-Path $ProjectRoot ".runtime"
$comfyOutLog = Join-Path $runtimeDir "comfyui.out.log"
$comfyErrLog = Join-Path $runtimeDir "comfyui.err.log"
$workerOutLog = Join-Path $runtimeDir "worker.out.log"
$workerErrLog = Join-Path $runtimeDir "worker.err.log"
$comfyPidFile = Join-Path $runtimeDir "comfyui.pid"
$workerPidFile = Join-Path $runtimeDir "worker.pid"

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

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

function Test-ProcessAlive([int]$PidValue) {
  if (-not $PidValue) {
    return $false
  }

  return $null -ne (Get-Process -Id $PidValue -ErrorAction SilentlyContinue)
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
    }
    Start-Sleep -Seconds 2
  }

  return $false
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

function Start-ComfyUi {
  $existingPid = Get-PidFromFile $comfyPidFile
  if ($existingPid -and (Test-ProcessAlive $existingPid)) {
    Write-Host "ComfyUI already running (PID $existingPid)." -ForegroundColor Yellow
    return
  }

  if (Wait-HttpOk "http://127.0.0.1:8188" 3) {
    Write-Host "ComfyUI already responds on 127.0.0.1:8188." -ForegroundColor Yellow
    return
  }

  $pythonExe = Join-Path $ComfyRoot "venv\Scripts\python.exe"
  $mainPy = Join-Path $ComfyRoot "main.py"

  if (-not (Test-Path $pythonExe)) {
    throw "ComfyUI python not found: $pythonExe"
  }

  if (-not (Test-Path $mainPy)) {
    throw "ComfyUI entrypoint not found: $mainPy"
  }

  Remove-Item $comfyOutLog, $comfyErrLog -Force -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath $pythonExe -ArgumentList "main.py", "--listen", "127.0.0.1", "--port", "8188" -WorkingDirectory $ComfyRoot -WindowStyle Hidden -RedirectStandardOutput $comfyOutLog -RedirectStandardError $comfyErrLog -PassThru
  Set-Content -Path $comfyPidFile -Value $process.Id -Encoding ascii

  if (-not (Wait-HttpOk "http://127.0.0.1:8188" 90)) {
    throw "ComfyUI did not become ready. Check $comfyErrLog"
  }

  Write-Host "ComfyUI started (PID $($process.Id))." -ForegroundColor Green
}

function Start-Worker {
  $existingPid = Get-PidFromFile $workerPidFile
  if ($existingPid -and (Test-ProcessAlive $existingPid)) {
    Write-Host "Worker already running (PID $existingPid)." -ForegroundColor Yellow
    return
  }

  $existingWorkerPid = Find-WorkerProcessId
  if ($existingWorkerPid -and (Test-ProcessAlive $existingWorkerPid)) {
    Write-Host "Worker already running (PID $existingWorkerPid)." -ForegroundColor Yellow
    return
  }

  if (-not (Test-Path $WorkerEnv)) {
    throw "Worker env file not found: $WorkerEnv"
  }

  $nodeExe = (Get-Command node -ErrorAction Stop).Source
  $workerScript = Join-Path $ProjectRoot "apps\worker\dist\index.js"

  if (-not (Test-Path $workerScript)) {
    throw "Worker build not found: $workerScript. Run pnpm --filter @images/worker build"
  }

  Remove-Item $workerOutLog, $workerErrLog -Force -ErrorAction SilentlyContinue

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $nodeExe
  $startInfo.Arguments = "`"$workerScript`""
  $startInfo.WorkingDirectory = (Join-Path $ProjectRoot "apps\worker")
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true

  Get-Content $WorkerEnv | Where-Object { $_ -and -not $_.StartsWith("#") } | ForEach-Object {
    $name, $value = $_ -split "=", 2
    $startInfo.Environment[$name] = $value
  }

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  $null = $process.Start()
  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()

  Register-ObjectEvent -InputObject $process -EventName OutputDataReceived -Action {
    if ($EventArgs.Data) {
      Add-Content -Path $using:workerOutLog -Value $EventArgs.Data
    }
  } | Out-Null

  Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -Action {
    if ($EventArgs.Data) {
      Add-Content -Path $using:workerErrLog -Value $EventArgs.Data
    }
  } | Out-Null

  Set-Content -Path $workerPidFile -Value $process.Id -Encoding ascii
  Start-Sleep -Seconds 5

  if (-not (Test-ProcessAlive $process.Id)) {
    throw "Worker exited during startup. Check $workerErrLog"
  }

  Write-Host "Worker started (PID $($process.Id))." -ForegroundColor Green
}

Ensure-Dir $runtimeDir

Push-Location $ProjectRoot
try {
  Start-ComfyUi
  Start-Worker
  Write-Host ""
  Write-Host "Worker stack is running." -ForegroundColor Green
  Write-Host "ComfyUI: http://127.0.0.1:8188"
  Write-Host "Logs: $runtimeDir"
} finally {
  Pop-Location
}
