-- CEO dashboard customization: which departments a CEO has pinned to their
-- own ClickUp Tasks overview, and in what order.
CREATE TABLE "CeoDashboardConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departments" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeoDashboardConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CeoDashboardConfig_userId_key" ON "CeoDashboardConfig"("userId");
