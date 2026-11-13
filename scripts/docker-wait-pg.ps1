Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
# Wait up to 60s for postgres to be healthy
for ($i = 0; $i -lt 30; $i++) {
  $status = (& $d inspect --format "{{.State.Health.Status}}" marbou_postgres 2>$null)
  Write-Host "postgres health: $status"
  if ($status -eq "healthy") { break }
  Start-Sleep -Seconds 2
}
& $d ps --format "table {{.Names}}\t{{.Status}}"
Write-Host "DONE"
