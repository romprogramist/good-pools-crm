/*
  Warnings:

  - You are about to drop the column `individualServicePrice` on the `Customer` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "InstructionKind" AS ENUM ('pdf', 'text', 'link');

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "individualServicePrice";

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "facingMaterials" TEXT,
    "extraField" TEXT,
    "individualServicePrice" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolPhoto" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "originalName" TEXT,
    "size" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolInstruction" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "kind" "InstructionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "path" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pool_customerId_idx" ON "Pool"("customerId");

-- CreateIndex
CREATE INDEX "PoolPhoto_poolId_idx" ON "PoolPhoto"("poolId");

-- CreateIndex
CREATE INDEX "PoolInstruction_poolId_idx" ON "PoolInstruction"("poolId");

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolPhoto" ADD CONSTRAINT "PoolPhoto_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolInstruction" ADD CONSTRAINT "PoolInstruction_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
