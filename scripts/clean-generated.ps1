param([switch]$AudioSourceCache)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $PSScriptRoot 'artifact-retention.ps1')
$version = [regex]::Match((Get-Content -LiteralPath (Join-Path $projectRoot 'android/app/build.gradle') -Raw), 'versionName "([0-9.]+)"')
if (!$version.Success) { throw 'Cannot identify the current release.' }
$artifactRoot = Join-Path $projectRoot 'output/apk'
$apk = Join-Path $artifactRoot ("Fog-TRPG-" + $version.Groups[1].Value + '.apk')
Remove-ObsoleteApkArtifacts -ArtifactDirectory $artifactRoot -KeepApk $apk
if ($AudioSourceCache) {
    # Finished MP3s, licenses and provenance are authoritative in assets/audio.
    $outputRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'output')).TrimEnd('\', '/')
    $sourceCache = [IO.Path]::GetFullPath((Join-Path $outputRoot 'audio-source'))
    if ([IO.Path]::GetDirectoryName($sourceCache) -ne $outputRoot) { throw 'Source cache escaped the output directory.' }
    if (Test-Path -LiteralPath $sourceCache) {
        $cache = Get-Item -LiteralPath $sourceCache
        if ($cache.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Do not recursively prune a linked source directory.' }
        if (Get-ChildItem -LiteralPath $sourceCache -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Do not recursively prune a cache with linked entries.' }
        $bytes = (Get-ChildItem -LiteralPath $sourceCache -Recurse -File | Measure-Object Length -Sum).Sum
        Remove-Item -LiteralPath $sourceCache -Recurse -Force
        Write-Output "Removed regenerable audio source cache: $bytes bytes."
    }
}
