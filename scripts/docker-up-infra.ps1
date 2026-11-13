Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
& $d compose -f docker/docker-compose.yml up -d postgres redis
Write-Host "DONE:$LASTEXITCODE"
