$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Write-Host "=== Does Chainguard minio have a shell? ==="
& $d run --rm --entrypoint sh cgr.dev/chainguard/minio:latest -c "echo has-shell" 2>&1 | Select-Object -Last 3
Write-Host "EXIT-shell: $LASTEXITCODE"
Write-Host "=== Run Chainguard minio standalone and probe health endpoint ==="
& $d run -d --name minio_test -p 9100:9000 -e MINIO_ROOT_USER=marbou -e MINIO_ROOT_PASSWORD=marbou-secret cgr.dev/chainguard/minio:latest server /data --console-address ":9001" 2>&1 | Select-Object -Last 2
Start-Sleep -Seconds 8
Write-Host "=== probe /minio/health/live from host (port 9100) ==="
try { $r = Invoke-WebRequest -Uri "http://localhost:9100/minio/health/live" -UseBasicParsing -TimeoutSec 5; Write-Host "health/live status: $($r.StatusCode)" } catch { Write-Host "health/live error: $($_.Exception.Message)" }
Write-Host "=== container logs ==="
& $d logs minio_test 2>&1 | Select-Object -Last 8
& $d rm -f minio_test 2>&1 | Out-Null
Write-Host "DONE"
