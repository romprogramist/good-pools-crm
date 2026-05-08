-- CreateEnum
CREATE TYPE "ChecklistQuestionType" AS ENUM ('text', 'number', 'single_select', 'multi_select', 'bool');

-- CreateTable
CREATE TABLE "ChecklistQuestion" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "ChecklistQuestionType" NOT NULL,
    "label" TEXT NOT NULL,
    "placeholder" TEXT,
    "unit" TEXT,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistQuestion_order_idx" ON "ChecklistQuestion"("order");

-- CreateIndex
CREATE INDEX "ChecklistQuestion_active_idx" ON "ChecklistQuestion"("active");
