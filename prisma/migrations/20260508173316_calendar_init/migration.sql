-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('planned', 'in_progress', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "VisitKind" AS ENUM ('manual', 'online_request', 'series');

-- CreateEnum
CREATE TYPE "OnlineRequestStatus" AS ENUM ('pending', 'accepted', 'declined');

-- CreateTable
CREATE TABLE "VisitSeries" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "serviceUserId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "recurrence" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "serviceUserId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" "VisitStatus" NOT NULL DEFAULT 'planned',
    "kind" "VisitKind" NOT NULL DEFAULT 'manual',
    "seriesId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlineRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "desiredFrom" TIMESTAMP(3) NOT NULL,
    "desiredTo" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "status" "OnlineRequestStatus" NOT NULL DEFAULT 'pending',
    "acceptedById" TEXT,
    "visitId" TEXT,
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitSeries_poolId_idx" ON "VisitSeries"("poolId");

-- CreateIndex
CREATE INDEX "VisitSeries_serviceUserId_idx" ON "VisitSeries"("serviceUserId");

-- CreateIndex
CREATE INDEX "Visit_poolId_idx" ON "Visit"("poolId");

-- CreateIndex
CREATE INDEX "Visit_serviceUserId_idx" ON "Visit"("serviceUserId");

-- CreateIndex
CREATE INDEX "Visit_scheduledAt_idx" ON "Visit"("scheduledAt");

-- CreateIndex
CREATE INDEX "Visit_seriesId_idx" ON "Visit"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "OnlineRequest_visitId_key" ON "OnlineRequest"("visitId");

-- CreateIndex
CREATE INDEX "OnlineRequest_customerId_idx" ON "OnlineRequest"("customerId");

-- CreateIndex
CREATE INDEX "OnlineRequest_poolId_idx" ON "OnlineRequest"("poolId");

-- CreateIndex
CREATE INDEX "OnlineRequest_status_idx" ON "OnlineRequest"("status");

-- AddForeignKey
ALTER TABLE "VisitSeries" ADD CONSTRAINT "VisitSeries_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSeries" ADD CONSTRAINT "VisitSeries_serviceUserId_fkey" FOREIGN KEY ("serviceUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_serviceUserId_fkey" FOREIGN KEY ("serviceUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "VisitSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineRequest" ADD CONSTRAINT "OnlineRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineRequest" ADD CONSTRAINT "OnlineRequest_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineRequest" ADD CONSTRAINT "OnlineRequest_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineRequest" ADD CONSTRAINT "OnlineRequest_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
