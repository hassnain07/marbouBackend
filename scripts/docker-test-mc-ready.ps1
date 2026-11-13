$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
& $d run -d --name minio_test -p 9100:9000 -e MINIO_ROOT_USER=marbou -e MINIO_ROOT_PASSWORD=marbou-secret cgr.dev/chainguard/minio:latest server /data --console-address ":9001" 2>&1 | Out-Null
Start-Sleep -Seconds 6
Write-Host "=== mc ready (alias set + ready) ==="
& $d exec minio_test sh -c "mc alias set hc http://localhost:9000 marbou marbou-secret 2>/dev/null; mc ready hc; echo EXIT=$?" 2>&1 | Select-Object -Last 5
Write-Host "=== mc help ready ==="
& $d exec minio_test sh -c "mc ready --help 2>&1 | head -3 || echo 'mc ready not found'" 2>&1 | Select-Object -Last 5
& $d rm -f minio_test 2>&1 | Out-Null
Write-Host "DONE"
