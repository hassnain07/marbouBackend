/*
  Warnings:

  - You are about to drop the column `countryId` on the `FeatureFlag` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FeatureFlag" DROP COLUMN "countryId",
ADD COLUMN     "countryOverrides" JSONB,
ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "FeatureFlagHistory" (
    "id" BIGSERIAL NOT NULL,
    "flagKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "config" JSONB,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFlagHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemoteConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemoteConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DefaultSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefaultSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "FeatureFlagHistory_flagKey_changedAt_idx" ON "FeatureFlagHistory"("flagKey", "changedAt");

-- CreateIndex
CREATE INDEX "FeatureFlag_enabled_idx" ON "FeatureFlag"("enabled");

-- AddForeignKey
ALTER TABLE "FeatureFlagHistory" ADD CONSTRAINT "FeatureFlagHistory_flagKey_fkey" FOREIGN KEY ("flagKey") REFERENCES "FeatureFlag"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written SQL: make AuditLog append-only at the DB level (TRS-12, SYS-10).
-- A trigger function raises an exception on any UPDATE or DELETE of a row, so a
-- direct `UPDATE "AuditLog" SET ...` or `DELETE FROM "AuditLog" ...` is rejected
-- by the database regardless of application code. TRUNCATE cannot be blocked by
-- a row trigger and the table owner bypasses REVOKE, so TRUNCATE protection for
-- the owner is a documented limitation (production should use a restricted,
-- non-owner app role — see docs/schema-decisions.md).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable: % not allowed (row id=%)',
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON "AuditLog";
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

DROP TRIGGER IF EXISTS audit_log_no_delete ON "AuditLog";
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
