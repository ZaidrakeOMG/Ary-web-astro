@echo off
setlocal EnableExtensions
title Grupo ARY - Publicar Astro en IIS
cd /d "%~dp0"
echo.
echo  =================================================
echo             GRUPO ARY - ASTRO + IIS
echo  =================================================
echo.
echo  Este proceso compila Astro y publica la carpeta
echo  dist en el sitio IIS de Grupo ARY.
echo  No altera la API ni el bot de facturacion.
echo.
where node.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: No se encontro Node.js. Instala Node.js 20 o 22 LTS.
  pause
  exit /b 1
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm no esta disponible.
  pause
  exit /b 1
)
echo [1/4] Instalando dependencias...
call npm install --no-audit --no-fund
if errorlevel 1 goto :error
echo.
echo [2/4] Compilando el proyecto Astro...
call npm run build
if errorlevel 1 goto :error
echo.
echo [3/4] Comprobando facturacion y archivos publicados...
call npm run test:integrity
if errorlevel 1 goto :error
if not exist "%~dp0dist\index.html" goto :error
if not exist "%~dp0dist\web.config" goto :error
echo.
echo [4/4] Configurando y arrancando el sitio en IIS...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publicar-astro-iis.ps1"
if errorlevel 1 goto :error
echo.
echo  Astro se ha compilado y el sitio IIS se ha iniciado.
echo.
pause
exit /b 0
:error
echo.
echo  ERROR: El proceso se detuvo. El sitio IIS existente
echo  no se cambia si falla la compilacion o la validacion.
echo  Consulta los mensajes anteriores.
pause
exit /b 1
