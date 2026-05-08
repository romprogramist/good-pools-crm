-- CreateTable
CREATE TABLE "EquipmentTemplate" (
    "id" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "defaultWarrantyMonths" INTEGER NOT NULL,
    "regulationPeriodDays" INTEGER NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "templateId" TEXT,
    "typeName" TEXT NOT NULL,
    "serial" TEXT,
    "installDate" TIMESTAMP(3) NOT NULL,
    "warrantyMonths" INTEGER NOT NULL,
    "regulationPeriodDays" INTEGER NOT NULL,
    "lastReplacementDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Equipment_poolId_idx" ON "Equipment"("poolId");

-- CreateIndex
CREATE INDEX "Equipment_templateId_idx" ON "Equipment"("templateId");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EquipmentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
