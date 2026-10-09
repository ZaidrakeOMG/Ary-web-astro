@echo off
setlocal
title Grupo ARY - Iniciar sitio en IIS
cd /d "%~dp0"
echo.
echo  ==========================================
echo       GRUPO ARY - INICIO EN IIS
echo  ==========================================
echo.
if not exist "%~dp0scripts\iniciar-ary-iis.ps1" (
  echo ERROR: Falta scripts\iniciar-ary-iis.ps1
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-ary-iis.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo El sitio no pudo iniciarse. Revisa los mensajes anteriores.
)
echo.
pause
exit /b %RESULT%
