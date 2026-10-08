# Only recognized delivery files in the explicitly supplied directory are pruned.
function Remove-ObsoleteApkArtifacts {
    param([Parameter(Mandatory)][string]$ArtifactDirectory, [Parameter(Mandatory)][string]$KeepApk)
    $ErrorActionPreference = 'Stop'
    $artifactRoot = (Resolve-Path -LiteralPath $ArtifactDirectory).Path.TrimEnd('\', '/')
    $keepPath = [IO.Path]::GetFullPath($KeepApk)
    if ([IO.Path]::GetDirectoryName($keepPath) -ne $artifactRoot -or
        [IO.Path]::GetFileName($keepPath) -notmatch '^Fog-TRPG-\d+\.\d+\.\d+(?:\.\d+)?\.apk$') {
        throw 'The verified APK must be a named release inside the artifact directory.'
    }
    if (!(Test-Path -LiteralPath $keepPath -PathType Leaf) -or !(Test-Path -LiteralPath "$keepPath.sha256" -PathType Leaf)) {
        throw 'Keep the previous packages until a release and its checksum exist.'
    }
    $checksum = (Get-Content -LiteralPath "$keepPath.sha256" -Raw).Split(' ')[0].Trim()
    $stream = [IO.File]::OpenRead($keepPath)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $actualHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hasher.Dispose() }
    if ($checksum -notmatch '^[a-fA-F0-9]{64}$' -or $actualHash -ne $checksum) {
        throw 'The new APK checksum must match before pruning older packages.'
    }
    $files = @(Get-ChildItem -LiteralPath $artifactRoot -File)
    $releases = @($files | Where-Object { $_.Name -match '^Fog-TRPG-(\d+\.\d+\.\d+(?:\.\d+)?)\.apk$' } |
        Sort-Object { [version]([regex]::Match($_.Name, '^Fog-TRPG-([0-9.]+)\.apk$').Groups[1].Value) } -Descending)
    # Two latest releases bound normal growth. An intentional older rebuild is also retained.
    $retained = @($releases | Select-Object -First 2 | ForEach-Object { $_.FullName }) + $keepPath
    $removedFiles = 0
    $removedBytes = 0L
    foreach ($file in $files) {
        $target = [IO.Path]::GetFullPath($file.FullName)
        if ([IO.Path]::GetDirectoryName($target) -ne $artifactRoot) { throw 'Artifact target escaped the intended directory.' }
        $remove = $file.Name -eq 'aligned-unsigned.apk' -or $file.Name -match '^Fog-TRPG-qa-tests\.apk(?:\.idsig|\.sha256)?$'
        if ($file.Name -match '^(Fog-TRPG-\d+\.\d+\.\d+(?:\.\d+)?\.apk)(\.sha256|\.idsig)?$') {
            $releasePath = Join-Path $artifactRoot $Matches[1]
            $remove = $Matches[2] -eq '.idsig' -or $retained -notcontains $releasePath
        }
        if (!$remove) { continue }
        Remove-Item -LiteralPath $target -Force
        $removedFiles++
        $removedBytes += $file.Length
    }
    [pscustomobject]@{ RemovedFiles = $removedFiles; RemovedBytes = $removedBytes; RetainedApks = @($releases | Where-Object { $retained -contains $_.FullName } | ForEach-Object { $_.Name }) }
}
