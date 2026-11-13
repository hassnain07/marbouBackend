Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Write-Host "=== up postgres redis minio minio-init mailhog ==="
& $d compose -f docker/docker-compose.yml up -d postgres redis minio minio-init mailhog 2>&1 | Select-Object -Last 6
# Wait for minio healthy
for ($i = 0; $i -lt 25; $i++) {
  $status = (& $d inspect --format "{{.State.Health.Status}}" marbou_minio 2>$null)
  if ($status -eq "healthy") { Write-Host "minio healthy"; break }
  Start-Sleep -Seconds 4
}
Write-Host "=== minio-init logs ==="
& $d logs marbou_minio_init 2>&1 | Select-Object -Last 8
Write-Host "=== ps ==="
& $d ps -a --format "table {{.Names}}\t{{.Status}}"
Write-Host "DONE"
