$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Write-Host "=== Pull cgr.dev/chainguard/minio:latest ==="
& $d pull cgr.dev/chainguard/minio:latest 2>&1 | Select-Object -Last 6
Write-Host "EXIT1: $LASTEXITCODE"
Write-Host "=== Pull kukuruser/mc:latest ==="
& $d pull kukuruser/mc:latest 2>&1 | Select-Object -Last 6
Write-Host "EXIT2: $LASTEXITCODE"
Write-Host "=== Pull localstack/localstack:latest ==="
& $d pull localstack/localstack:latest 2>&1 | Select-Object -Last 6
Write-Host "EXIT3: $LASTEXITCODE"
