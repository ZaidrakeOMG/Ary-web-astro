$ErrorActionPreference='Stop'
$failures=@()
foreach($file in Get-ChildItem -Path scripts -Filter '*.ps1') {
 $tokens=$null;$errors=$null
 [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
 if($errors.Count){$failures+=$errors}else{Write-Host "PASS PowerShell syntax: $($file.Name)"}
}
if($failures.Count){$failures|Format-List;throw 'PowerShell parsing failed'}
[xml]$doc=Get-Content -LiteralPath public/web.config -Raw
$docs=@($doc.SelectNodes('/configuration/system.webServer/defaultDocument/files/add'))
if($docs.Count -ne 1 -or $docs[0].value -ne 'index.html'){throw 'Duplicate or missing default document'}
$api=$doc.SelectSingleNode('/configuration/system.webServer/rewrite/rules/rule[@name="ARY Portal Facturacion API"]')
if(-not $api){throw 'Missing API rule'}
$requiredHeaders=@('X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy','Strict-Transport-Security','Cross-Origin-Opener-Policy','Cross-Origin-Resource-Policy','Origin-Agent-Cluster','X-Download-Options','X-Permitted-Cross-Domain-Policies','Content-Security-Policy')
foreach($name in $requiredHeaders){
 $h=$doc.SelectSingleNode("/configuration/system.webServer/httpProtocol/customHeaders/add[@name='$name']")
 if(-not $h -or -not $h.value){throw "Missing security header: $name"}
}
$filter=$doc.SelectSingleNode('/configuration/system.webServer/security/requestFiltering')
$limit=$filter.SelectSingleNode('requestLimits')
if(-not $filter -or $filter.removeServerHeader -ne 'true'){throw 'Server header removal missing'}
if(-not $limit -or $limit.maxAllowedContentLength -ne '5242880' -or $limit.maxUrl -ne '2048' -or $limit.maxQueryString -ne '1024'){throw 'IIS request limits missing'}
foreach($verb in @('TRACE','TRACK','CONNECT','PUT','DELETE','PATCH','PROPFIND','PROPPATCH','MKCOL','COPY','MOVE','LOCK','UNLOCK')){
 $node=$filter.SelectSingleNode("verbs/add[@verb='$verb'][@allowed='false']")
 if(-not $node){throw "Dangerous HTTP verb not blocked: $verb"}
}
foreach($segment in @('.git','.github','.ary-releases','.ary-staging','node_modules','server','scripts','tests','legacy','docs','paquete-publicacion')){
 if(-not $filter.SelectSingleNode("hiddenSegments/add[@segment='$segment']")){throw "Sensitive IIS segment not hidden: $segment"}
}
foreach($ext in @('.env','.config','.ps1','.bat','.py','.mjs','.ts','.map','.sql','.sqlite','.sqlite3','.db','.log','.bak','.old','.zip','.rar','.7z','.key','.pem','.pfx','.p12','.json')){
 if(-not $filter.SelectSingleNode("fileExtensions/add[@fileExtension='$ext'][@allowed='false']")){throw "Sensitive extension not blocked: $ext"}
}
$src=Get-Content scripts/publicar-astro-iis.ps1 -Raw
foreach($required in @('CloneNode($true)','Assert-NoDuplicateDefaults','X-ARY-Release','Content-Security-Policy','Permissions-Policy','Cross-Origin-Resource-Policy','removeServerHeader','maxAllowedContentLength','maxQueryString','hiddenSegments','fileExtensions','previousPath','api/facturacion/opciones')) {
 if(-not $src.Contains($required)){throw "Deployment guard missing: $required"}
}
Write-Host 'PASS XML and publication guard checks. Real IIS/Polaris was NOT started.'

# The browser normalizes line endings before verifying the CSP inline hash.
$golden=[IO.File]::ReadAllText((Join-Path $PWD 'legacy/billing-original.htm'))
if($golden.Contains("`r")){throw 'Billing reference must use LF line endings on Windows'}
Write-Host 'PASS LF billing reference on Windows; CSP input remains byte-identical.'
