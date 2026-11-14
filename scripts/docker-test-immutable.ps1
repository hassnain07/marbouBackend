Set-Location "d:\codeclub\Marbou\marbouBackend"
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"

function Invoke-Pg($sql) {
  $sql | & $d exec -i marbou_postgres psql -U marbou -d marbou_db 2>&1 | Select-Object -Last 6
}

Write-Host "=== triggers on AuditLog ==="
Invoke-Pg @"
SELECT tgname FROM pg_trigger WHERE tgrelid = '"AuditLog"'::regclass AND NOT tgisinternal;
"@

Write-Host "=== insert a test row ==="
Invoke-Pg @"
INSERT INTO "AuditLog" ("actorType","actorId","action","entity","entityId","prevHash","hash","createdAt")
VALUES ('SYSTEM','test','test.action','Test','x','0000','hhhh',NOW()) RETURNING id;
"@

Write-Host "=== try UPDATE (expect rejection) ==="
Invoke-Pg @"
UPDATE "AuditLog" SET "hash"='tampered' WHERE "action"='test.action';
"@

Write-Host "=== try DELETE (expect rejection) ==="
Invoke-Pg @"
DELETE FROM "AuditLog" WHERE "action"='test.action';
"@

Write-Host "=== cleanup: drop the test row via a SUPERUSER role-bypass of the trigger is not possible; leave it ==="
Write-Host "DONE"
