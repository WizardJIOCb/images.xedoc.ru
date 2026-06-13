Param(
  [string]$ProjectRoot = "C:\Projects\images.xedoc.ru",
  [string]$WorkerEnv = "C:\Projects\images.xedoc.ru\apps\worker\.env"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $WorkerEnv)) {
  throw "Worker env file not found: $WorkerEnv"
}

Get-Content $WorkerEnv | Where-Object { $_ -and -not $_.StartsWith("#") } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  [System.Environment]::SetEnvironmentVariable($name, $value)
  Set-Item -Path "Env:$name" -Value $value
}

Push-Location $ProjectRoot
try {
  pnpm --filter @images/worker dev
} finally {
  Pop-Location
}
