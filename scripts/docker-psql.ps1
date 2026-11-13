Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
& $d exec marbou_postgres psql -U marbou -d marbou_db -c "SELECT current_user, current_database();"
Write-Host "DONE:$LASTEXITCODE"
