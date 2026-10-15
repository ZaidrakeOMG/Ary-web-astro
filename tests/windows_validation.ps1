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
$requiredHeaders=@('X-Content-Type-Options','X-Frame-Options','X-XSS-Protection','Referrer-Policy','Permissions-Policy','Strict-Transport-Security','Cross-Origin-Opener-Policy','Cross-Origin-Resource-Policy','Origin-Agent-Cluster','X-DNS-Prefetch-Control','X-Permitted-Cross-Domain-Policies','Content-Security-Policy')
foreach($name in $requiredHeaders){
 $h=$doc.SelectSingleNode("/configuration/system.webServer/httpProtocol/customHeaders/add[@name='$name']")
 if(-not $h -or -not $h.value){throw "Missing security header: $name"}
}
$csp=$doc.SelectSingleNode('/configuration/system.webServer/httpProtocol/customHeaders/add[@name="Content-Security-Policy"]').value
if($csp -notmatch "script-src 'self'" -or $csp -match "script-src 'self' 'unsafe-inline'" -or $csp -notmatch "script-src-attr 'none'" -or $csp -notmatch "require-trusted-types-for 'script'"){throw 'CSP is not hardened'}
$filter=$doc.SelectSingleNode('/configuration/system.webServer/security/requestFiltering')
if(-not $filter -or $filter.removeServerHeader -ne 'true' -or $filter.allowDoubleEscaping -ne 'false'){throw 'Missing hardened requestFiltering attributes'}
$limit=$filter.SelectSingleNode('requestLimits')
if(-not $limit -or $limit.maxAllowedContentLength -ne '5242880' -or $limit.maxUrl -ne '2048' -or $limit.maxQueryString -ne '1024'){throw 'Missing hardened IIS request limits'}
foreach($verb in @('GET','HEAD','POST','OPTIONS')){
 $v=$filter.SelectSingleNode("verbs/add[@verb='$verb'][@allowed='true']")
 if(-not $v){throw "Missing allowed verb: $verb"}
}
foreach($name in @('ARY Security Reject Unexpected Host','ARY Security Redirect HTTP to canonical HTTPS','ARY Security Redirect apex to WWW','ARY Security Block Scanner Paths')){
 if(-not $doc.SelectSingleNode("/configuration/system.webServer/rewrite/rules/rule[@name='$name']")){throw "Missing security rule: $name"}
}
if($doc.SelectSingleNode('/configuration/system.webServer/rewrite/rules/rule[@name="Redirect HTTP to HTTPS"]')){throw 'Legacy Host-header redirect still present'}
$src=Get-Content scripts/publicar-astro-iis.ps1 -Raw
foreach($required in @('CloneNode($true)','Assert-NoDuplicateDefaults','X-ARY-Release','Content-Security-Policy','removeServerHeader','allowDoubleEscaping','starts-with(@name,"ARY Security")','previousPath','api/facturacion/opciones')) {
 if(-not $src.Contains($required)){throw "Deployment guard missing: $required"}
}
Write-Host 'PASS XML and publication guard checks. Real IIS/Polaris was NOT started.'

# The browser normalizes line endings before verifying the CSP inline hash.
$golden=[IO.File]::ReadAllText((Join-Path $PWD 'legacy/billing-original.htm'))
if($golden.Contains("`r")){throw 'Billing reference must use LF line endings on Windows'}
Write-Host 'PASS LF billing reference on Windows; CSP input remains byte-identical.'
