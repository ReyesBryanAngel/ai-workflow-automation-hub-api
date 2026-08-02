-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "exceptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "poNumber" TEXT,
ADD COLUMN     "purchaseOrderId" INTEGER,
ADD COLUMN     "vendorId" INTEGER;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
