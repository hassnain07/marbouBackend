param([string]$Cmd, [string]$WorkDir = "d:\codeclub\Marbou\marbouBackend")
$docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$compose = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Set-Location $WorkDir
switch ($Cmd) {
  "ps"       { & $docker ps 2>&1 }
  "up-infra" { & $docker compose -f docker/docker-compose.yml up -d postgres redis 2>&1 }
  "up-minio" { & $docker compose -f docker/docker-compose.yml up -d minio minio-init 2>&1 }
  "up-all"   { & $docker compose -f docker/docker-compose.yml up -d 2>&1 }
  "down"     { & $docker compose -f docker/docker-compose.yml down 2>&1 }
  "build"    { & $docker compose -f docker/docker-compose.yml up -d --build 2>&1 }
  "logs-api" { & $docker compose -f docker/docker-compose.yml logs api --tail=50 2>&1 }
  "health"   { & $docker inspect --format "{{.State.Health.Status}}" marbou_postgres 2>&1; & $docker inspect --format "{{.State.Health.Status}}" marbou_redis 2>&1; & $docker inspect --format "{{.State.Health.Status}}" marbou_minio 2>&1 }
  default    { Write-Host "Unknown command: $Cmd" }
}
Write-Host "EXIT:$LASTEXITCODE"
