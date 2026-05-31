$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root
$url = "http://127.0.0.1:5273"

function Test-GameServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 1
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Start-BrowserWhenReady {
  $waitScript = @"
`$url = "$url"
for (`$i = 0; `$i -lt 80; `$i++) {
  try {
    `$response = Invoke-WebRequest -UseBasicParsing `$url -TimeoutSec 1
    if (`$response.StatusCode -ge 200 -and `$response.StatusCode -lt 500) {
      Start-Process `$url
      exit 0
    }
  } catch {}
  Start-Sleep -Milliseconds 500
}
Start-Process `$url
"@

  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($waitScript))
  Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded
}

Write-Host ""
Write-Host "TabletopRPG launcher"
Write-Host "Project: $root"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was not found. Please install Node.js first: https://nodejs.org/"
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm was not found. Please reinstall Node.js with npm enabled."
  exit 1
}

if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Write-Host "Dependencies are missing. Running npm install..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  Write-Host ""
}

if (Test-GameServer) {
  Write-Host "The game server is already running."
  Write-Host "Opening browser: $url"
  Start-Process $url
  exit 0
}

Write-Host "Starting the game..."
Write-Host "The browser will open automatically when the server is ready."
Write-Host "If it does not, visit: $url"
Write-Host ""
Write-Host "Keep this window open while playing. Close it to stop the game server."
Write-Host ""

Start-BrowserWhenReady
npm run start:game
exit $LASTEXITCODE
