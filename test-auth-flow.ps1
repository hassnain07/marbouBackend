#!/usr/bin/env pwsh
# Quick test script to verify Phase 2 admin auth flow works end-to-end

$baseUrl = "http://localhost:3000"
$email = "sa@dev.marbou.test"
$password = "ChangeMe!2026#"

Write-Host "=== Testing Admin Auth Flow ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login
Write-Host "Step 1: Login..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body (@{email=$email; password=$password} | ConvertTo-Json) `
    -ErrorAction Stop

$mfaToken = $loginResponse.data.mfaToken
Write-Host "✓ MFA token received: $($mfaToken.Substring(0, 20))..." -ForegroundColor Green
Write-Host ""

# Step 2: Get TOTP
Write-Host "Step 2: Get TOTP code..." -ForegroundColor Yellow
$totpResponse = Invoke-RestMethod -Uri "$baseUrl/dev/admin/totp?email=$email" `
    -Method GET `
    -ErrorAction Stop

$totp = $totpResponse.data.totp
Write-Host "✓ TOTP code: $totp" -ForegroundColor Green
Write-Host ""

# Step 3: Verify 2FA
Write-Host "Step 3: Verify 2FA..." -ForegroundColor Yellow
$verifyResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/auth/2fa/verify" `
    -Method POST `
    -ContentType "application/json" `
    -Headers @{Authorization="Bearer $mfaToken"} `
    -Body (@{totp=$totp} | ConvertTo-Json) `
    -ErrorAction Stop

$accessToken = $verifyResponse.data.accessToken
$refreshToken = $verifyResponse.data.refreshToken
Write-Host "✓ Access token received: $($accessToken.Substring(0, 20))..." -ForegroundColor Green
Write-Host "✓ Refresh token received: $($refreshToken.Substring(0, 20))..." -ForegroundColor Green
Write-Host ""

# Step 4: Test authenticated request
Write-Host "Step 4: Test authenticated request (GET /admin/flags)..." -ForegroundColor Yellow
$flagsResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/flags" `
    -Method GET `
    -Headers @{Authorization="Bearer $accessToken"} `
    -ErrorAction Stop

Write-Host "✓ Got $($flagsResponse.data.Count) feature flags" -ForegroundColor Green
Write-Host ""

Write-Host "=== ALL TESTS PASSED ===" -ForegroundColor Green
Write-Host ""
Write-Host "Copy these tokens to your Postman environment:" -ForegroundColor Cyan
Write-Host "adminSa_token: $accessToken" -ForegroundColor White
Write-Host "adminSa_refreshToken: $refreshToken" -ForegroundColor White
