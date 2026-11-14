-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('received', 'submitted', 'failed');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('inbound', 'outbound');

-- CreateTable
CREATE TABLE "enquiries" (
    "journey_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "status" "EnquiryStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("journey_id")
);

-- CreateTable
CREATE TABLE "call_records" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" "CallDirection" NOT NULL,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" INTEGER,
    "duration_ms" INTEGER,
    "request_body" JSONB,
    "response_body" JSONB,
    "error_code" TEXT,
    "request_id" UUID NOT NULL,
    "journey_id" TEXT,
    "cycle_id" TEXT,

    CONSTRAINT "call_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_lines" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "request_id" UUID,
    "journey_id" TEXT,
    "cycle_id" TEXT,

    CONSTRAINT "log_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_lead_id_key" ON "enquiries"("lead_id");

-- CreateIndex
CREATE INDEX "call_records_journey_id_idx" ON "call_records"("journey_id");

-- CreateIndex
CREATE INDEX "call_records_request_id_idx" ON "call_records"("request_id");

-- CreateIndex
CREATE INDEX "log_lines_journey_id_idx" ON "log_lines"("journey_id");

