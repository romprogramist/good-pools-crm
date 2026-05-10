-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "pdfGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "pdfPath" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "totalAmount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "VisitChecklistAnswer" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitChecklistAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitPhoto" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "originalName" TEXT,
    "size" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitExtraWork" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitExtraWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemistryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChemistryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitChemistry" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "chemistryItemId" TEXT,
    "nameAtMoment" TEXT NOT NULL,
    "unitAtMoment" TEXT NOT NULL,
    "priceAtMoment" DECIMAL(10,2) NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitChemistry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitChecklistAnswer_visitId_idx" ON "VisitChecklistAnswer"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitChecklistAnswer_visitId_questionId_key" ON "VisitChecklistAnswer"("visitId", "questionId");

-- CreateIndex
CREATE INDEX "VisitPhoto_visitId_idx" ON "VisitPhoto"("visitId");

-- CreateIndex
CREATE INDEX "VisitExtraWork_visitId_idx" ON "VisitExtraWork"("visitId");

-- CreateIndex
CREATE INDEX "ChemistryItem_active_idx" ON "ChemistryItem"("active");

-- CreateIndex
CREATE INDEX "VisitChemistry_visitId_idx" ON "VisitChemistry"("visitId");

-- CreateIndex
CREATE INDEX "VisitChemistry_chemistryItemId_idx" ON "VisitChemistry"("chemistryItemId");

-- AddForeignKey
ALTER TABLE "VisitChecklistAnswer" ADD CONSTRAINT "VisitChecklistAnswer_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChecklistAnswer" ADD CONSTRAINT "VisitChecklistAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ChecklistQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitPhoto" ADD CONSTRAINT "VisitPhoto_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitExtraWork" ADD CONSTRAINT "VisitExtraWork_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChemistry" ADD CONSTRAINT "VisitChemistry_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChemistry" ADD CONSTRAINT "VisitChemistry_chemistryItemId_fkey" FOREIGN KEY ("chemistryItemId") REFERENCES "ChemistryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
