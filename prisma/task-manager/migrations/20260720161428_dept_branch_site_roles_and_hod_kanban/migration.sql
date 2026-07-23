-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'DEPT_SITE';
ALTER TYPE "Role" ADD VALUE 'BRANCH_SITE';

-- CreateTable
CREATE TABLE "HodKanbanCard" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "column" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HodKanbanCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HodKanbanCard_ownerId_column_idx" ON "HodKanbanCard"("ownerId", "column");

-- AddForeignKey
ALTER TABLE "HodKanbanCard" ADD CONSTRAINT "HodKanbanCard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
