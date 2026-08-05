-- Five task-type projections (2026-07-31): daily / monthly /
-- hod_assigned_task / ceo_assigned_task / adhoc_task, with the confirmed
-- reporting column names (task_title, assignee_id, status pending/
-- completed/n-a, guideline_link, guideline_image, proof_file, is_archived,
-- subtaskOrder, ...). Implemented as READ-ONLY VIEWS over the unified
-- RunBlock structure so they are always in sync with the app's real data —
-- the app itself keeps reading/writing RunBlock; nothing forks.
-- guideline_image / proof_file are the session-gated serving URLs (bytes
-- live in the DB, not on disk). Cancelled runs are excluded everywhere;
-- is_archived surfaces the Archive feature's state.

CREATE OR REPLACE VIEW daily AS
SELECT
  b."id"                                        AS id,
  b."title"                                     AS task_title,
  b."templateId"                                AS template_id,
  b."assigneeId"                                AS assignee_id,
  CASE b."status" WHEN 'DONE' THEN 'completed' WHEN 'SKIPPED' THEN 'n/a' ELSE 'pending' END AS status,
  g."url"                                       AS guideline_link,
  CASE WHEN g."imageMime" IS NOT NULL THEN '/api/task-manager/guideline-image/' || g."id" END AS guideline_image,
  CASE WHEN p."id" IS NOT NULL THEN '/api/task-manager/proof-image/' || p."id" END            AS proof_file,
  (r."archivedAt" IS NOT NULL)                  AS is_archived,
  b."parentId"                                  AS parent_task_id,
  b."subtaskOrder"                              AS "subtaskOrder",
  b."dueAt"                                     AS due_date,
  b."startedAt"                                 AS created_at,
  COALESCE(b."completedAt", b."startedAt")      AS updated_at,
  b."completedAt"                               AS completed_at
FROM "RunBlock" b
JOIN "FlowRun" r ON r."id" = b."runId"
LEFT JOIN "Guideline" g ON g."id" = b."guidelineId"
LEFT JOIN "Proof" p ON p."runBlockId" = b."id"
WHERE r."status" <> 'CANCELLED' AND b."cadence" = 'DAILY';

CREATE OR REPLACE VIEW monthly AS
SELECT
  b."id"                                        AS id,
  b."title"                                     AS task_title,
  b."templateId"                                AS template_id,
  b."assigneeId"                                AS assignee_id,
  CASE b."status" WHEN 'DONE' THEN 'completed' WHEN 'SKIPPED' THEN 'n/a' ELSE 'pending' END AS status,
  g."url"                                       AS guideline_link,
  CASE WHEN g."imageMime" IS NOT NULL THEN '/api/task-manager/guideline-image/' || g."id" END AS guideline_image,
  CASE WHEN p."id" IS NOT NULL THEN '/api/task-manager/proof-image/' || p."id" END            AS proof_file,
  (r."archivedAt" IS NOT NULL)                  AS is_archived,
  b."parentId"                                  AS parent_task_id,
  b."subtaskOrder"                              AS "subtaskOrder",
  b."dueAt"                                     AS due_date,
  b."startedAt"                                 AS created_at,
  COALESCE(b."completedAt", b."startedAt")      AS updated_at,
  b."completedAt"                               AS completed_at
FROM "RunBlock" b
JOIN "FlowRun" r ON r."id" = b."runId"
LEFT JOIN "Guideline" g ON g."id" = b."guidelineId"
LEFT JOIN "Proof" p ON p."runBlockId" = b."id"
WHERE r."status" <> 'CANCELLED' AND b."cadence" = 'MONTHLY';

CREATE OR REPLACE VIEW adhoc_task AS
SELECT
  b."id"                                        AS id,
  b."title"                                     AS task_title,
  b."templateId"                                AS template_id,
  b."assigneeId"                                AS assignee_id,
  CASE b."status" WHEN 'DONE' THEN 'completed' WHEN 'SKIPPED' THEN 'n/a' ELSE 'pending' END AS status,
  g."url"                                       AS guideline_link,
  CASE WHEN g."imageMime" IS NOT NULL THEN '/api/task-manager/guideline-image/' || g."id" END AS guideline_image,
  CASE WHEN p."id" IS NOT NULL THEN '/api/task-manager/proof-image/' || p."id" END            AS proof_file,
  (r."archivedAt" IS NOT NULL)                  AS is_archived,
  b."parentId"                                  AS parent_task_id,
  b."subtaskOrder"                              AS "subtaskOrder",
  b."dueAt"                                     AS due_date,
  b."startedAt"                                 AS created_at,
  COALESCE(b."completedAt", b."startedAt")      AS updated_at,
  b."completedAt"                               AS completed_at
FROM "RunBlock" b
JOIN "FlowRun" r ON r."id" = b."runId"
LEFT JOIN "Guideline" g ON g."id" = b."guidelineId"
LEFT JOIN "Proof" p ON p."runBlockId" = b."id"
WHERE r."status" <> 'CANCELLED' AND b."cadence" = 'ADHOC';

-- Assigner-role projections: "assigned by an HOD / by the CEO", any cadence.
CREATE OR REPLACE VIEW hod_assigned_task AS
SELECT
  b."id"                                        AS id,
  b."title"                                     AS task_title,
  b."templateId"                                AS template_id,
  b."assigneeId"                                AS assignee_id,
  r."startedById"                               AS assigner_id,
  CASE b."status" WHEN 'DONE' THEN 'completed' WHEN 'SKIPPED' THEN 'n/a' ELSE 'pending' END AS status,
  g."url"                                       AS guideline_link,
  CASE WHEN g."imageMime" IS NOT NULL THEN '/api/task-manager/guideline-image/' || g."id" END AS guideline_image,
  CASE WHEN p."id" IS NOT NULL THEN '/api/task-manager/proof-image/' || p."id" END            AS proof_file,
  (r."archivedAt" IS NOT NULL)                  AS is_archived,
  b."parentId"                                  AS parent_task_id,
  b."subtaskOrder"                              AS "subtaskOrder",
  b."dueAt"                                     AS due_date,
  b."startedAt"                                 AS created_at,
  COALESCE(b."completedAt", b."startedAt")      AS updated_at,
  b."completedAt"                               AS completed_at
FROM "RunBlock" b
JOIN "FlowRun" r ON r."id" = b."runId"
JOIN "User" u ON u."id" = r."startedById" AND u."role" = 'HOD'
LEFT JOIN "Guideline" g ON g."id" = b."guidelineId"
LEFT JOIN "Proof" p ON p."runBlockId" = b."id"
WHERE r."status" <> 'CANCELLED';

CREATE OR REPLACE VIEW ceo_assigned_task AS
SELECT
  b."id"                                        AS id,
  b."title"                                     AS task_title,
  b."templateId"                                AS template_id,
  b."assigneeId"                                AS assignee_id,
  r."startedById"                               AS assigner_id,
  CASE b."status" WHEN 'DONE' THEN 'completed' WHEN 'SKIPPED' THEN 'n/a' ELSE 'pending' END AS status,
  g."url"                                       AS guideline_link,
  CASE WHEN g."imageMime" IS NOT NULL THEN '/api/task-manager/guideline-image/' || g."id" END AS guideline_image,
  CASE WHEN p."id" IS NOT NULL THEN '/api/task-manager/proof-image/' || p."id" END            AS proof_file,
  (r."archivedAt" IS NOT NULL)                  AS is_archived,
  b."parentId"                                  AS parent_task_id,
  b."subtaskOrder"                              AS "subtaskOrder",
  b."dueAt"                                     AS due_date,
  b."startedAt"                                 AS created_at,
  COALESCE(b."completedAt", b."startedAt")      AS updated_at,
  b."completedAt"                               AS completed_at
FROM "RunBlock" b
JOIN "FlowRun" r ON r."id" = b."runId"
JOIN "User" u ON u."id" = r."startedById" AND u."role" = 'CEO'
LEFT JOIN "Guideline" g ON g."id" = b."guidelineId"
LEFT JOIN "Proof" p ON p."runBlockId" = b."id"
WHERE r."status" <> 'CANCELLED';
