param([string]$SiteName = '', [switch]$UseCompiled)
# Isolated build -> versioned release -> one IIS path switch -> HTTP verification.
# Never POSTs a billing request, stops Polaris, resets IIS, or deletes a previous release.
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$oldPath = $null; $chosen = $null; $switched = $false; $release = $null
$oldOutDir = $env:ARY_OUT_DIR
function Load-Xml([string]$File) {
  $doc = New-Object System.Xml.XmlDocument
  $doc.PreserveWhitespace = $false
  $doc.Load($File)
  return ,$doc
}
function Ensure-Child($Doc, $Parent, [string]$Name) {
  $node=$Parent.SelectSingleNode($Name)
  if (-not $node) { $node=$Doc.CreateElement($Name); [void]$Parent.AppendChild($node) }
  return ,$node
}
function Normalize-Path([string]$Value) { return [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Value)).TrimEnd('\') }
function Assert-NoDuplicateDefaults($Doc) {
  $names=@($Doc.SelectNodes('/configuration/system.webServer/defaultDocument/files/add') | ForEach-Object { $_.GetAttribute('value').ToLowerInvariant() })
  if ($names.Count -ne 1 -or $names[0] -ne 'index.html') { throw 'La lista de documentos predeterminados no es valida. Se esperaba solamente index.html.' }
}
try {
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $principal=New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Ejecuta el BAT como administrador.' }
  Import-Module WebAdministration -ErrorAction Stop
  Set-Location -LiteralPath $root
  $releaseRoot=Join-Path $root '.ary-releases'
  $candidates=@(Get-Website | Where-Object {
    if ($SiteName) { $_.Name -eq $SiteName } else {
      $p=Normalize-Path ([string]$_.physicalPath)
      $p -ieq $root -or $p -ieq (Join-Path $root 'dist') -or $p.StartsWith($releaseRoot+'\',[StringComparison]::OrdinalIgnoreCase)
    }
  })
  if ($candidates.Count -ne 1) { throw 'No se encontro exactamente un sitio IIS para esta carpeta. No se cambio ningun sitio. Usa -SiteName con el nombre correcto desde PowerShell.' }
  $chosen=[string]$candidates[0].Name; $oldPath=Normalize-Path ([string]$candidates[0].physicalPath)
  $liveConfig=Join-Path $oldPath 'web.config'
  if (-not (Test-Path -LiteralPath $liveConfig)) { throw 'No se encontro la configuracion activa de IIS. Se detuvo para proteger la API.' }
  $live=Load-Xml $liveConfig
  $liveApi=$live.SelectSingleNode('/configuration/system.webServer/rewrite/rules/rule[@name="ARY Portal Facturacion API"]')
  if (-not $liveApi) { throw 'No se encontro la regla de facturacion en el sitio activo. No se publicara una configuracion generica.' }
  $apiBefore=$liveApi.OuterXml
  Write-Host "Sitio seleccionado: $chosen" -ForegroundColor Cyan
  Write-Host "La pagina actual seguira activa durante la preparacion: $oldPath"
  $stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  if ($UseCompiled) {
    $stage=Join-Path $root 'paquete-publicacion'
    $manifest=Join-Path $stage 'sha256-manifest.json'
    if (-not (Test-Path -LiteralPath $manifest)) { throw 'Falta el paquete compilado y validado. Extrae el ZIP completo o ejecuta INICIAR_ARY_IIS.bat.' }
    $entries=Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    foreach ($entry in $entries.PSObject.Properties) {
      $full=Normalize-Path (Join-Path $stage $entry.Name)
      if (-not $full.StartsWith((Normalize-Path $stage)+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta no valida en el manifiesto del paquete.' }
      if (-not (Test-Path -LiteralPath $full)) { throw "Falta un archivo del paquete: $($entry.Name)" }
      if ((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value) { throw "Un archivo no coincide con el paquete: $($entry.Name)" }
    }
    Write-Host 'Paquete compilado validado. No se necesita npm install.' -ForegroundColor Green
  } else {
    $node=Get-Command node.exe -ErrorAction Stop; $npm=Get-Command npm.cmd -ErrorAction Stop
    $nodeVersion=(& $node.Source -p 'process.versions.node').Trim()
    $major=[int]$nodeVersion.Split('.')[0]
    if ($major -lt 22) { throw 'Se requiere Node.js 22 actualizado o 24. La pagina actual no se cambio.' }
    if (-not (Test-Path 'package-lock.json')) { throw 'Falta package-lock.json. Actualiza el proyecto completo antes de compilar.' }
    $lockHash=(Get-FileHash 'package-lock.json' -Algorithm SHA256).Hash
    $cache=Join-Path $root '.ary-install-cache.txt'
    $same=Test-Path -LiteralPath $cache
    if ($same) { $same=((Get-Content -LiteralPath $cache -Raw).Trim() -eq $lockHash) }
    if (-not $same -or -not (Test-Path 'node_modules\astro\astro.js')) {
      Write-Host '[1/4] Instalando dependencias fijadas...' -ForegroundColor Cyan
      & $npm.Source ci --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw 'npm ci no termino correctamente. No se modifico IIS.' }
      [IO.File]::WriteAllText($cache,$lockHash)
    } else { Write-Host '[1/4] Las dependencias ya estan listas.' -ForegroundColor Green }
    $stage=Join-Path $root ('.ary-staging\'+$stamp)
    $env:ARY_OUT_DIR=$stage
    Write-Host '[2/4] Compilando en una carpeta separada...' -ForegroundColor Cyan
    & $npm.Source run build
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion. La pagina anterior permanece intacta.' }
    Write-Host '[3/4] Verificando formularios, enlaces y API...' -ForegroundColor Cyan
    & $npm.Source run test:integrity
    if ($LASTEXITCODE -ne 0) { throw 'La verificacion fallo. No se cambiara la ruta de IIS.' }
  }
  foreach ($name in @('index.html','facturacion\index.html','web.config','verification.json','release.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $stage $name))) { throw "Falta archivo requerido: $name" }
  }
  $releaseInfo=Get-Content -LiteralPath (Join-Path $stage 'release.json') -Raw | ConvertFrom-Json
  $expectedDesign=[string]$releaseInfo.design
  if (-not $expectedDesign -or $expectedDesign -notmatch '^ary-[a-zA-Z0-9._-]+$') { throw 'El paquete no contiene un identificador de version valido. No se modificara IIS.' }
  $template=Load-Xml (Join-Path $stage 'web.config'); Assert-NoDuplicateDefaults $template
  $release=Join-Path $releaseRoot $stamp
  [void](New-Item -Path $release -ItemType Directory -Force)
  Get-ChildItem -LiteralPath $stage -Force | Copy-Item -Destination $release -Recurse -Force
  # Preserve ALL local server configuration. Replace only our default document and our UI aliases.
  $merged=$live.CloneNode($true)
  $server=$merged.SelectSingleNode('/configuration/system.webServer')
  $oldDefault=$server.SelectSingleNode('defaultDocument')
  $newDefault=$merged.ImportNode($template.SelectSingleNode('/configuration/system.webServer/defaultDocument'),$true)
  if ($oldDefault) { [void]$server.ReplaceChild($newDefault,$oldDefault) } else { [void]$server.AppendChild($newDefault) }
  $rules=$server.SelectSingleNode('rewrite/rules')
  foreach ($item in @($rules.SelectNodes('rule[starts-with(@name,"ARY Astro")]'))) { [void]$rules.RemoveChild($item) }
  $after=$rules.SelectSingleNode('rule[@name="ARY Portal Facturacion API"]')
  foreach ($item in @($template.SelectNodes('/configuration/system.webServer/rewrite/rules/rule[starts-with(@name,"ARY Astro")]'))) {
    $added=$merged.ImportNode($item,$true); [void]$rules.InsertAfter($added,$after); $after=$added
  }
  $static=Ensure-Child $merged $server 'staticContent'
  foreach ($n in @($static.SelectNodes('*[@fileExtension=".webp"]'))) { [void]$static.RemoveChild($n) }
  $remove=$merged.CreateElement('remove');$remove.SetAttribute('fileExtension','.webp');[void]$static.AppendChild($remove)
  $mime=$merged.CreateElement('mimeMap');$mime.SetAttribute('fileExtension','.webp');$mime.SetAttribute('mimeType','image/webp');[void]$static.AppendChild($mime)
  $directory=Ensure-Child $merged $server 'directoryBrowse';$directory.SetAttribute('enabled','false')
  $protocol=Ensure-Child $merged $server 'httpProtocol';$headers=Ensure-Child $merged $protocol 'customHeaders'
  foreach ($n in @($headers.SelectNodes('*[@name="X-ARY-Release"]'))) { [void]$headers.RemoveChild($n) }
  $remove=$merged.CreateElement('remove');$remove.SetAttribute('name','X-ARY-Release');[void]$headers.AppendChild($remove)
  $h=$merged.CreateElement('add');$h.SetAttribute('name','X-ARY-Release');$h.SetAttribute('value',$stamp);[void]$headers.AppendChild($h)
  Assert-NoDuplicateDefaults $merged
  if ($merged.SelectSingleNode('/configuration/system.webServer/rewrite/rules/rule[@name="ARY Portal Facturacion API"]').OuterXml -ne $apiBefore) { throw 'La regla original de facturacion cambio. Publicacion cancelada.' }
  $merged.Save((Join-Path $release 'web.config'))
  # The release manifest validates the input package, not the locally merged configuration.
  $appcmd=Join-Path $env:windir 'System32\inetsrv\appcmd.exe'
  & $appcmd add backup ('ARY-Pro-'+$stamp)
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo respaldar IIS. No se cambiara el sitio.' }
  $state=@{ site=$chosen; previousPath=$oldPath; releasePath=$release; created=$stamp }
  $state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root '.ary-last-deployment.json') -Encoding UTF8
  Write-Host '[4/4] Activando la nueva version...' -ForegroundColor Cyan
  Set-ItemProperty -Path ('IIS:\Sites\'+$chosen) -Name physicalPath -Value $release
  $switched=$true
  $pool=[string](Get-Item ('IIS:\Sites\'+$chosen)).applicationPool
  if ($pool -and (Get-WebAppPoolState -Name $pool).Value -ne 'Started') { Start-WebAppPool -Name $pool }
  if ((Get-Website -Name $chosen).State -ne 'Started') { Start-Website -Name $chosen }
  $binding=@(Get-WebBinding -Name $chosen -Protocol 'https' | Where-Object { $_.bindingInformation -match ':www\.grupoary\.com\.mx$' }) | Select-Object -First 1
  if (-not $binding) { $binding=Get-WebBinding -Name $chosen -Protocol 'https' | Select-Object -First 1 }
  if (-not $binding -or [string]$binding.bindingInformation -notmatch '^(.*):(\d+):([^:]*)$') { throw 'No se encontro un binding HTTPS valido para verificar el sitio.' }
  $port=$Matches[2];$hostName=$Matches[3]
  if (-not $hostName) { $hostName='www.grupoary.com.mx' }
  $url='https://'+$hostName+$(if($port -ne '443'){':'+$port}else{''})+'/'
  $verified=$false
  for($attempt=0;$attempt -lt 3;$attempt++) {
    try {
      $response=Invoke-WebRequest -Uri ($url+'?ary_check='+$stamp) -UseBasicParsing -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'}
      if ($response.StatusCode -eq 200 -and $response.Headers['X-ARY-Release'] -eq $stamp -and $response.Content.Contains($expectedDesign)) { $verified=$true;break }
    } catch { Write-Host 'Esperando respuesta del sitio HTTPS...' -ForegroundColor Yellow }
    Start-Sleep -Seconds 2
  }
  if (-not $verified) { throw 'La verificacion HTTPS no confirmo la version nueva. Se restaurara la ruta anterior.' }
  try {
    $api=Invoke-WebRequest -Uri ($url+'api/facturacion/opciones') -UseBasicParsing -TimeoutSec 15
    $options=$api.Content | ConvertFrom-Json
    if (-not $options.csrf -or -not $options.estaciones) { throw 'Respuesta de opciones inesperada' }
    Write-Host 'API: opciones disponibles. No se emitio ninguna factura de prueba.' -ForegroundColor Green
  } catch { Write-Host 'AVISO: no se pudo verificar el API. Revisa el bot y su conectividad. Su regla se conservo sin cambios.' -ForegroundColor Yellow }
  Write-Host "LISTO: $url" -ForegroundColor Green
  Write-Host "Version publicada: $release"
  Write-Host "Version anterior conservada: $oldPath"
  Write-Host 'Puedes cerrar esta ventana; IIS sigue sirviendo la pagina.'
  try { Start-Process $url } catch { Write-Host 'Abre la direccion anterior en tu navegador.' }
  exit 0
} catch {
  Write-Host ('ERROR: '+$_.Exception.Message) -ForegroundColor Red
  if ($switched -and $chosen -and $oldPath) {
    try { Set-ItemProperty -Path ('IIS:\Sites\'+$chosen) -Name physicalPath -Value $oldPath;Write-Host "Ruta anterior restaurada: $oldPath" -ForegroundColor Yellow }
    catch { Write-Host "REVISA IIS: restaura manualmente la ruta $oldPath" -ForegroundColor Red }
  }
  Write-Host 'No se eliminaron las versiones anteriores ni se modifico Polaris.'
  exit 1
} finally { $env:ARY_OUT_DIR=$oldOutDir }
