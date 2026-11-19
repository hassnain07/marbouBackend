-- Phase 3: Customer auth — OtpCode, LoginEvent, AuthFunnelEvent, Session extensions
-- Extends Session with ip, userAgent, deviceId, expiresAt, revokedReason + unique refreshHash index.
-- Adds enums OtpPurpose, OtpChannel, LoginOutcome, FunnelStep.
-- Adds models OtpCode (hashed codes only), LoginEvent (security log), AuthFunnelEvent (funnel metrics).

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'RESET', 'CHANGE_EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "LoginOutcome" AS ENUM ('SUCCESS', 'BAD_PASSWORD', 'LOCKED', 'SUSPENDED', 'EMAIL_NOT_VERIFIED', 'SOCIAL_SUCCESS', 'SOCIAL_FAILED');

-- CreateEnum
CREATE TYPE "FunnelStep" AS ENUM ('REGISTER_STARTED', 'OTP_SENT', 'OTP_DELIVERED', 'OTP_DELIVERY_FAILED', 'OTP_VERIFIED');

-- DropIndex (replaced by compound index below)
DROP INDEX "Session_userId_idx";

-- AlterTable: add new Session fields
ALTER TABLE "Session"
  ADD COLUMN "deviceId"     TEXT,
  ADD COLUMN "expiresAt"    TIMESTAMP(3),
  ADD COLUMN "ip"           TEXT,
  ADD COLUMN "revokedReason" TEXT,
  ADD COLUMN "userAgent"    TEXT;

-- CreateTable
CREATE TABLE "OtpCode" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT,
    "email"      TEXT,
    "purpose"    "OtpPurpose" NOT NULL,
    "channel"    "OtpChannel" NOT NULL DEFAULT 'EMAIL',
    "codeHash"   TEXT NOT NULL,
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id"         BIGSERIAL NOT NULL,
    "userId"     TEXT,
    "emailHash"  TEXT,
    "outcome"    "LoginOutcome" NOT NULL,
    "deviceName" TEXT,
    "os"         TEXT,
    "ip"         TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthFunnelEvent" (
    "id"              BIGSERIAL NOT NULL,
    "registrationKey" TEXT NOT NULL,
    "userId"          TEXT,
    "step"            "FunnelStep" NOT NULL,
    "channel"         "OtpChannel" NOT NULL DEFAULT 'EMAIL',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthFunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpCode_email_purpose_idx" ON "OtpCode"("email", "purpose");
CREATE INDEX "OtpCode_userId_purpose_idx" ON "OtpCode"("userId", "purpose");
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");
CREATE INDEX "LoginEvent_outcome_createdAt_idx" ON "LoginEvent"("outcome", "createdAt");
CREATE INDEX "AuthFunnelEvent_registrationKey_idx" ON "AuthFunnelEvent"("registrationKey");
CREATE INDEX "AuthFunnelEvent_step_createdAt_idx" ON "AuthFunnelEvent"("step", "createdAt");
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Session_refreshHash_idx" ON "Session"("refreshHash");
