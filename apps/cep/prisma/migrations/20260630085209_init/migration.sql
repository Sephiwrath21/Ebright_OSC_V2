-- CreateTable
CREATE TABLE "Parent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "programDur" INTEGER NOT NULL,
    "enrollDate" DATETIME NOT NULL,
    "birthday" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "m1StartDate" DATETIME NOT NULL,
    "followusSendDate" DATETIME NOT NULL,
    "reviewSendDate" DATETIME NOT NULL,
    "referralSendDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SendSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "monthNumber" INTEGER,
    "weekNumber" INTEGER,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "sentAt" DATETIME,
    "skipReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SendSchedule_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthNumber" INTEGER,
    "contentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "mediaTitle" TEXT,
    "isReady" BOOLEAN NOT NULL DEFAULT true,
    "blastTo" TEXT NOT NULL DEFAULT 'all_active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SendLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "monthNumber" INTEGER,
    "weekNumber" INTEGER,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "smsSent" BOOLEAN NOT NULL DEFAULT true,
    "waSent" BOOLEAN NOT NULL DEFAULT true,
    "smsStatus" TEXT NOT NULL DEFAULT 'sent',
    "waStatus" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggeredBy" TEXT NOT NULL DEFAULT 'cron',
    "reason" TEXT,
    CONSTRAINT "SendLog_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "branch" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CronLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentsChecked" INTEGER NOT NULL DEFAULT 0,
    "videoSent" INTEGER NOT NULL DEFAULT 0,
    "followusSent" INTEGER NOT NULL DEFAULT 0,
    "reviewSent" INTEGER NOT NULL DEFAULT 0,
    "referralSent" INTEGER NOT NULL DEFAULT 0,
    "birthdaySent" INTEGER NOT NULL DEFAULT 0,
    "birthdaySkipped" INTEGER NOT NULL DEFAULT 0,
    "skippedNoContent" INTEGER NOT NULL DEFAULT 0,
    "alreadySentSkip" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentSlot_monthNumber_contentType_key" ON "ContentSlot"("monthNumber", "contentType");
