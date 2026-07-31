-- RunBlock.templateId (loose string, no FK): which TaskTemplate created
-- this block. Lets template deletion cancel its pending assignments while
-- completed history stays intact.
ALTER TABLE "RunBlock" ADD COLUMN "templateId" TEXT;

CREATE INDEX "RunBlock_templateId_idx" ON "RunBlock"("templateId");
