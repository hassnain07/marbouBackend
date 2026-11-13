$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Write-Host "=== mailhog base image + tools ==="
& $d run --rm --entrypoint sh mailhog/mailhog:latest -c "command -v wget; command -v nc; command -v curl; command -v busybox; ls /bin 2>/dev/null | head -20; echo DONE" 2>&1 | Select-Object -Last 25
Write-Host "EXIT: $LASTEXITCODE"
