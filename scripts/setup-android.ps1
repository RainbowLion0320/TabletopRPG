param([string]$ToolsRoot = $env:TABLETOP_ANDROID_TOOLS)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$ToolsRoot) {
    $localConfig = Join-Path $projectRoot '.android-local.json'
    $ToolsRoot = if (Test-Path -LiteralPath $localConfig) { (Get-Content -LiteralPath $localConfig -Raw | ConvertFrom-Json).toolsRoot } else { Join-Path $env:LOCALAPPDATA 'TabletopRPG\AndroidTools' }
}
$ToolsRoot = [IO.Path]::GetFullPath($ToolsRoot)
$downloadDir = Join-Path $ToolsRoot 'downloads'
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
function Read-FileHash([string]$Path, [string]$Algorithm) {
    $stream = [IO.File]::OpenRead($Path)
    $hasher = [Security.Cryptography.HashAlgorithm]::Create($Algorithm)
    try { return [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $hasher.Dispose() }
}
function Fetch-Zip([string]$Name, [string]$Url, [string]$Hash, [string]$Algorithm = 'SHA256') {
    $target = Join-Path $downloadDir $Name
    if (!(Test-Path -LiteralPath $target) -or (Read-FileHash $target $Algorithm) -ne $Hash) {
        & curl.exe --fail --location --retry 3 --connect-timeout 30 --output $target $Url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $Name" }
    }
    if ((Read-FileHash $target $Algorithm) -ne $Hash) { throw "Checksum mismatch: $Name" }
    return $target
}
$jdk = Join-Path $ToolsRoot 'jdk\jdk-21.0.12.1+1'
if (!(Test-Path -LiteralPath "$jdk\bin\java.exe")) {
    $zip = Fetch-Zip 'temurin21.zip' 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip' 'f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e'
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $ToolsRoot 'jdk') -Force
}
$gradle = Join-Path $ToolsRoot 'gradle\gradle-8.14.3'
if (!(Test-Path -LiteralPath "$gradle\bin\gradle.bat")) {
    $zip = Fetch-Zip 'gradle-8.14.3-bin.zip' 'https://services.gradle.org/distributions/gradle-8.14.3-bin.zip' 'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531'
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $ToolsRoot 'gradle') -Force
}
$sdk = Join-Path $ToolsRoot 'sdk'
$manager = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (!(Test-Path -LiteralPath $manager)) {
    $zip = Fetch-Zip 'commandlinetools-win-16111833_latest.zip' 'https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip' '57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d' 'SHA1'
    $unpacked = Join-Path $downloadDir 'commandline-unpacked'
    Expand-Archive -LiteralPath $zip -DestinationPath $unpacked -Force
    New-Item -ItemType Directory -Path (Split-Path -Parent (Split-Path -Parent $manager)) -Force | Out-Null
    Copy-Item -Path "$unpacked\cmdline-tools\*" -Destination (Join-Path $sdk 'cmdline-tools\latest') -Recurse -Force
}
$env:JAVA_HOME = $jdk
# SDK licenses are presented by Google's own installer for the developer to accept.
& $manager "--sdk_root=$sdk" --licenses
if ($LASTEXITCODE -ne 0) { throw 'Android SDK license acceptance did not finish.' }
& $manager "--sdk_root=$sdk" 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'build-tools;35.0.0'
if ($LASTEXITCODE -ne 0) { throw 'Android SDK installation failed.' }
@{ toolsRoot = $ToolsRoot } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot '.android-local.json') -Encoding utf8
Write-Output "Android tools ready in $ToolsRoot. Run npm run android:apk."
