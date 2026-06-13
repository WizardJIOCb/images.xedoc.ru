@echo off
setlocal
set "ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\stop-worker-stack.ps1" -ProjectRoot "%ROOT:~0,-1%"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Worker stop failed with code %EXITCODE%.
)
exit /b %EXITCODE%
