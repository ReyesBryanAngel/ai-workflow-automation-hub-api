-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'APPROVER', 'MEMBER');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'MEMBER';

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
