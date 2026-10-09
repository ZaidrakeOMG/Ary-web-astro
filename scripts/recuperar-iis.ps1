$ErrorActionPreference='Stop'
try {
 Import-Module WebAdministration
 $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
 $file=Join-Path $root '.ary-last-deployment.json'
 if(-not(Test-Path -LiteralPath $file)){throw 'No se encontro un registro de publicacion anterior.'}
 $s=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
 if(-not(Test-Path -LiteralPath $s.previousPath)){throw 'La carpeta anterior ya no existe.'}
 $site=Get-Website -Name $s.site
 if(-not $site){throw 'No se encontro el sitio registrado.'}
 if([string]$site.physicalPath -ine [string]$s.releasePath){throw 'La ruta activa cambio desde la ultima publicacion. Revisa IIS antes de restaurar.'}
 Write-Host "Sitio: $($s.site)"
 Write-Host "Restaurar: $($s.previousPath)"
 $answer=Read-Host 'Escribe RESTAURAR para continuar'
 if($answer -cne 'RESTAURAR'){Write-Host 'Cancelado.';exit 0}
 Set-ItemProperty -Path ('IIS:\Sites\'+$s.site) -Name physicalPath -Value $s.previousPath
 Write-Host 'Version anterior restaurada. No se eliminaron archivos.' -ForegroundColor Green
 exit 0
}catch{Write-Host $_.Exception.Message -ForegroundColor Red;exit 1}
