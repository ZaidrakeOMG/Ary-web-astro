@echo off
setlocal
title Grupo ARY - Publicar paquete ya compilado
cd /d "%~dp0"
echo.
echo  GRUPO ARY - PUBLICAR SIN REINSTALAR DEPENDENCIAS
 echo  Requiere dist completo y sha256-manifest.json del ZIP entregado.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publicar-astro-iis.ps1" -UseCompiled
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
