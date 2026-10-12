@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-asistente-ia.ps1"
if errorlevel 1 echo [ERROR] El servicio de IA no pudo iniciarse.
pause
