param([switch]$Configurar)
$ErrorActionPreference = 'Stop'
# This secret stays in the current Windows profile, outside Git and the IIS site.
$PrivateDir = Join-Path $env:LOCALAPPDATA 'ARY\asistente-ia'
$SecretPath = Join-Path $PrivateDir 'openai-key.xml'
if ($Configurar) {
    Write-Host 'Configurar IA de ARY. La API tiene consumo propio; revisa tus limites en el proveedor.'
    Write-Host 'No pegues la clave en un chat, en Git ni en una captura.'
    $SecureKey = Read-Host 'Clave API de OpenAI (entrada oculta)' -AsSecureString
    if ($SecureKey.Length -lt 20) { throw 'Clave vacia o demasiado corta. No se guardo.' }
    New-Item -ItemType Directory -Path $PrivateDir -Force | Out-Null
    $SecureKey | Export-Clixml -LiteralPath $SecretPath
    Write-Host 'Clave cifrada guardada para este usuario de Windows. No se probo contra OpenAI.'
    Write-Host 'Ejecuta INICIAR_IA_ARY.bat con el mismo usuario. No modifica IIS ni el bot.'
    exit 0
}
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$Server = Join-Path $PSScriptRoot '..\server\ary-ai.mjs'
$PreviousKey = $env:OPENAI_API_KEY
$Pointer = [IntPtr]::Zero
try {
    if (Test-Path -LiteralPath $SecretPath) {
        $SecureKey = Import-Clixml -LiteralPath $SecretPath
        $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureKey)
        $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
    }
    if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) { throw 'Primero ejecuta CONFIGURAR_IA_ARY.bat con este usuario.' }
    Write-Host 'Servicio de IA independiente. No cierres esta ventana mientras lo uses.'
    & $Node $Server
    $NodeExit = $LASTEXITCODE
    if ($NodeExit -ne 0) { throw "El servicio termino con codigo $NodeExit." }
} finally {
    $env:OPENAI_API_KEY = $PreviousKey
    if ($Pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }
}
