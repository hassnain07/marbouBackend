Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Write-Host "Starting minio + minio-init + mailhog..."
& $d compose -f docker/docker-compose.yml up -d minio minio-init mailhog
# Wait up to 90s for minio health
for ($i = 0; $i -lt 30; $i++) {
  $status = (& $d inspect --format "{{.State.Health.Status}}" marbou_minio 2>$null)
  Write-Host "minio health: $status"
  if ($status -eq "healthy") { break }
  Start-Sleep -Seconds 3
}
Write-Host "=== minio-init logs ==="
& $d logs marbou_minio_init 2>&1 | Select-Object -Last 15
Write-Host "=== ps ==="
& $d ps --format "table {{.Names}}\t{{.Status}}"
Write-Host "DONE"
