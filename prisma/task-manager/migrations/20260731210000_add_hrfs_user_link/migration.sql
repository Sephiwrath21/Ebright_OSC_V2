-- Direct integer link User.hrfsUserId -> ebright_hrfs."User"."id": the
-- durable cross-database key (email matching stays only as the backfill/
-- bootstrap mechanism, not the join key).
ALTER TABLE "User" ADD COLUMN "hrfsUserId" INTEGER;

CREATE INDEX "User_hrfsUserId_idx" ON "User"("hrfsUserId");
