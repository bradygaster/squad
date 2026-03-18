# Publish squad-sdk and squad-cli v0.8.21 to npm
# Requires: OTP code from authenticator app

param(
    [Parameter(Mandatory=$true)]
    [string]$OTP,
    [switch]$SkipBump
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Publishing Squad Packages v0.8.21" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Publish SDK first (CLI depends on it)
Write-Host "[1/2] Publishing @bradygaster/squad-sdk@0.8.21..." -ForegroundColor Yellow
Push-Location packages\squad-sdk
try {
    npm publish --access public --otp=$OTP
    if ($LASTEXITCODE -ne 0) {
        throw "SDK publish failed with exit code $LASTEXITCODE"
    }
    Write-Host "✓ SDK published successfully" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""

# Verify SDK is live
Write-Host "Verifying SDK on npm registry..." -ForegroundColor Yellow
$sdkVersion = npm view @bradygaster/squad-sdk version 2>&1
if ($sdkVersion -match "0.8.21") {
    Write-Host "✓ SDK verified: $sdkVersion" -ForegroundColor Green
} else {
    throw "SDK verification failed. Got: $sdkVersion"
}

Write-Host ""

# Publish CLI
Write-Host "[2/2] Publishing @bradygaster/squad-cli@0.8.21..." -ForegroundColor Yellow
Push-Location packages\squad-cli
try {
    npm publish --access public --otp=$OTP
    if ($LASTEXITCODE -ne 0) {
        throw "CLI publish failed with exit code $LASTEXITCODE"
    }
    Write-Host "✓ CLI published successfully" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""

# Verify CLI is live
Write-Host "Verifying CLI on npm registry..." -ForegroundColor Yellow
$cliVersion = npm view @bradygaster/squad-cli version 2>&1
if ($cliVersion -match "0.8.21") {
    Write-Host "✓ CLI verified: $cliVersion" -ForegroundColor Green
} else {
    throw "CLI verification failed. Got: $cliVersion"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Both packages published to npm!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "npm URLs:" -ForegroundColor Cyan
Write-Host "  - https://www.npmjs.com/package/@bradygaster/squad-sdk/v/0.8.21"
Write-Host "  - https://www.npmjs.com/package/@bradygaster/squad-cli/v/0.8.21"

if (-not $SkipBump) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Bumping to 0.8.22-preview.1" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # Bump all package.json files
    $packageFiles = @(
        "package.json",
        "packages\squad-sdk\package.json",
        "packages\squad-cli\package.json"
    )

    foreach ($file in $packageFiles) {
        Write-Host "Updating $file..." -ForegroundColor Yellow
        $content = Get-Content $file -Raw
        $content = $content -replace '"version": "0\.8\.21"', '"version": "0.8.22-preview.1"'
        Set-Content $file $content -NoNewline
        Write-Host "✓ Updated $file" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Committing version bump..." -ForegroundColor Yellow
    git add package.json packages/squad-sdk/package.json packages/squad-cli/package.json
    git commit -m "chore: bump to 0.8.22-preview.1 for continued development`n`nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
    if ($LASTEXITCODE -ne 0) {
        throw "Commit failed with exit code $LASTEXITCODE"
    }
    Write-Host "✓ Committed" -ForegroundColor Green

    Write-Host ""
    Write-Host "Pushing to dev..." -ForegroundColor Yellow
    git push origin dev
    if ($LASTEXITCODE -ne 0) {
        throw "Push failed with exit code $LASTEXITCODE"
    }
    Write-Host "✓ Pushed to dev" -ForegroundColor Green

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "✓ All done! Next version: 0.8.22-preview.1" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
}
