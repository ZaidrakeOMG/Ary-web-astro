# Inicia SOLO el sitio IIS asociado con esta carpeta.
# No reinicia IIS, no toca bindings y no modifica los servicios del bot.
$ErrorActionPreference = 'Stop'
try {
    $root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
    $appcmd = Join-Path $env:windir 'System32\inetsrv\appcmd.exe'
    if (-not (Test-Path $appcmd)) {
        throw 'IIS no esta instalado o faltan sus herramientas de administracion.'
    }
    Import-Module WebAdministration -ErrorAction Stop

    $sites = @()
    foreach ($site in @(Get-Website)) {
        $configured = [Environment]::ExpandEnvironmentVariables([string]$site.physicalPath)
        if (-not $configured) { continue }
        try {
            $physical = [IO.Path]::GetFullPath($configured).TrimEnd('\')
        } catch { continue }
        # Admite IIS apuntando directamente a grupoary o a una carpeta padre.
        if ($root -ieq $physical -or $root.StartsWith($physical + '\', [StringComparison]::OrdinalIgnoreCase)) {
            $relative = $root.Substring($physical.Length).Trim('\').Replace('\', '/')
            $sites += [pscustomobject]@{ Site=$site; Relative=$relative; Physical=$physical }
        }
    }
    if ($sites.Count -eq 0) {
        Write-Host "Carpeta actual: $root" -ForegroundColor Yellow
        Write-Host 'No se encontro un sitio IIS asociado con esta carpeta.' -ForegroundColor Yellow
        Write-Host 'Configura la ruta fisica del sitio desde el Administrador de IIS.'
        exit 2
    }

    # Si hay varios, preferir el sitio cuya raiz es esta misma carpeta.
    $match = $sites | Sort-Object { $_.Relative.Length } | Select-Object -First 1
    $siteName = [string]$match.Site.Name
    $siteNameSafe = $siteName.Replace("'", "''")
    $poolProperty = Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter "system.applicationHost/sites/site[@name='$siteNameSafe']/application[@path='/']" -Name 'applicationPool' -ErrorAction SilentlyContinue
    $poolName = [string]$poolProperty.Value
    if ($poolName -and (Test-Path "IIS:\AppPools\$poolName")) {
        if ((Get-WebAppPoolState -Name $poolName).Value -ne 'Started') {
            Start-WebAppPool -Name $poolName
            Write-Host "Application Pool iniciado: $poolName" -ForegroundColor Green
        }
    }

    if ((Get-Website -Name $siteName).State -ne 'Started') {
        Start-Website -Name $siteName
        Write-Host "Sitio iniciado: $siteName" -ForegroundColor Green
    } else {
        Write-Host "Sitio ya activo: $siteName" -ForegroundColor Green
    }

    $bindings = @(Get-WebBinding -Name $siteName)
    $preferred = $bindings | Where-Object { $_.protocol -eq 'https' } | Select-Object -First 1
    if (-not $preferred) { $preferred = $bindings | Select-Object -First 1 }
    $url = $null
    if ($preferred) {
        $parts = ([string]$preferred.bindingInformation).Split(':')
        $port = $parts[1]
        $hostName = $parts[2]
        if (-not $hostName -or $hostName -eq '*') { $hostName = 'localhost' }
        $scheme = [string]$preferred.protocol
        $portSuffix = if (($scheme -eq 'https' -and $port -eq '443') -or ($scheme -eq 'http' -and $port -eq '80')) { '' } else { ":$port" }
        $relativeUrl = if ($match.Relative) { $match.Relative + '/' } else { '' }
        $url = "${scheme}://${hostName}${portSuffix}/${relativeUrl}default.htm"
    }
    Write-Host "Ruta: $root"
    Write-Host 'IIS listo. El bot de Polaris es un servicio independiente.'
    if ($url) {
        Write-Host "Abriendo: $url" -ForegroundColor Cyan
        Start-Process $url
    }
    exit 0
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Ejecuta el .bat como administrador y comprueba que el sitio IIS exista.'
    exit 1
}
