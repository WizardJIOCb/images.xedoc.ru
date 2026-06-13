@echo off
setlocal
set "ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\start-worker-stack.ps1" -ProjectRoot "%ROOT:~0,-1%"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Worker start failed with code %EXITCODE%.
)
exit /b %EXITCODE%
