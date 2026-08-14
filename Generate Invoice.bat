@echo off
setlocal
cd /d "%~dp0"
set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=py"
"%PY%" -m invoice.cli %*
echo.
pause
