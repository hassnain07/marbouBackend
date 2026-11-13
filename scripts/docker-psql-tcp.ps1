Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
Write-Host "=== Postgres env (POSTGRES_PASSWORD) ==="
& $d exec marbou_postgres printenv POSTGRES_PASSWORD
Write-Host "=== TCP auth test with password 'marbou' ==="
& $d exec marbou_postgres psql -h localhost -U marbou -d marbou_db -c "SELECT 1;" 2>&1
# psql inside the image may prompt for password; pass PGPASSWORD
Write-Host "=== TCP auth with PGPASSWORD=marbou ==="
& $d exec -e PGPASSWORD=marbou marbou_postgres psql -h localhost -U marbou -d marbou_db -c "SELECT current_user;"
Write-Host "DONE"
