Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$sql = @"
SELECT column_name FROM information_schema.columns WHERE table_name = 'FeatureFlag' ORDER BY ordinal_position;
"@
Write-Host "=== FeatureFlag columns ==="
$sql | & $d exec -i marbou_postgres psql -U marbou -d marbou_db
Write-Host "DONE"
