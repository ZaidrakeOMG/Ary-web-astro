param([string]$SiteName)
$ErrorActionPreference = 'Stop'
$Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Ejecuta CONECTAR_IA_IIS.bat como administrador.' }
Import-Module WebAdministration -ErrorAction Stop
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$Sites = @(Get-Website | Where-Object {
    $Physical = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($_.physicalPath)).TrimEnd('\')
    ($Physical -eq $Root -or $Physical.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) -and
    ([string]::IsNullOrWhiteSpace($SiteName) -or $_.Name -eq $SiteName)
})
if ($Sites.Count -ne 1) { throw 'No se encontro exactamente un sitio IIS asociado a este proyecto. No se modifico nada.' }
$Site = $Sites[0]
$Active = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Site.physicalPath))
$ConfigPath = Join-Path $Active 'web.config'
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw 'El sitio activo no tiene web.config. No se modifico nada.' }
# Health check only. This does NOT generate an AI response or any invoice.
$Health = Invoke-RestMethod -Uri 'http://127.0.0.1:8786/api/asistente/salud' -Method Get -TimeoutSec 4
if ($Health.ready -ne $true) { throw 'Primero configura e inicia INICIAR_IA_ARY.bat. El servicio no esta listo.' }
$Hash = (Get-FileHash -LiteralPath $ConfigPath -Algorithm SHA256).Hash
$Doc = New-Object System.Xml.XmlDocument
$Doc.PreserveWhitespace = $true
$Doc.Load($ConfigPath)
$Rules = $Doc.SelectSingleNode('/configuration/system.webServer/rewrite/rules')
if (-not $Rules) { throw 'Faltan las reglas Rewrite/ARR del sitio. Se requiere revision manual; no se modifico nada.' }
$Existing = $Rules.SelectSingleNode("rule[@name='ARY Asistente IA']")
if ($Existing) {
    if ($Existing.SelectSingleNode('match').GetAttribute('url') -eq '^api/asistente/(salud|chat)$' -and
        $Existing.SelectSingleNode('action').GetAttribute('url') -eq 'http://127.0.0.1:8786/api/asistente/{R:1}') {
        Write-Host 'La regla del asistente ya existe. No se reescribio web.config.'
        exit 0
    }
    throw 'Ya existe una regla del asistente con otra configuracion. No se reemplazo.'
}
$BillingRule = $Rules.SelectSingleNode("rule[@name='ARY Portal Facturacion API']")
$BillingXml = if ($BillingRule) { $BillingRule.OuterXml } else { $null }
$NewRule = $Doc.CreateElement('rule')
$NewRule.SetAttribute('name', 'ARY Asistente IA'); $NewRule.SetAttribute('stopProcessing', 'true')
$Match = $Doc.CreateElement('match'); $Match.SetAttribute('url', '^api/asistente/(salud|chat)$')
$Action = $Doc.CreateElement('action'); $Action.SetAttribute('type', 'Rewrite')
$Action.SetAttribute('url', 'http://127.0.0.1:8786/api/asistente/{R:1}')
$Action.SetAttribute('appendQueryString', 'false')
[void]$NewRule.AppendChild($Match); [void]$NewRule.AppendChild($Action)
[void]$Rules.PrependChild($NewRule)
Write-Host "Sitio: $($Site.Name)"
Write-Host "Configuracion activa: $ConfigPath"
Write-Host 'Se agregara SOLO /api/asistente/. No se cambia la regla de facturacion ni se reinicia IIS.'
$Confirmation = Read-Host 'Escribe CONECTAR para continuar'
if ($Confirmation -cne 'CONECTAR') { Write-Host 'Cancelado, sin cambios.'; exit 0 }
$BackupDir = Join-Path $env:LOCALAPPDATA 'ARY\asistente-ia\respaldos'
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
$Backup = Join-Path $BackupDir ('web.config-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N') + '.bak')
# Generate candidate outside the public web root; preserve the active file for rollback.
$Candidate = Join-Path $BackupDir ([Guid]::NewGuid().ToString('N') + '.xml')
try {
    $Doc.Save($Candidate)
    $Check = New-Object System.Xml.XmlDocument; $Check.PreserveWhitespace = $true; $Check.Load($Candidate)
    $CheckBilling = $Check.SelectSingleNode("/configuration/system.webServer/rewrite/rules/rule[@name='ARY Portal Facturacion API']")
    if ($BillingXml -and (!$CheckBilling -or $CheckBilling.OuterXml -cne $BillingXml)) { throw 'La validacion de facturacion fallo. No se modifico nada.' }
    if ((Get-FileHash -LiteralPath $ConfigPath -Algorithm SHA256).Hash -ne $Hash) { throw 'web.config cambio durante la operacion. No se modifico nada.' }
    Copy-Item -LiteralPath $ConfigPath -Destination $Backup
    # File.Replace requires the same volume. Both paths are normally on C:, otherwise stop safely.
    if ([IO.Path]::GetPathRoot($Candidate) -ne [IO.Path]::GetPathRoot($ConfigPath)) { throw 'El respaldo y el sitio estan en unidades distintas. Requiere revision manual.' }
    [IO.File]::Replace($Candidate, $ConfigPath, $null)
    Write-Host "Regla agregada. Respaldo: $Backup"
    Write-Host 'Valida en la pagina /api/asistente/salud y luego envia una pregunta general en el chat.'
    Write-Host 'Si IIS marca error, restaura ESTE respaldo al MISMO web.config antes de continuar.'
} finally { if (Test-Path -LiteralPath $Candidate) { Remove-Item -LiteralPath $Candidate -Force } }
