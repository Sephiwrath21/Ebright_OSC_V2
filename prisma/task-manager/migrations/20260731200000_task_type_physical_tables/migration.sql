-- Physical task-type tables (2026-07-31, replacing the same-named views
-- per explicit user decision): daily / monthly / adhoc_task /
-- hod_assigned_task / ceo_assigned_task, kept in sync with the unified
-- RunBlock source of truth by TRIGGERS — the sync runs inside the same
-- transaction as every RunBlock/Proof/FlowRun write, so the tables cannot
-- drift, regardless of which app path (assign, complete, recurrence,
-- archive, bulk ops, ...) performed the write.
--
-- ONE-WAY sync: the app keeps writing RunBlock only. Rows inserted into
-- these tables directly do NOT flow back and may be overwritten/removed
-- by the next sync of that id. No FKs on user/template ids — matches the
-- schema's loose-coupling convention (see schema.prisma header).

DROP VIEW IF EXISTS daily;
DROP VIEW IF EXISTS monthly;
DROP VIEW IF EXISTS adhoc_task;
DROP VIEW IF EXISTS hod_assigned_task;
DROP VIEW IF EXISTS ceo_assigned_task;

CREATE TABLE daily (
    id TEXT NOT NULL,
    task_title TEXT NOT NULL,
    template_id TEXT,
    assignee_id TEXT NOT NULL,
    status TEXT NOT NULL,
    guideline_link TEXT,
    guideline_image TEXT,
    proof_file TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    parent_task_id TEXT,
    "subtaskOrder" INTEGER,
    due_date TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL,
    updated_at TIMESTAMP(3) NOT NULL,
    completed_at TIMESTAMP(3),
    CONSTRAINT daily_pkey PRIMARY KEY (id)
);
-- LIKE ... INCLUDING ALL copies the primary key too.
CREATE TABLE monthly (LIKE daily INCLUDING ALL);
CREATE TABLE adhoc_task (LIKE daily INCLUDING ALL);

CREATE TABLE hod_assigned_task (
    id TEXT NOT NULL,
    task_title TEXT NOT NULL,
    template_id TEXT,
    assignee_id TEXT NOT NULL,
    assigner_id TEXT NOT NULL,
    status TEXT NOT NULL,
    guideline_link TEXT,
    guideline_image TEXT,
    proof_file TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    parent_task_id TEXT,
    "subtaskOrder" INTEGER,
    due_date TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL,
    updated_at TIMESTAMP(3) NOT NULL,
    completed_at TIMESTAMP(3),
    CONSTRAINT hod_assigned_task_pkey PRIMARY KEY (id)
);
CREATE TABLE ceo_assigned_task (LIKE hod_assigned_task INCLUDING ALL);

CREATE INDEX daily_assignee_idx ON daily(assignee_id);
CREATE INDEX monthly_assignee_idx ON monthly(assignee_id);
CREATE INDEX adhoc_task_assignee_idx ON adhoc_task(assignee_id);
CREATE INDEX hod_assigned_task_assignee_idx ON hod_assigned_task(assignee_id);
CREATE INDEX ceo_assigned_task_assignee_idx ON ceo_assigned_task(assignee_id);

-- ---- Sync core: recompute ONE task's projection across all 5 tables ----
CREATE OR REPLACE FUNCTION tm_sync_task_row(p_block_id TEXT) RETURNS VOID AS $$
DECLARE
  rec RECORD;
  v_status TEXT;
  v_gimg TEXT;
  v_pfile TEXT;
  v_updated TIMESTAMP(3);
BEGIN
  SELECT
    b."id" AS bid, b."title" AS btitle, b."templateId" AS tpl_id,
    b."assigneeId" AS asg_id, b."status"::text AS bstatus,
    b."cadence"::text AS bcadence, b."parentId" AS par_id,
    b."subtaskOrder" AS sub_order, b."dueAt" AS due_at,
    b."startedAt" AS started_at, b."completedAt" AS completed_at,
    r."archivedAt" AS archived_at, r."status"::text AS rstatus,
    r."startedById" AS starter_id, u."role"::text AS starter_role,
    g."url" AS gurl, g."imageMime" AS gmime, g."id" AS gid,
    p."id" AS pid
  INTO rec
  FROM "RunBlock" b
  JOIN "FlowRun" r ON r."id" = b."runId"
  LEFT JOIN "User" u ON u."id" = r."startedById"
  LEFT JOIN "Guideline" g ON g."id" = b."guidelineId"
  LEFT JOIN "Proof" p ON p."runBlockId" = b."id"
  WHERE b."id" = p_block_id;

  -- Remove everywhere first: makes the function idempotent and handles
  -- deletes, cancellations, and category changes in one motion.
  DELETE FROM daily WHERE id = p_block_id;
  DELETE FROM monthly WHERE id = p_block_id;
  DELETE FROM adhoc_task WHERE id = p_block_id;
  DELETE FROM hod_assigned_task WHERE id = p_block_id;
  DELETE FROM ceo_assigned_task WHERE id = p_block_id;

  IF rec.bid IS NULL OR rec.rstatus = 'CANCELLED' THEN
    RETURN;
  END IF;

  v_status := CASE rec.bstatus WHEN 'DONE' THEN 'completed' WHEN 'SKIPPED' THEN 'n/a' ELSE 'pending' END;
  v_gimg := CASE WHEN rec.gmime IS NOT NULL THEN '/api/task-manager/guideline-image/' || rec.gid END;
  v_pfile := CASE WHEN rec.pid IS NOT NULL THEN '/api/task-manager/proof-image/' || rec.pid END;
  v_updated := COALESCE(rec.completed_at, rec.started_at);

  IF rec.bcadence = 'DAILY' THEN
    INSERT INTO daily (id, task_title, template_id, assignee_id, status, guideline_link, guideline_image, proof_file, is_archived, parent_task_id, "subtaskOrder", due_date, created_at, updated_at, completed_at)
    VALUES (rec.bid, rec.btitle, rec.tpl_id, rec.asg_id, v_status, rec.gurl, v_gimg, v_pfile, rec.archived_at IS NOT NULL, rec.par_id, rec.sub_order, rec.due_at, rec.started_at, v_updated, rec.completed_at);
  ELSIF rec.bcadence = 'MONTHLY' THEN
    INSERT INTO monthly (id, task_title, template_id, assignee_id, status, guideline_link, guideline_image, proof_file, is_archived, parent_task_id, "subtaskOrder", due_date, created_at, updated_at, completed_at)
    VALUES (rec.bid, rec.btitle, rec.tpl_id, rec.asg_id, v_status, rec.gurl, v_gimg, v_pfile, rec.archived_at IS NOT NULL, rec.par_id, rec.sub_order, rec.due_at, rec.started_at, v_updated, rec.completed_at);
  ELSIF rec.bcadence = 'ADHOC' THEN
    INSERT INTO adhoc_task (id, task_title, template_id, assignee_id, status, guideline_link, guideline_image, proof_file, is_archived, parent_task_id, "subtaskOrder", due_date, created_at, updated_at, completed_at)
    VALUES (rec.bid, rec.btitle, rec.tpl_id, rec.asg_id, v_status, rec.gurl, v_gimg, v_pfile, rec.archived_at IS NOT NULL, rec.par_id, rec.sub_order, rec.due_at, rec.started_at, v_updated, rec.completed_at);
  END IF;

  IF rec.starter_role = 'HOD' THEN
    INSERT INTO hod_assigned_task (id, task_title, template_id, assignee_id, assigner_id, status, guideline_link, guideline_image, proof_file, is_archived, parent_task_id, "subtaskOrder", due_date, created_at, updated_at, completed_at)
    VALUES (rec.bid, rec.btitle, rec.tpl_id, rec.asg_id, rec.starter_id, v_status, rec.gurl, v_gimg, v_pfile, rec.archived_at IS NOT NULL, rec.par_id, rec.sub_order, rec.due_at, rec.started_at, v_updated, rec.completed_at);
  ELSIF rec.starter_role = 'CEO' THEN
    INSERT INTO ceo_assigned_task (id, task_title, template_id, assignee_id, assigner_id, status, guideline_link, guideline_image, proof_file, is_archived, parent_task_id, "subtaskOrder", due_date, created_at, updated_at, completed_at)
    VALUES (rec.bid, rec.btitle, rec.tpl_id, rec.asg_id, rec.starter_id, v_status, rec.gurl, v_gimg, v_pfile, rec.archived_at IS NOT NULL, rec.par_id, rec.sub_order, rec.due_at, rec.started_at, v_updated, rec.completed_at);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---- Triggers: every write path funnels through these three sources ----
CREATE OR REPLACE FUNCTION tm_runblock_sync_tg() RETURNS trigger AS $$
BEGIN
  PERFORM tm_sync_task_row(COALESCE(NEW."id", OLD."id"));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER runblock_task_type_sync
AFTER INSERT OR UPDATE OR DELETE ON "RunBlock"
FOR EACH ROW EXECUTE FUNCTION tm_runblock_sync_tg();

CREATE OR REPLACE FUNCTION tm_proof_sync_tg() RETURNS trigger AS $$
BEGIN
  PERFORM tm_sync_task_row(COALESCE(NEW."runBlockId", OLD."runBlockId"));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER proof_task_type_sync
AFTER INSERT OR UPDATE OR DELETE ON "Proof"
FOR EACH ROW EXECUTE FUNCTION tm_proof_sync_tg();

-- Run-level changes (archive/unarchive, cancel) touch every block of the
-- run. Run DELETEs cascade to RunBlock rows, whose own triggers fire.
CREATE OR REPLACE FUNCTION tm_flowrun_sync_tg() RETURNS trigger AS $$
BEGIN
  PERFORM tm_sync_task_row(b."id") FROM "RunBlock" b WHERE b."runId" = NEW."id";
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER flowrun_task_type_sync
AFTER UPDATE ON "FlowRun"
FOR EACH ROW EXECUTE FUNCTION tm_flowrun_sync_tg();

-- ---- Backfill: sync every existing non-cancelled block once ----
SELECT tm_sync_task_row(b."id")
FROM "RunBlock" b
JOIN "FlowRun" r ON r."id" = b."runId"
WHERE r."status" <> 'CANCELLED';
