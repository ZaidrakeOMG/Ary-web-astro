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
$src=Get-Content scripts/publicar-astro-iis.ps1 -Raw
foreach($required in @('CloneNode($true)','Assert-NoDuplicateDefaults','X-ARY-Release','previousPath','api/facturacion/opciones')) {
 if(-not $src.Contains($required)){throw "Deployment guard missing: $required"}
}
Write-Host 'PASS XML and publication guard checks. Real IIS/Polaris was NOT started.'
