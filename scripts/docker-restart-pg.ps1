Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Write-Host "Recreating postgres with new port mapping..."
& $d compose -f docker/docker-compose.yml up -d --force-recreate postgres
for ($i = 0; $i -lt 30; $i++) {
  $status = (& $d inspect --format "{{.State.Health.Status}}" marbou_postgres 2>$null)
  if ($status -eq "healthy") { Write-Host "postgres healthy"; break }
  Start-Sleep -Seconds 2
}
& $d ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
Write-Host "DONE"
