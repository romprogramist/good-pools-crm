-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'paid');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'transfer');

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "invoiceIssuedAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid';

-- CreateIndex
CREATE INDEX "Visit_paymentStatus_status_idx" ON "Visit"("paymentStatus", "status");
