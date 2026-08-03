import "server-only";
import { queryCrmDb } from "@/lib/crm-db";

// ─────────────────────────────────────────────────────────────────────────────
// Read-only port of v1's server/queries/contacts.ts getContactById +
// getContactActivity, computed against ebright_crm. Powers the contact profile
// page. No writes — display only.
// ─────────────────────────────────────────────────────────────────────────────

interface UserRef { id: string; name: string | null; email: string | null; image: string | null }
interface StageRef { name: string; color: string }

export interface OppDetail {
  id: string;
  value: string;
  createdAt: string;
  pipeline: { name: string } | null;
  stage: { name: string; color: string; shortCode: string | null } | null;
  assignedUser: { name: string | null } | null;
  stageHistory: Array<{
    id: string;
    fromStage: StageRef | null;
    toStage: StageRef | null;
    changedByUser: { name: string | null } | null;
    note: string | null;
    changedAt: string;
  }>;
}

export type ActivityItem =
  | { type: "note"; id: string; body: string; createdAt: string; user: { name: string | null } | null }
  | { type: "task"; id: string; title: string; dueAt: string | null; completedAt: string | null; createdAt: string; assignedUser: { name: string | null } | null }
  | { type: "call"; id: string; outcome: string | null; notes: string | null; duration: number | null; createdAt: string; user: { name: string | null } | null }
  | { type: "message"; id: string; channel: string; direction: string; body: string; subject: string | null; status: string; createdAt: string; user: { name: string | null } | null }
  | { type: "stage_change"; id: string; fromStage: StageRef | null; toStage: StageRef | null; changedByUser: { name: string | null } | null; note: string | null; changedAt: string };

export interface ContactDetail {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  parentFullName: string | null;
  campaignName: string | null;
  remarks: string | null;
  preferredTrialDay: string | null;
  enrolledPackage: string | null;
  childName1: string | null; childAge1: string | null;
  childName2: string | null; childAge2: string | null;
  childName3: string | null; childAge3: string | null;
  childName4: string | null; childAge4: string | null;
  createdAt: string;
  leadSource: { id: string; name: string } | null;
  assignedUser: UserRef | null;
  tags: Array<{ id: string; name: string; color: string }>;
  primaryStage: { name: string; color: string; shortCode: string | null } | null;
  opportunities: OppDetail[];
  notes: Array<{ id: string; body: string; createdAt: string; user: { name: string | null } | null }>;
  tasks: Array<{ id: string; title: string; dueAt: string | null; completedAt: string | null; createdAt: string; assignedUser: { name: string | null } | null }>;
  messages: Array<{ id: string; channel: string; direction: string; body: string; subject: string | null; status: string; createdAt: string; user: { name: string | null } | null }>;
  calls: Array<{ id: string; outcome: string | null; notes: string | null; duration: number | null; createdAt: string; user: { name: string | null } | null }>;
  activity: ActivityItem[];
}

async function resolveTenantId(): Promise<string | null> {
  const r = await queryCrmDb<{ id: string }>(
    `SELECT id FROM crm.crm_tenant WHERE slug IN ('ebright','ebright-demo') ORDER BY "createdAt" ASC LIMIT 1`,
  );
  if (!r) return null;
  if (r.rows[0]?.id) return r.rows[0].id;
  const f = await queryCrmDb<{ id: string }>(`SELECT id FROM crm.crm_tenant ORDER BY "createdAt" ASC LIMIT 1`);
  return f?.rows[0]?.id ?? null;
}

const TS = `'YYYY-MM-DD"T"HH24:MI:SS'`;

export async function getContactDetail(
  contactId: string,
  allowedBranchIds: string[] | null = null,
): Promise<ContactDetail | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  // Branch access boundary: the contact must own an opportunity in an allowed
  // branch, otherwise it's out of scope (treated as not found).
  if (allowedBranchIds != null) {
    const inScope = await queryCrmDb<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM crm.crm_opportunity o
          WHERE o."contactId" = $1 AND o."deletedAt" IS NULL
            AND o."branchId" = ANY($2::text[])
       ) AS ok`,
      [contactId, allowedBranchIds],
    );
    if (!inScope?.rows[0]?.ok) return null;
  }

  // Base contact (+ lead source + assigned user + tags).
  const cRes = await queryCrmDb<{
    id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null;
    parentFullName: string | null; campaignName: string | null; remarks: string | null;
    preferredTrialDay: string | null; enrolledPackage: string | null;
    childName1: string | null; childAge1: string | null; childName2: string | null; childAge2: string | null;
    childName3: string | null; childAge3: string | null; childName4: string | null; childAge4: string | null;
    createdAt: string;
    leadSourceId: string | null; leadSourceName: string | null;
    auId: string | null; auName: string | null; auEmail: string | null; auImage: string | null;
    tags: Array<{ id: string; name: string; color: string }>;
  }>(
    `SELECT c.id, c."firstName", c."lastName", c.email, c.phone,
            c."parentFullName", c."campaignName", c.remarks,
            c."preferredTrialDay"::text AS "preferredTrialDay", c."enrolledPackage",
            c."childName1", c."childAge1", c."childName2", c."childAge2",
            c."childName3", c."childAge3", c."childName4", c."childAge4",
            to_char(c."createdAt", ${TS}) AS "createdAt",
            ls.id AS "leadSourceId", ls.name AS "leadSourceName",
            au.id AS "auId", au.name AS "auName", au.email AS "auEmail", au.image AS "auImage",
            COALESCE(tg.tags, '[]'::json) AS tags
       FROM crm.crm_contact c
       LEFT JOIN crm.crm_lead_source ls ON ls.id = c."leadSourceId"
       LEFT JOIN crm.crm_auth_user au ON au.id = c."assignedUserId"
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) AS tags
           FROM crm.crm_contact_tag ctg JOIN crm.crm_tag t ON t.id = ctg."tagId"
          WHERE ctg."contactId" = c.id
       ) tg ON true
      WHERE c."tenantId" = $1 AND c.id = $2 AND c."deletedAt" IS NULL
      LIMIT 1`,
    [tenantId, contactId],
  );
  const c = cRes?.rows[0];
  if (!c) return null;

  const [oppsRes, notesRes, tasksRes, msgsRes, callsRes] = await Promise.all([
    queryCrmDb<{
      id: string; value: string; createdAt: string; lastStageChangeAt: string;
      pipelineName: string | null; stageName: string | null; stageColor: string | null; stageShort: string | null;
      assignedName: string | null;
    }>(
      `SELECT o.id, o.value::text AS value,
              to_char(o."createdAt", ${TS}) AS "createdAt",
              to_char(o."lastStageChangeAt", ${TS}) AS "lastStageChangeAt",
              p.name AS "pipelineName",
              s.name AS "stageName", s.color AS "stageColor", s."shortCode" AS "stageShort",
              au.name AS "assignedName"
         FROM crm.crm_opportunity o
         LEFT JOIN crm.crm_pipeline p ON p.id = o."pipelineId"
         LEFT JOIN crm.crm_stage s ON s.id = o."stageId"
         LEFT JOIN crm.crm_auth_user au ON au.id = o."assignedUserId"
        WHERE o."tenantId" = $1 AND o."contactId" = $2 AND o."deletedAt" IS NULL
        ORDER BY o."createdAt" DESC`,
      [tenantId, contactId],
    ),
    queryCrmDb<{ id: string; body: string; createdAt: string; userName: string | null }>(
      `SELECT n.id, n.body, to_char(n."createdAt", ${TS}) AS "createdAt", u.name AS "userName"
         FROM crm.crm_note n LEFT JOIN crm.crm_auth_user u ON u.id = n."userId"
        WHERE n."tenantId" = $1 AND n."contactId" = $2 ORDER BY n."createdAt" DESC`,
      [tenantId, contactId],
    ),
    queryCrmDb<{ id: string; title: string; dueAt: string | null; completedAt: string | null; createdAt: string; assignedName: string | null }>(
      `SELECT t.id, t.title,
              to_char(t."dueAt", ${TS}) AS "dueAt",
              to_char(t."completedAt", ${TS}) AS "completedAt",
              to_char(t."createdAt", ${TS}) AS "createdAt",
              au.name AS "assignedName"
         FROM crm.crm_task t LEFT JOIN crm.crm_auth_user au ON au.id = t."assignedUserId"
        WHERE t."tenantId" = $1 AND t."contactId" = $2 ORDER BY t."createdAt" DESC`,
      [tenantId, contactId],
    ),
    queryCrmDb<{ id: string; channel: string; direction: string; body: string; subject: string | null; status: string; createdAt: string; userName: string | null }>(
      `SELECT m.id, m.channel::text AS channel, m.direction::text AS direction, m.body, m.subject, m.status,
              to_char(m."createdAt", ${TS}) AS "createdAt", u.name AS "userName"
         FROM crm.crm_message m LEFT JOIN crm.crm_auth_user u ON u.id = m."userId"
        WHERE m."tenantId" = $1 AND m."contactId" = $2 ORDER BY m."createdAt" DESC`,
      [tenantId, contactId],
    ),
    queryCrmDb<{ id: string; outcome: string | null; notes: string | null; duration: number | null; createdAt: string; userName: string | null }>(
      `SELECT ca.id, ca.outcome, ca.notes, ca.duration,
              to_char(ca."createdAt", ${TS}) AS "createdAt", u.name AS "userName"
         FROM crm.crm_call ca LEFT JOIN crm.crm_auth_user u ON u.id = ca."userId"
        WHERE ca."tenantId" = $1 AND ca."contactId" = $2 ORDER BY ca."createdAt" DESC`,
      [tenantId, contactId],
    ),
  ]);

  const oppRows = oppsRes?.rows ?? [];
  const oppIds = oppRows.map((o) => o.id);

  // Stage history for all of the contact's opportunities in one shot.
  const shRes = oppIds.length === 0
    ? { rows: [] as Array<{ id: string; opportunityId: string; note: string | null; changedAt: string; fromName: string | null; fromColor: string | null; toName: string | null; toColor: string | null; changedByName: string | null }> }
    : await queryCrmDb<{ id: string; opportunityId: string; note: string | null; changedAt: string; fromName: string | null; fromColor: string | null; toName: string | null; toColor: string | null; changedByName: string | null }>(
        `SELECT sh.id, sh."opportunityId", sh.note,
                to_char(sh."changedAt", ${TS}) AS "changedAt",
                fs.name AS "fromName", fs.color AS "fromColor",
                ts.name AS "toName", ts.color AS "toColor",
                cu.name AS "changedByName"
           FROM crm.crm_stage_history sh
           LEFT JOIN crm.crm_stage fs ON fs.id = sh."fromStageId"
           LEFT JOIN crm.crm_stage ts ON ts.id = sh."toStageId"
           LEFT JOIN crm.crm_auth_user cu ON cu.id = sh."changedByUserId"
          WHERE sh."tenantId" = $1 AND sh."opportunityId" = ANY($2::text[])
          ORDER BY sh."changedAt" DESC`,
        [tenantId, oppIds],
      );
  const shRows = shRes?.rows ?? [];
  const shByOpp = new Map<string, typeof shRows>();
  for (const h of shRows) {
    const arr = shByOpp.get(h.opportunityId) ?? [];
    arr.push(h);
    shByOpp.set(h.opportunityId, arr);
  }

  const opportunities: OppDetail[] = oppRows.map((o) => ({
    id: o.id,
    value: o.value,
    createdAt: o.createdAt,
    pipeline: o.pipelineName ? { name: o.pipelineName } : null,
    stage: o.stageName ? { name: o.stageName, color: o.stageColor ?? "blue", shortCode: o.stageShort } : null,
    assignedUser: o.assignedName ? { name: o.assignedName } : null,
    stageHistory: (shByOpp.get(o.id) ?? []).slice(0, 10).map((h) => ({
      id: h.id,
      fromStage: h.fromName ? { name: h.fromName, color: h.fromColor ?? "blue" } : null,
      toStage: h.toName ? { name: h.toName, color: h.toColor ?? "blue" } : null,
      changedByUser: h.changedByName ? { name: h.changedByName } : null,
      note: h.note,
      changedAt: h.changedAt,
    })),
  }));

  // Primary stage = current stage of the most recently changed opportunity.
  const primaryOppByChange = [...oppRows].sort((a, b) => b.lastStageChangeAt.localeCompare(a.lastStageChangeAt))[0];
  const primaryStage = primaryOppByChange?.stageName
    ? { name: primaryOppByChange.stageName, color: primaryOppByChange.stageColor ?? "blue", shortCode: primaryOppByChange.stageShort }
    : null;

  const notes = (notesRes?.rows ?? []).map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, user: n.userName ? { name: n.userName } : null }));
  const tasks = (tasksRes?.rows ?? []).map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, completedAt: t.completedAt, createdAt: t.createdAt, assignedUser: t.assignedName ? { name: t.assignedName } : null }));
  const messages = (msgsRes?.rows ?? []).map((m) => ({ id: m.id, channel: m.channel, direction: m.direction, body: m.body, subject: m.subject, status: m.status, createdAt: m.createdAt, user: m.userName ? { name: m.userName } : null }));
  const calls = (callsRes?.rows ?? []).map((ca) => ({ id: ca.id, outcome: ca.outcome, notes: ca.notes, duration: ca.duration, createdAt: ca.createdAt, user: ca.userName ? { name: ca.userName } : null }));

  // Merge into one activity timeline (desc), mirroring getContactActivity.
  const activity: ActivityItem[] = [
    ...notes.map((n) => ({ type: "note" as const, ...n })),
    ...tasks.map((t) => ({ type: "task" as const, ...t })),
    ...calls.map((ca) => ({ type: "call" as const, ...ca })),
    ...messages.map((m) => ({ type: "message" as const, ...m })),
    ...opportunities.flatMap((o) => o.stageHistory.map((sh) => ({ type: "stage_change" as const, ...sh }))),
  ].sort((a, b) => {
    const da = "changedAt" in a ? a.changedAt : a.createdAt;
    const db = "changedAt" in b ? b.changedAt : b.createdAt;
    return db.localeCompare(da);
  });

  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    parentFullName: c.parentFullName,
    campaignName: c.campaignName,
    remarks: c.remarks,
    preferredTrialDay: c.preferredTrialDay,
    enrolledPackage: c.enrolledPackage,
    childName1: c.childName1, childAge1: c.childAge1,
    childName2: c.childName2, childAge2: c.childAge2,
    childName3: c.childName3, childAge3: c.childAge3,
    childName4: c.childName4, childAge4: c.childAge4,
    createdAt: c.createdAt,
    leadSource: c.leadSourceId ? { id: c.leadSourceId, name: c.leadSourceName ?? "" } : null,
    assignedUser: c.auId ? { id: c.auId, name: c.auName, email: c.auEmail, image: c.auImage } : null,
    tags: Array.isArray(c.tags) ? c.tags : [],
    primaryStage,
    opportunities,
    notes,
    tasks,
    messages,
    calls,
    activity,
  };
}
