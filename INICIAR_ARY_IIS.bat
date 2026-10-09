@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title Grupo ARY - Astro + IIS
cd /d "%~dp0"
echo.
echo  ===============================================
echo       GRUPO ARY - PUBLICAR ASTRO EN IIS
echo  ===============================================
echo.
echo  El portal de facturacion/alta conserva su API.
echo  Este proceso NO inicia ni modifica Polaris.
echo.
where node.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: No se encontro Node.js. Instala Node.js LTS 20 o 22.
  goto :error
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm no esta instalado o no se encontro en PATH.
  goto :error
)
if not exist "%~dp0node_modules\astro\package.json" (
  echo [1/4] Instalando Astro por primera vez...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :error
) else (
  echo [1/4] Astro ya instalado. Saltando npm install.
)
echo.
echo [2/4] Generando el sitio optimizado de Astro...
call npm run build
if errorlevel 1 goto :error
echo.
echo [3/4] Validando fotos, rutas, alta y facturacion...
call npm run test:integrity
if errorlevel 1 goto :error
echo.
echo [4/4] Verificando sitio IIS y publicando...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publicar-astro-iis.ps1"
if errorlevel 1 goto :error
echo.
echo  -----------------------------------------------
echo  LISTO: Sitio Astro compilado e iniciado en IIS
echo  -----------------------------------------------
echo.
pause
exit /b 0
:error
echo.
echo  La operacion se detuvo. Revisa el error mostrado.
echo  No borres dist ni uses iisreset sin revisar.
echo  Si fallaron las dependencias, ejecuta npm install.
echo.
pause
exit /b 1
