-- CreateTable
CREATE TABLE "MonitoringController" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastSummaryAt" TIMESTAMP(3),
    "lastSummary" JSONB,
    "offlineNotifiedAt" TIMESTAMP(3),
    "expectHeartbeat" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringController_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringAlarm" (
    "id" TEXT NOT NULL,
    "controllerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "zone" TEXT,
    "zoneTitle" TEXT,
    "stationModel" TEXT,
    "stationId" TEXT,
    "reason" TEXT,
    "raisedAt" TIMESTAMP(3) NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "durationS" INTEGER,
    "clearedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringAlarm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringReading" (
    "id" TEXT NOT NULL,
    "controllerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringMessage" (
    "id" TEXT NOT NULL,
    "controllerId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringController_externalId_key" ON "MonitoringController"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringController_tokenHash_key" ON "MonitoringController"("tokenHash");

-- CreateIndex
CREATE INDEX "MonitoringController_customerId_idx" ON "MonitoringController"("customerId");

-- CreateIndex
CREATE INDEX "MonitoringAlarm_controllerId_clearedAt_idx" ON "MonitoringAlarm"("controllerId", "clearedAt");

-- CreateIndex
CREATE INDEX "MonitoringAlarm_controllerId_raisedAt_idx" ON "MonitoringAlarm"("controllerId", "raisedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringAlarm_controllerId_eventId_key" ON "MonitoringAlarm"("controllerId", "eventId");

-- CreateIndex
CREATE INDEX "MonitoringReading_controllerId_at_idx" ON "MonitoringReading"("controllerId", "at");

-- CreateIndex
CREATE INDEX "MonitoringMessage_controllerId_receivedAt_idx" ON "MonitoringMessage"("controllerId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringMessage_controllerId_messageId_key" ON "MonitoringMessage"("controllerId", "messageId");

-- AddForeignKey
ALTER TABLE "MonitoringController" ADD CONSTRAINT "MonitoringController_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringAlarm" ADD CONSTRAINT "MonitoringAlarm_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "MonitoringController"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringReading" ADD CONSTRAINT "MonitoringReading_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "MonitoringController"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringMessage" ADD CONSTRAINT "MonitoringMessage_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "MonitoringController"("id") ON DELETE CASCADE ON UPDATE CASCADE;
