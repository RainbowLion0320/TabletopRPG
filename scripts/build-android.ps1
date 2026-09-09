param([switch]$DebugBuild, [switch]$NativeTests, [string]$Device = $env:ANDROID_SERIAL)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$localConfig = Join-Path $projectRoot '.android-local.json'
$toolRoot = if ($env:TABLETOP_ANDROID_TOOLS) { $env:TABLETOP_ANDROID_TOOLS } elseif (Test-Path -LiteralPath $localConfig) { (Get-Content -LiteralPath $localConfig -Raw | ConvertFrom-Json).toolsRoot } else { Join-Path $env:LOCALAPPDATA 'TabletopRPG\AndroidTools' }
$toolRoot = [IO.Path]::GetFullPath($toolRoot)
$jdk = Join-Path $toolRoot 'jdk\jdk-21.0.12.1+1'
$sdk = Join-Path $toolRoot 'sdk'
$gradle = Join-Path $toolRoot 'gradle\gradle-8.14.3\bin\gradle.bat'
foreach ($required in @("$jdk\bin\java.exe", "$sdk\platforms\android-36\android.jar", "$sdk\build-tools\36.0.0\apksigner.bat", $gradle)) {
    if (!(Test-Path -LiteralPath $required)) { throw "Missing Android tool: $required. Run npm run android:setup first (see docs/ANDROID.md)." }
}
$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-cache'
Set-Content -LiteralPath android/local.properties -Value ('sdk.dir=' + $sdk.Replace('\','/')) -Encoding ascii
function Check-Exit([string]$step) { if ($LASTEXITCODE -ne 0) { throw "$step failed (exit $LASTEXITCODE)." } }
& npm.cmd run build:android:web
Check-Exit 'Android web build'
& npx.cmd cap sync android
Check-Exit 'Capacitor sync'

if ($NativeTests) {
    if (!$Device) { throw 'Set ANDROID_SERIAL to a dedicated test emulator. Native tests reset only this app''s test data.' }
    & $gradle --no-daemon -p android :app:assembleDebug :app:assembleDebugAndroidTest
    Check-Exit 'Android test build'
    $adb = Join-Path $sdk 'platform-tools\adb.exe'
    & $adb -s $Device install -r android/app/build/outputs/apk/debug/app-debug.apk
    Check-Exit 'Install test game'
    & $adb -s $Device install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
    Check-Exit 'Install test runner'
    $testOutput = & $adb -s $Device shell am instrument -w -r com.rainbowlion.fogtrpg.test/androidx.test.runner.AndroidJUnitRunner 2>&1
    $testOutput | Write-Output
    if (($testOutput -join "`n") -notmatch 'OK \(\d+ tests\)' -or ($testOutput -join "`n") -match 'FAILURES!!!|INSTRUMENTATION_FAILED') { throw 'Android instrumentation tests failed.' }
    exit 0
}
if ($DebugBuild) {
    & $gradle --no-daemon -p android :app:assembleDebug
    Check-Exit 'Android debug build'
    Write-Output (Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk')
    exit 0
}

$signing = Join-Path $toolRoot 'signing'
$keystore = Join-Path $signing 'fog-trpg-release.p12'
$passwordFile = Join-Path $signing 'release-password.txt'
if ((Test-Path -LiteralPath $keystore) -ne (Test-Path -LiteralPath $passwordFile)) { throw 'Signing files are incomplete. Restore the original key and password; do not generate a replacement key for an existing app.' }
if (!(Test-Path -LiteralPath $keystore)) {
    New-Item -ItemType Directory -Path $signing -Force | Out-Null
    $bytes = New-Object byte[] 36
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose()
    [IO.File]::WriteAllText($passwordFile, [Convert]::ToBase64String($bytes), (New-Object Text.UTF8Encoding($false)))
    & "$jdk\bin\keytool.exe" -genkeypair -keystore $keystore -storetype PKCS12 -alias fog-trpg -keyalg RSA -keysize 3072 -validity 10000 -storepass:file $passwordFile -keypass:file $passwordFile -dname 'CN=Fog TRPG, O=Rainbowlion, C=CN'
    Check-Exit 'Create release signing key'
    Write-Output "Created persistent release signing key in $signing. Back up this folder privately before distributing updates."
}
& $gradle --no-daemon -p android :app:assembleRelease
Check-Exit 'Android release build'
$artifactDir = Join-Path $projectRoot 'output\apk'
New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
$versionMatch = [regex]::Match((Get-Content android/app/build.gradle -Raw), 'versionName "([0-9.]+)"')
if (!$versionMatch.Success) { throw 'Cannot read the APK version.' }
$apk = Join-Path $artifactDir ("Fog-TRPG-" + $versionMatch.Groups[1].Value + '.apk')
$aligned = Join-Path $artifactDir 'aligned-unsigned.apk'
& "$sdk\build-tools\36.0.0\zipalign.exe" -f -p 4 android/app/build/outputs/apk/release/app-release-unsigned.apk $aligned
Check-Exit 'Align APK'
& "$sdk\build-tools\36.0.0\apksigner.bat" sign --ks $keystore --ks-key-alias fog-trpg --ks-pass "file:$passwordFile" --out $apk $aligned
Check-Exit 'Sign APK'
& "$sdk\build-tools\36.0.0\apksigner.bat" verify --verbose --print-certs $apk
Check-Exit 'Verify signed APK'
$badging = & "$sdk\build-tools\36.0.0\aapt.exe" dump badging $apk
Check-Exit 'Read APK manifest'
if (($badging -join "`n") -match 'application-debuggable' -or ($badging -join "`n") -notmatch "package: name='com.rainbowlion.fogtrpg'") { throw 'APK is debuggable or has an unexpected application id.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($apk)
try {
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName -match '\.map$|(^|/)\.env') { throw "Unexpected development file in APK: $($entry.FullName)" }
    }
    $entry = $archive.GetEntry('assets/capacitor.config.json')
    $reader = New-Object IO.StreamReader($entry.Open())
    try { $config = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($config.server.url -or $config.android.webContentsDebuggingEnabled -or $config.loggingBehavior -ne 'none') { throw 'APK must load local bundled assets with production logging/debugging settings.' }
} finally { $archive.Dispose() }
$stream = [IO.File]::OpenRead($apk)
$hasher = [Security.Cryptography.SHA256]::Create()
try { $hash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $hasher.Dispose() }
[IO.File]::WriteAllText("$apk.sha256", "$hash  $([IO.Path]::GetFileName($apk))`n", (New-Object Text.UTF8Encoding($false)))
Write-Output "APK: $apk"
Write-Output "SHA256: $hash"
