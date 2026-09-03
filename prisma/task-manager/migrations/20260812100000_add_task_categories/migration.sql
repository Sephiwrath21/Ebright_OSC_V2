-- Task Categories (2026-08-12): admin-managed, extensible task grouping
-- ("Type" — Flowghan/CNS/SMS/etc, org-defined, no fixed list). Optional on
-- both RunBlock (source of truth per task instance, set once at assignment
-- time) and TaskTemplate (assign-form pre-fill default only). No backfill:
-- every existing row stays categoryId NULL, i.e. "Uncategorized".
-- CreateTable
CREATE TABLE "TaskCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCategory_createdById_idx" ON "TaskCategory"("createdById");

-- AlterTable
ALTER TABLE "RunBlock" ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "RunBlock_categoryId_idx" ON "RunBlock"("categoryId");

-- AddForeignKey
ALTER TABLE "RunBlock" ADD CONSTRAINT "RunBlock_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "TaskCategory"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

-- AlterTable
ALTER TABLE "TaskTemplate" ADD COLUMN "categoryId" TEXT;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "TaskCategory"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
