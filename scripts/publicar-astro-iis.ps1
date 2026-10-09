param([string]$SiteName = "")
# Publicación dirigida a un solo sitio. Requiere PowerShell de administrador.
# No hace iisreset ni reescribe bindings, certificados o reglas de API.
$ErrorActionPreference = "Stop"
$oldPhysicalPath = $null
$siteNameFound = $null
$changedSite = $false

try {
  Import-Module WebAdministration -ErrorAction Stop
  $root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..")).TrimEnd('\')
  $dist = [System.IO.Path]::GetFullPath((Join-Path $root "dist")).TrimEnd('\')
  $indexPath = Join-Path $dist "index.html"
  $billingPath = Join-Path $dist "ary_facturacion.htm"
  $configPath = Join-Path $dist "web.config"
  if (-not (Test-Path $indexPath)) { throw "Falta el archivo compilado dist\index.html." }
  if (-not (Test-Path $billingPath)) { throw "Falta dist\ary_facturacion.htm." }
  if (-not (Test-Path $configPath)) { throw "Falta dist\web.config." }
  $configContent = [System.IO.File]::ReadAllText($configPath)
  if (-not $configContent.Contains("api/facturacion") -or -not $configContent.Contains("index.html")) {
    throw "La configuracion de IIS no contiene el indice Astro y la ruta de facturacion."
  }

  $candidates = @()
  foreach ($site in @(Get-Website)) {
    if ($SiteName -and $site.Name -ne $SiteName) { continue }
    $physical = [Environment]::ExpandEnvironmentVariables([string]$site.PhysicalPath)
    if (-not $physical) { continue }
    try { $physical = [System.IO.Path]::GetFullPath($physical).TrimEnd('\') }
    catch { continue }
    # No modificar un sitio que use una carpeta padre u otra aplicacion.
    if (($physical -ieq $root) -or ($physical -ieq $dist)) {
      $candidates += [pscustomobject]@{ Name=[string]$site.Name; Physical=$physical }
    }
  }

  if ($candidates.Count -ne 1) {
    Write-Host "Proyecto: $root" -ForegroundColor Yellow
    Write-Host "Compilacion lista: $dist" -ForegroundColor Green
    Write-Host "No se detecto exactamente un sitio IIS cuya ruta fisica sea la carpeta del proyecto o dist." -ForegroundColor Yellow
    Write-Host "Abre Administrador de IIS y asigna la ruta fisica a: $dist" -ForegroundColor Cyan
    Write-Host "Conserva los bindings y el certificado SSL actuales."
    exit 2
  }
  $siteNameFound = $candidates[0].Name
  $oldPhysicalPath = $candidates[0].Physical
  $iisBackupName = "GrupoARY-Astro-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  $appcmd = Join-Path $env:windir "System32\inetsrv\appcmd.exe"
  if (-not (Test-Path $appcmd)) { throw "No estan instaladas las herramientas de IIS." }
  $backupProc = Start-Process -FilePath $appcmd -ArgumentList @("add","backup",$iisBackupName) -NoNewWindow -Wait -PassThru
  if ($backupProc.ExitCode -ne 0) { throw "No se pudo respaldar la configuracion de IIS. No se aplicaron cambios." }

  if ($oldPhysicalPath -ine $dist) {
    Set-ItemProperty -Path ("IIS:\Sites\" + $siteNameFound) -Name physicalPath -Value $dist -ErrorAction Stop
    $changedSite = $true
    Write-Host "Ruta fisica actualizada: $dist" -ForegroundColor Green
  }
  $site = Get-Website -Name $siteNameFound
  if ($site.State -ne "Started") {
    Start-Website -Name $siteNameFound -ErrorAction Stop
    Write-Host "Sitio IIS iniciado: $siteNameFound" -ForegroundColor Green
  } else {
    Write-Host "Sitio IIS activo: $siteNameFound" -ForegroundColor Green
  }

  $bindings = @(Get-WebBinding -Name $siteNameFound)
  $preferred = $bindings | Where-Object { $_.protocol -eq "https" } | Select-Object -First 1
  if (-not $preferred) { $preferred = $bindings | Select-Object -First 1 }
  Write-Host "Sitio: $siteNameFound"
  Write-Host "Compilado: $dist"
  Write-Host "Respaldo IIS: $iisBackupName"
  Write-Host "La facturacion usa el mismo web.config y la API original."
  if ($preferred) {
    $bindParts = ([string]$preferred.bindingInformation).Split(':')
    $port = $bindParts[1]
    $hostName = $bindParts[2]
    if (-not $hostName -or $hostName -eq "*") { $hostName = "localhost" }
    $scheme = [string]$preferred.protocol
    $suffix = if (($scheme -eq "https" -and $port -eq "443") -or ($scheme -eq "http" -and $port -eq "80")) { "" } else { ":" + $port }
    $url = $scheme + "://" + $hostName + $suffix + "/"
    Write-Host "Abriendo pagina: $url" -ForegroundColor Cyan
    Start-Process $url
  }
  exit 0
} catch {
  Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
  if ($changedSite -and $siteNameFound -and $oldPhysicalPath) {
    try {
      Set-ItemProperty -Path ("IIS:\Sites\" + $siteNameFound) -Name physicalPath -Value $oldPhysicalPath
      Write-Host ("Ruta IIS restaurada a: " + $oldPhysicalPath) -ForegroundColor Yellow
    } catch {
      Write-Host "No se pudo restaurar automaticamente la ruta del sitio. Revisa IIS." -ForegroundColor Red
    }
  }
  Write-Host "Ejecuta INICIAR_ARY_IIS.bat como administrador." -ForegroundColor Yellow
  exit 1
}
