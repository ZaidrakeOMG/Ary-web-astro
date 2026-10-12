@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\conectar-asistente-iis.ps1"
if errorlevel 1 echo [ERROR] No se completo la conexion del asistente a IIS. Revisa el mensaje anterior.
pause
