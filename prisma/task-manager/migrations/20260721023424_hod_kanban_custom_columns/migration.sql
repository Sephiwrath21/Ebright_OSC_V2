-- CreateTable
CREATE TABLE "HodKanbanColumn" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HodKanbanColumn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HodKanbanColumn_ownerId_idx" ON "HodKanbanColumn"("ownerId");

-- AddForeignKey
ALTER TABLE "HodKanbanColumn" ADD CONSTRAINT "HodKanbanColumn_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
