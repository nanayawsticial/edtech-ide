$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$apiPath = Join-Path $repoRoot 'apps\api'
$webPath = Join-Path $repoRoot 'apps\web'

if (!(Test-Path $apiPath)) {
    Write-Host "API path not found: $apiPath"
    exit 1
}

if (!(Test-Path $webPath)) {
    Write-Host "Web path not found: $webPath"
    exit 1
}

function Read-JwtSecretFromFile {
    param([string]$Path)

    if (!(Test-Path $Path)) {
        return $null
    }

    $line = Get-Content $Path | Where-Object { $_ -match '^\s*JWT_SECRET\s*=' } | Select-Object -First 1
    if (-not $line) {
        return $null
    }

    return ($line -replace '^\s*JWT_SECRET\s*=\s*', '').Trim().Trim('"').Trim("'")
}

if (-not $env:JWT_SECRET) {
    $env:JWT_SECRET = Read-JwtSecretFromFile (Join-Path $apiPath '.env')
}

if (-not $env:JWT_SECRET) {
    $env:JWT_SECRET = Read-JwtSecretFromFile (Join-Path $webPath '.env.local')
}

if (-not $env:JWT_SECRET) {
    $env:JWT_SECRET = 'dev-secret'
}

if (-not $env:PORT) {
    $env:PORT = '4000'
}

$apiCommand = "cd /d `"$apiPath`"; `$env:JWT_SECRET='$($env:JWT_SECRET)'; `$env:PORT='$($env:PORT)'; npm run dev"

Write-Host "Starting API in a new window..."
Start-Process -FilePath 'powershell' -ArgumentList '-NoExit', '-Command', $apiCommand -WorkingDirectory $apiPath

Write-Host "Starting web dev server in this window..."
Set-Location $webPath
npm run dev
