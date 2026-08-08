// Task assignment — pre-authorized Core logic (2026-08-06): the actual
// fan-out/creation logic behind ./tasks's exported assignFlowTask, factored
// out so an ALREADY-authorized caller (data/template-groups.ts's
// applyTemplateGroup, whose own requireGroupEditAccess uses a DIFFERENT
// per-scope allow-list than ./tasks's own actor check) can invoke the same
// fan-out logic without re-running that narrower check — which would
// incorrectly reject an actor requireGroupEditAccess already
// authorized. Same double-gating class of bug, same fix pattern, as
// ./templates-internal's Core functions — see that file's header and
// template-groups.ts's file header for the fuller explanation.
//
// Deliberately NOT re-exported by data.ts's `export * from "./data/tasks"`
// barrel (this file isn't re-exported by that barrel at all): assignFlowTaskCore
// takes a bare `{ id, role, department }` actor with no proof of
// authorization, so any caller reachable via the public
// `@/task-manager/data` barrel must go through ./tasks's auth-checked
// assignFlowTask instead — widening THAT check would also hand Branch
// Managers the regular "+ Task" quick-assign form (a much bigger grant
// than "let Branch Managers Assign their own Template/Package groups"),
// which is deliberately avoided here, same reasoning as
// ./templates-internal not touching ./templates's requireAssigner. Only
// data/template-groups.ts imports from this file, and it does so directly
// (`./tasks-internal`), never through the barrel.
import { z } from "zod";
import type { Cadence, Prisma } from "@/generated/task-manager-client";
import type { FlowAssignInput } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { buildTemplateSnapshot } from "../engine/snapshot";
import { BRANCH_STAFF_ROLES, isElevatedDeptSite, parseLocalDate } from "../analytics/_lib";

const CADENCE_OPTIONS = ["daily", "monthly", "adhoc"] as const;
type CadenceOption = (typeof CADENCE_OPTIONS)[number];

/** Mirrors visibleCadenceOptions in ui/types.ts — re-validated server-side so
 *  a crafted request can't submit a cadence the picker wouldn't have offered. */
function allowedCadenceOptions(targets: { employmentType: string | null }[]): CadenceOption[] {
  if (targets.some((t) => t.employmentType === "Manager")) return ["daily", "monthly", "adhoc"];
  if (targets.some((t) => t.employmentType === "Coach" || t.employmentType === "Branch Exec")) {
    return ["daily"];
  }
  return ["daily", "monthly"];
}

const CADENCE_ENUM: Record<CadenceOption, Cadence> = {
  daily: "DAILY",
  monthly: "MONTHLY",
  adhoc: "ADHOC",
};

const DAYS = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_INDEX: Record<(typeof DAYS)[number], number> = {
  Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
};

const DUE_HOUR = 17;

function nextOccurrence(day: (typeof DAYS)[number], from = new Date()): Date {
  const diff = (DAY_INDEX[day] - from.getDay() + 7) % 7;
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + diff, DUE_HOUR);
}

/** Guideline image cap: 2 MB binary ≈ ~2.8M base64 chars. Shared with
 *  ./tasks's own proof-upload schema — exported so that file imports it
 *  back rather than duplicating the mime list. */
export const GUIDELINE_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
const GUIDELINE_IMAGE_MAX_BASE64 = 2 * 1024 * 1024 * 1.37;

export const assignInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  branches: z.array(z.string().min(1).max(100)).max(50).default([]),
  role: z.enum(["All", ...BRANCH_STAFF_ROLES]).default("All"),
  days: z.array(z.enum(DAYS)).max(DAYS.length).default([]),
  userIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cadence: z.enum(CADENCE_OPTIONS),
  repeatWeekly: z.boolean().optional().default(false),
  // Optional Guideline (2026-07-30): SOP link and/or reference image —
  // never required, never blocks submission.
  guidelineUrl: z.string().trim().url().max(2000).optional(),
  guidelineImage: z
    .object({
      mime: z.enum(GUIDELINE_IMAGE_MIMES),
      dataBase64: z.string().min(1).max(GUIDELINE_IMAGE_MAX_BASE64),
    })
    .optional(),
  // Optional Subtasks (2026-07-30): each becomes a full task of its own
  // linked under the main task (see the pairs loop below).
  subtasks: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  // Optional "Save as Template" (2026-07-31): also persist this
  // assignment's STRUCTURE as a reusable TaskTemplate owned by the actor.
  // Same-name save overwrites (the template edit path).
  saveAsTemplate: z.object({ name: z.string().trim().min(1).max(100) }).optional(),
  // Set when the form was pre-filled via "Start from a template" — stamps
  // every created block with the template's id so template deletion can
  // find (and cancel) its pending assignments.
  fromTemplateId: z.string().min(1).optional(),
});

const ADHOC_FLOW_ID = "flow-adhoc";
const CEO_ASSIGN_FLOW_ID = "flow-ceo-assign";
const HOD_ASSIGN_FLOW_ID = "flow-hod-assign";
const ADMIN_ASSIGN_FLOW_ID = "flow-admin-assign";
const OPS_ASSIGN_FLOW_ID = "flow-ops-assign";

/** The "+ Task" quick form's actual fan-out logic: one RunBlock per
 *  (recipient × occurrence). `actor` must already be authorized by the
 *  caller — this function performs zero auth checks of its own (see file
 *  header). Every branch below (CEO-targets-HODs-only, cadence-by-role,
 *  flow-by-role) is a BUSINESS rule about what the actor may fan out to,
 *  not an auth gate on whether they may call this at all — those stay
 *  here unchanged for every caller, including Branch Managers arriving via
 *  applyTemplateGroup, who fall through to ADHOC_FLOW_ID same as any other
 *  role not explicitly routed above (that fallback comment used to say
 *  "unreachable given the [old, narrower] allow-list" — it's reachable now
 *  that a second, wider-allow-listed caller exists). */
export async function assignFlowTaskCore(
  actor: { id: string; role: string; department: string | null },
  input: FlowAssignInput,
): Promise<{ created: number }> {
  const body = assignInputSchema.parse(input);

  const roles = body.role === "All" ? [...BRANCH_STAFF_ROLES] : [body.role];
  const targets = await prisma.user.findMany({
    where:
      body.userIds.length > 0
        ? { id: { in: body.userIds } }
        : {
            employmentType: { in: roles },
            ...(body.branches.length > 0 ? { branch: { in: body.branches } } : {}),
          },
    orderBy: { name: "asc" },
  });
  if (targets.length === 0) {
    throw new ApiHttpError(400, "No staff match that selection");
  }
  // The CEO assigns to HODs ONLY, plus themselves via the "Myself" quick
  // pick (2026-08-01) — the form's recipient picker already restricts;
  // this is the bypass-proof check.
  if (
    actor.role === "CEO" &&
    targets.some((t) => t.role !== "HOD" && t.id !== actor.id)
  ) {
    throw new ApiHttpError(400, "The CEO can only assign tasks to HODs or themselves");
  }
  const allowedCadences = allowedCadenceOptions(targets);
  if (!allowedCadences.includes(body.cadence)) {
    throw new ApiHttpError(
      400,
      `${allowedCadences.join("/")} ${allowedCadences.length > 1 ? "are" : "is"} the only cadence option${allowedCadences.length > 1 ? "s" : ""} for this recipient selection`,
    );
  }

  const flowId =
    actor.role === "CEO"
      ? CEO_ASSIGN_FLOW_ID
      : actor.role === "HOD"
        ? HOD_ASSIGN_FLOW_ID
        : actor.role === "OPS"
          ? OPS_ASSIGN_FLOW_ID
          : actor.role === "ADMIN" || isElevatedDeptSite(actor)
            ? ADMIN_ASSIGN_FLOW_ID
            : ADHOC_FLOW_ID; // Branch Manager (via applyTemplateGroup) and any other non-listed role land here.
  const flow = await prisma.flow.findUnique({
    where: { id: flowId },
    include: { blocks: { include: { items: true } } },
  });
  const block = flow?.blocks[0];
  if (!flow || !block) {
    throw new ApiHttpError(500, "Assignment utility flow missing — run the seed/bootstrap");
  }
  const snapshot = (await buildTemplateSnapshot(flow.id)) as unknown as Prisma.InputJsonValue;

  let occurrences: { dueAt: Date | null; runName: string }[];
  if (body.dueDate) {
    const d = parseLocalDate(body.dueDate);
    occurrences = [
      { dueAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), DUE_HOUR), runName: body.title },
    ];
  } else if (body.days.length > 0) {
    occurrences = body.days.map((day) => ({
      dueAt: nextOccurrence(day),
      runName: `${body.title} (${day})`,
    }));
  } else {
    occurrences = [{ dueAt: null, runName: body.title }];
  }
  const cadence: Cadence = CADENCE_ENUM[body.cadence];

  // ONE shared Guideline row for the whole assignment (all recipients ×
  // occurrences reference it; recurrence successors inherit the id) —
  // the image bytes are stored exactly once.
  let guidelineId: string | null = null;
  if (body.guidelineUrl || body.guidelineImage) {
    const guideline = await prisma.guideline.create({
      data: {
        url: body.guidelineUrl ?? null,
        imageMime: body.guidelineImage?.mime ?? null,
        imageData: body.guidelineImage
          ? Buffer.from(body.guidelineImage.dataBase64, "base64")
          : null,
      },
    });
    guidelineId = guideline.id;
  }

  // "Save as Template" (2026-07-31): runs BEFORE the fan-out so the
  // template's id can stamp every created block (templateId) — that link
  // is what lets deleting the template cancel its pending assignments.
  // Structure only: recipients, days, and due date deliberately excluded
  // (they reset per use). Image bytes are copied INTO the template so
  // task-side changes can never hollow it out; using the template later
  // creates a fresh Guideline row through the normal path.
  let savedTemplateId: string | null = null;
  if (body.saveAsTemplate) {
    const templateData = {
      title: body.title,
      subtasks: body.subtasks as unknown as Prisma.InputJsonValue,
      cadence,
      guidelineUrl: body.guidelineUrl ?? null,
      guidelineMime: body.guidelineImage?.mime ?? null,
      guidelineImage: body.guidelineImage
        ? Buffer.from(body.guidelineImage.dataBase64, "base64")
        : null,
    };
    const existing = await prisma.taskTemplate.findFirst({
      where: { createdById: actor.id, name: body.saveAsTemplate.name },
      select: { id: true },
    });
    const saved = existing
      ? await prisma.taskTemplate.update({ where: { id: existing.id }, data: templateData })
      : await prisma.taskTemplate.create({
          data: { createdById: actor.id, name: body.saveAsTemplate.name, ...templateData },
        });
    savedTemplateId = saved.id;
  }
  const templateId = body.fromTemplateId ?? savedTemplateId ?? null;

  // Pairs touch disjoint rows — no shared transaction ties them together
  // (each create was already its own implicit transaction in the donor's
  // loop form), so they run concurrently on purpose. Do not "fix" into a
  // sequential loop.
  const pairs = targets.flatMap((target) => occurrences.map((occ) => ({ target, occ })));
  const runIds = await Promise.all(
    pairs.map(async ({ target, occ }) => {
      const run = await prisma.flowRun.create({
        data: {
          flowId: flow.id,
          flowVersion: flow.version,
          templateSnapshot: snapshot,
          name: `${occ.runName} — ${target.name}`,
          startedById: actor.id,
          triggerType: "MANUAL",
          status: "ACTIVE",
        },
      });
      const parentBlock = await prisma.runBlock.create({
        data: {
          runId: run.id,
          blockId: block.id,
          nodeId: block.nodeId,
          title: body.title,
          assigneeId: target.id,
          status: "ACTIVE",
          startedAt: new Date(),
          dueAt: occ.dueAt,
          cadence,
          guidelineId,
          templateId,
          runItems: {
            create: block.items.map((it) => ({
              itemId: it.id,
              order: it.order,
              type: it.type,
              label: it.label,
              required: it.required,
              config: it.config as Prisma.InputJsonValue,
            })),
          },
        },
      });
      // Subtasks (2026-07-30): each is a FULL task — its own run + block,
      // same assignee/due/cadence, linked via parentId. Its own run keeps
      // every existing path (complete/N-A/reopen, run auto-completion,
      // proof, audit) working identically to a normal task; only the UI
      // groups them. subtaskOrder (2026-07-31) records the checklist-
      // builder sequence explicitly.
      for (const [subtaskIndex, subtaskTitle] of body.subtasks.entries()) {
        const subRun = await prisma.flowRun.create({
          data: {
            flowId: flow.id,
            flowVersion: flow.version,
            templateSnapshot: snapshot,
            name: `${subtaskTitle} — ${target.name}`,
            startedById: actor.id,
            triggerType: "MANUAL",
            status: "ACTIVE",
          },
        });
        await prisma.runBlock.create({
          data: {
            runId: subRun.id,
            blockId: block.id,
            nodeId: block.nodeId,
            title: subtaskTitle,
            assigneeId: target.id,
            status: "ACTIVE",
            startedAt: new Date(),
            dueAt: occ.dueAt,
            cadence,
            parentId: parentBlock.id,
            templateId,
            subtaskOrder: subtaskIndex,
            runItems: {
              create: block.items.map((it) => ({
                itemId: it.id,
                order: it.order,
                type: it.type,
                label: it.label,
                required: it.required,
                config: it.config as Prisma.InputJsonValue,
              })),
            },
          },
        });
        await prisma.auditLog.create({
          data: {
            runId: subRun.id,
            actorId: actor.id,
            action: "RUN_STARTED",
            detail: {
              runName: subtaskTitle,
              trigger: "MANUAL",
              adhoc: flowId === ADHOC_FLOW_ID,
              assignee: target.name,
              subtaskOf: parentBlock.id,
            },
          },
        });
      }
      await prisma.auditLog.create({
        data: {
          runId: run.id,
          actorId: actor.id,
          action: "RUN_STARTED",
          detail: {
            runName: occ.runName,
            trigger: "MANUAL",
            adhoc: flowId === ADHOC_FLOW_ID,
            assignee: target.name,
          },
        },
      });
      return run.id;
    }),
  );

  // Subtask runs aren't counted — "created" answers "how many tasks did
  // this assignment fan out to" (recipients × days), same as before.
  return { created: runIds.length };
}
