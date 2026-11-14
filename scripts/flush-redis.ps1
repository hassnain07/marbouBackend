$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
& $d exec marbou_redis redis-cli FLUSHALL
Write-Host "Redis flushed. EXIT:$LASTEXITCODE"
