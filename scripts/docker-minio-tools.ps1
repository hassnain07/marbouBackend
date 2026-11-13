$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Write-Host "=== wget? ==="
& $d run --rm --entrypoint sh cgr.dev/chainguard/minio:latest -c "command -v wget && wget --version 2>&1 | head -1 || echo 'NO wget'" 2>&1 | Select-Object -Last 3
Write-Host "=== curl? ==="
& $d run --rm --entrypoint sh cgr.dev/chainguard/minio:latest -c "command -v curl && echo 'has curl' || echo 'NO curl'" 2>&1 | Select-Object -Last 2
Write-Host "=== busybox? ==="
& $d run --rm --entrypoint sh cgr.dev/chainguard/minio:latest -c "command -v busybox && echo 'has busybox' || echo 'NO busybox'" 2>&1 | Select-Object -Last 2
Write-Host "=== mc? ==="
& $d run --rm --entrypoint sh cgr.dev/chainguard/minio:latest -c "command -v mc && echo 'has mc' || echo 'NO mc'" 2>&1 | Select-Object -Last 2
Write-Host "DONE"
