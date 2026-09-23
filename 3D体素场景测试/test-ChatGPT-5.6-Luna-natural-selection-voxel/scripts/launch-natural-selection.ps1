$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot "dist"
$url = "http://127.0.0.1:4175/"
$indexPath = Join-Path $distRoot "index.html"

if (-not (Test-Path -LiteralPath $indexPath)) {
  Write-Error "dist/index.html was not found. Build the project first."
  exit 1
}

function Test-LocalPage {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-LocalPage)) {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if (-not $python) {
    Write-Error "Python is required to start the local page server."
    exit 1
  }

  $serverProcess = Start-Process `
    -WindowStyle Hidden `
    -FilePath $python.Source `
    -ArgumentList @("-m", "http.server", "4175", "--bind", "127.0.0.1") `
    -WorkingDirectory $distRoot `
    -PassThru

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (Test-LocalPage) { break }
    Start-Sleep -Milliseconds 250
  }
}

if (-not (Test-LocalPage)) {
  if ($serverProcess) { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue }
  Write-Error "The local page server did not start on port 4175."
  exit 1
}

Start-Process $url

# Keep the parent launcher alive so Windows does not clean up the child server
# when the one-click command window exits.
if ($serverProcess) {
  Wait-Process -Id $serverProcess.Id
}
