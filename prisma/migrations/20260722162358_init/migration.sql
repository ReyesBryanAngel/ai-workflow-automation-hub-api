-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('SALES', 'SUPPORT', 'BILLING', 'COMPLAINT', 'GENERAL_INQUIRY', 'SPAM');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('SUCCESS', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "emails" (
    "id" SERIAL NOT NULL,
    "sender" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "EmailCategory",
    "priority" "Priority",
    "summary" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_logs" (
    "id" SERIAL NOT NULL,
    "workflow" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL,
    "executionTime" INTEGER,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailId" INTEGER,

    CONSTRAINT "workflow_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_records" (
    "id" SERIAL NOT NULL,
    "customerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceEmailId" INTEGER,

    CONSTRAINT "crm_records_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "workflow_logs" ADD CONSTRAINT "workflow_logs_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_records" ADD CONSTRAINT "crm_records_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
