param(
    [Parameter(Mandatory)] [string] $PublicKey,
    [Parameter(Mandatory)] [string] $UpdatePublicKey,
    [Parameter(Mandatory)] [uri] $ActivationUrl,
    [string] $Python = ".build-env\Scripts\python.exe",
    [string] $MakeNsis = "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
    [string] $VlcDirectory = "$env:ProgramFiles\VideoLAN\VLC",
    [string] $WixTools = ".release-build\wix3141"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$Python = (Resolve-Path -LiteralPath $Python).Path
$PublicKey = (Resolve-Path -LiteralPath $PublicKey).Path
$UpdatePublicKey = (Resolve-Path -LiteralPath $UpdatePublicKey).Path
$MakeNsis = (Get-Command $MakeNsis -ErrorAction Stop).Source
$WixTools = (Resolve-Path -LiteralPath $WixTools).Path
$candle = Join-Path $WixTools "candle.exe"
$light = Join-Path $WixTools "light.exe"
$repo = (Get-Location).Path
$output = Join-Path $repo "entrega"
$build = Join-Path $repo ".release-build"
$site = Join-Path $output "instaladores"
$private = Join-Path $output "vendedor"
$appDir = Join-Path $build "dist\LeytechAsistente"
New-Item -ItemType Directory -Force $build,$site,$private | Out-Null

function Invoke-Python {
    & $Python @args
    if ($LASTEXITCODE) { throw "Python terminó con código $LASTEXITCODE." }
}

$key = (Get-Content -LiteralPath $PublicKey -Raw).Trim()
if ($key -notmatch '^[0-9a-fA-F]{64}$') { throw "Se necesita una clave pública Ed25519 en formato hexadecimal." }
$keyFile = Join-Path $build 'activation-public.txt'
[IO.File]::WriteAllText($keyFile, "$key`n", [Text.Encoding]::ASCII)
$localActivation = $ActivationUrl.Scheme -eq 'http' -and $ActivationUrl.Host -eq '127.0.0.1'
if (!$ActivationUrl.IsAbsoluteUri -or (!$localActivation -and $ActivationUrl.Scheme -ne 'https') -or
    $ActivationUrl.AbsolutePath -cne '/api/assistant/redeem' -or $ActivationUrl.Query -or
    $ActivationUrl.Fragment -or $ActivationUrl.UserInfo) { throw 'Se necesita la URL del canje de Leytech.' }
$activationFile = Join-Path $build 'activation-url.txt'
[IO.File]::WriteAllText($activationFile, "$($ActivationUrl.AbsoluteUri)`n", [Text.Encoding]::ASCII)
$icon = Join-Path $repo 'frontend\assets\leytech.ico'
$versionFile = Join-Path $repo 'VERSION'
$version = (Get-Content -LiteralPath $versionFile -Raw).Trim()
if ($version -notmatch '^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,3})$' -or
    ($version.Split('.') | Select-Object -First 2 | Where-Object { [int]$_ -gt 255 })) {
    throw 'Usa tres números de versión MSI, con los dos primeros entre 0 y 255.'
}
$updateKey = (Get-Content -LiteralPath $UpdatePublicKey -Raw).Trim()
if ($updateKey -notmatch '^[0-9a-fA-F]{64}$') { throw 'Se necesita la clave pública Ed25519 de actualizaciones.' }
$updateKeyFile = Join-Path $build 'update-public.txt'
[IO.File]::WriteAllText($updateKeyFile, "$updateKey`n", [Text.Encoding]::ASCII)
Invoke-Python -m backend.setup_voice_model
Invoke-Python -m backend.setup_voice_model --language en-US
$VlcDirectory = (Resolve-Path -LiteralPath $VlcDirectory).Path
foreach ($component in 'libvlc.dll','libvlccore.dll','plugins','COPYING.txt') {
    if (!(Test-Path -LiteralPath (Join-Path $VlcDirectory $component))) {
        throw "Falta $component en el reproductor que se va a empaquetar. Usa -VlcDirectory con una instalación completa de VLC x64."
    }
}
Invoke-Python -c "import struct,sys; from pathlib import Path; p=Path(sys.argv[1]); data=p.read_bytes(); offset=struct.unpack_from('<I',data,60)[0]; assert data[offset:offset+4]==b'PE\0\0' and struct.unpack_from('<H',data,offset+4)[0]==0x8664 and struct.calcsize('P')==8, 'La compilacion y las bibliotecas del reproductor deben ser x64'" (Join-Path $VlcDirectory 'libvlc.dll')

$requiredAssets = @('leytech-original.png', 'leytech.ico', 'leytech-dark.ico', 'discord-button-32.png', 'discord-button-48.png', 'discord-button-64.png')
foreach ($asset in $requiredAssets) {
    if (!(Test-Path -LiteralPath (Join-Path $repo "frontend/assets/$asset"))) { throw "Falta el recurso de interfaz: $asset" }
}

$common = @("-m", "PyInstaller", "--noconfirm", "--clean", "--windowed", "--noupx", "--paths", $repo, "--specpath", $build)
Invoke-Python @common --onedir --name LeytechAsistente --distpath "$build\dist" --workpath "$build\buyer" `
    --manifest "$repo\leytech.manifest" --icon $icon --add-data "$keyFile`:." --add-data "$activationFile`:." --add-data "$repo/.assistant_prompt.txt:." `
    --add-data "$updateKeyFile`:." --add-data "$versionFile`:." `
    --add-data "$repo/frontend/assets:frontend/assets" --add-data "$repo/backend/models:backend/models" `
    --collect-binaries vosk --hidden-import vosk --hidden-import pyaudio --hidden-import pyttsx3.drivers.sapi5 --collect-all yt_dlp `
    --hidden-import vlc --add-binary "$VlcDirectory/libvlc.dll:vlc" --add-binary "$VlcDirectory/libvlccore.dll:vlc" `
    --add-data "$VlcDirectory/plugins:vlc/plugins" --add-data "$VlcDirectory/COPYING.txt:vlc" frontend/gui.py

foreach ($asset in $requiredAssets) {
    if (!(Test-Path -LiteralPath (Join-Path $appDir "_internal/frontend/assets/$asset"))) { throw "El ejecutable no incluyó el recurso de interfaz: $asset" }
}

$resourceCheck = Start-Process -FilePath (Join-Path $appDir 'LeytechAsistente.exe') -ArgumentList '--verify-resources' -Wait -PassThru -WindowStyle Hidden
if ($resourceCheck.ExitCode -ne 0) { throw 'El ejecutable no incluye todos los módulos o recursos necesarios. Se cancela el instalador.' }

$playerCheck = Start-Process -FilePath (Join-Path $appDir 'LeytechAsistente.exe') -ArgumentList '--verify-player' -Wait -PassThru -WindowStyle Hidden
if ($playerCheck.ExitCode -ne 0) { throw 'El ejecutable generado no pudo iniciar el reproductor. No se generará el instalador.' }

$notices = Join-Path $appDir "Avisos-de-terceros"
Invoke-Python packaging/collect_notices.py $notices
Copy-Item -LiteralPath (Join-Path $VlcDirectory "COPYING.txt") -Destination (Join-Path $notices "VLC-COPYING.txt")
Copy-Item -LiteralPath packaging/third-party.txt -Destination (Join-Path $notices "LEEME.txt")
$oldIssuer = Join-Path $private 'LeytechEmisor.exe'
if (Test-Path -LiteralPath $oldIssuer) { Remove-Item -LiteralPath $oldIssuer }
Copy-Item -LiteralPath $notices -Destination $private -Recurse -Force

$sourceMsi = Join-Path $build "leytech.wxs"
$objectMsi = Join-Path $build "leytech.wixobj"
$msi = Join-Path $build "Leytech-Asistente-Windows-x64.msi"
Invoke-Python packaging/msi.py $appDir $icon $version $sourceMsi
& $candle -nologo -arch x64 -out $objectMsi $sourceMsi
if ($LASTEXITCODE) { throw "WiX Candle terminó con código $LASTEXITCODE." }
# ICE91 applies to per-machine payloads. Leytech only installs for the current user.
& $light -nologo -cultures:es-es -sice:ICE91 -out $msi $objectMsi
if ($LASTEXITCODE) { throw "WiX Light terminó con código $LASTEXITCODE." }

$installer = Join-Path $build "Leytech-Asistente-Windows-x64.exe"
& $MakeNsis /INPUTCHARSET UTF8 "/DAPP_MSI=$msi" "/DOUTPUT=$installer" "/DAPP_ICON=$icon" "/DAPP_VERSION=$version" "$PSScriptRoot\installer.nsi"
if ($LASTEXITCODE) { throw "NSIS terminó con código $LASTEXITCODE." }
Copy-Item -LiteralPath $installer,$msi -Destination $site
Copy-Item -LiteralPath packaging/OPERACION.md -Destination $private
Get-FileHash -LiteralPath $installer,$msi -Algorithm SHA256 | ForEach-Object {
    "$($_.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_.Path))"
} | Set-Content (Join-Path $site "SHA256.txt") -Encoding ascii
Write-Host "Descarga: $site"
Write-Host "Guía para el vendedor: $private"
