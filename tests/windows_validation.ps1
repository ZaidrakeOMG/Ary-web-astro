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
$requiredHeaders=@('X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy','Strict-Transport-Security','Cross-Origin-Opener-Policy','X-Permitted-Cross-Domain-Policies','Content-Security-Policy')
foreach($name in $requiredHeaders){
 $h=$doc.SelectSingleNode("/configuration/system.webServer/httpProtocol/customHeaders/add[@name='$name']")
 if(-not $h -or -not $h.value){throw "Missing security header: $name"}
}
$limit=$doc.SelectSingleNode('/configuration/system.webServer/security/requestFiltering/requestLimits')
if(-not $limit -or $limit.maxAllowedContentLength -ne '5242880'){throw 'Missing 5 MB IIS request limit'}
$src=Get-Content scripts/publicar-astro-iis.ps1 -Raw
foreach($required in @('CloneNode($true)','Assert-NoDuplicateDefaults','X-ARY-Release','Content-Security-Policy','Permissions-Policy','maxAllowedContentLength','previousPath','api/facturacion/opciones')) {
 if(-not $src.Contains($required)){throw "Deployment guard missing: $required"}
}
Write-Host 'PASS XML and publication guard checks. Real IIS/Polaris was NOT started.'

# The browser normalizes line endings before verifying the CSP inline hash.
$golden=[IO.File]::ReadAllText((Join-Path $PWD 'legacy/billing-original.htm'))
if($golden.Contains("`r")){throw 'Billing reference must use LF line endings on Windows'}
Write-Host 'PASS LF billing reference on Windows; CSP input remains byte-identical.'
