param([string[]]$Args)
Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
& $d @Args
Write-Host "DONE:$LASTEXITCODE"
