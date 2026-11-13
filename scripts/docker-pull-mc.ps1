$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Write-Host "=== Pull minio/mc:latest ==="
& $d pull minio/mc:latest 2>&1 | Select-Object -Last 5
Write-Host "EXIT1: $LASTEXITCODE"
Write-Host "=== Pull quay.io/minio/mc:latest ==="
& $d pull quay.io/minio/mc:latest 2>&1 | Select-Object -Last 5
Write-Host "EXIT2: $LASTEXITCODE"
