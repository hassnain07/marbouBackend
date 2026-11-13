Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Write-Host "Stopping postgres..."
& $d compose -f docker/docker-compose.yml stop postgres
Write-Host "Removing postgres container + volume..."
& $docker_rm = $d + " rm -f marbou_postgres"
& $d rm -f marbou_postgres 2>$null
& $d volume rm docker_postgres_data 2>$null
& $d volume rm marbou_postgres_data 2>$null
# remove the volume under the compose project name
& $d compose -f docker/docker-compose.yml down -v 2>$null
Write-Host "Starting postgres fresh..."
& $d compose -f docker/docker-compose.yml up -d postgres
Write-Host "DONE:$LASTEXITCODE"
