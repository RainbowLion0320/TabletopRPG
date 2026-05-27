$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

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

Write-Host "Starting the game..."
Write-Host "The browser should open automatically. If it does not, visit:"
Write-Host "http://127.0.0.1:5173"
Write-Host ""
Write-Host "Keep this window open while playing. Close it to stop the game server."
Write-Host ""

npm run start:game
exit $LASTEXITCODE
