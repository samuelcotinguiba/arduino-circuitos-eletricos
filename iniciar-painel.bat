@echo off
where py >nul 2>&1
if %errorlevel% equ 0 (
  py -3 "%~dp0app.py"
) else (
  python "%~dp0app.py"
)
if errorlevel 1 (
  echo Verifique se o Python 3 esta instalado.
  pause
)
