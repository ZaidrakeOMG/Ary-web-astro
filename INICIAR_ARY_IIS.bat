@echo off
setlocal
title Grupo ARY - Publicar version profesional
cd /d "%~dp0"
echo.
echo  GRUPO ARY - ASTRO PROFESIONAL
 echo  Compilacion separada, respaldo y verificacion de IIS.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publicar-astro-iis.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo Revisa el mensaje anterior. No uses iisreset ni borres carpetas.
pause
exit /b %RESULT%
