-- Assignee-uploaded completion evidence (My Tasks "Proof" column).
-- One row per RunBlock (unique), cascade-deleted with the block.
CREATE TABLE "Proof" (
    "id" TEXT NOT NULL,
    "runBlockId" TEXT NOT NULL,
    "imageMime" TEXT NOT NULL,
    "imageData" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proof_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Proof_runBlockId_key" ON "Proof"("runBlockId");

ALTER TABLE "Proof" ADD CONSTRAINT "Proof_runBlockId_fkey" FOREIGN KEY ("runBlockId") REFERENCES "RunBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
