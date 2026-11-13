Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
& $d ps
Write-Host "DONE:$LASTEXITCODE"
