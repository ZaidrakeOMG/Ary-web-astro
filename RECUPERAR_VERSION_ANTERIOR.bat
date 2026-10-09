@echo off
setlocal
title Grupo ARY - Recuperar version anterior
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\recuperar-iis.ps1"
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%
