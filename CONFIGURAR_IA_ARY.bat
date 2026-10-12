@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar-asistente-ia.ps1" -Configurar
if errorlevel 1 echo [ERROR] La configuracion de IA no termino correctamente.
pause
