// Task actions: the "+ Task" quick-assign fan-out and the status-dot
// complete / N/A / reopen mutations. Ports of the corresponding
// /api/internal routes; all reuse the REAL engine paths (submitItem/
// completeBlock/skipBlock/reopenBlock) so audit logs, run auto-completion,
// and reminder cancellation still happen. See assign/route.ts's header
// comment in the donor repo for the full cadence/utility-flow rationale.
import { z } from "zod";
import type { Cadence, Prisma } from "@/generated/task-manager-client";
import type { FlowAssignInput } from "../ui/types";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";
import { buildTemplateSnapshot } from "../engine/snapshot";
import { completeBlock, reopenBlock, skipBlock, submitItem } from "../engine/run";
import { BRANCH_STAFF_ROLES, parseLocalDate } from "../analytics/_lib";
import { native, requireUserByEmail } from "./core";

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

const assignInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  branches: z.array(z.string().min(1).max(100)).max(50).default([]),
  role: z.enum(["All", ...BRANCH_STAFF_ROLES]).default("All"),
  days: z.array(z.enum(DAYS)).max(DAYS.length).default([]),
  userIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cadence: z.enum(CADENCE_OPTIONS),
});

const ADHOC_FLOW_ID = "flow-adhoc";
const CEO_ASSIGN_FLOW_ID = "flow-ceo-assign";
const HOD_ASSIGN_FLOW_ID = "flow-hod-assign";
const ADMIN_ASSIGN_FLOW_ID = "flow-admin-assign";
const OPS_ASSIGN_FLOW_ID = "flow-ops-assign";
const DUE_HOUR = 17;

function nextOccurrence(day: (typeof DAYS)[number], from = new Date()): Date {
  const diff = (DAY_INDEX[day] - from.getDay() + 7) % 7;
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + diff, DUE_HOUR);
}

/** The Operation department-site login is the ONE DEPT_SITE with assign rights. */
function isOperationDeptSite(actor: { role: string; department: string | null }): boolean {
  return actor.role === "DEPT_SITE" && actor.department === "Operation";
}

/** The "+ Task" quick form: one RunBlock per (recipient × occurrence). */
export function assignFlowTask(
  actorEmail: string,
  input: FlowAssignInput,
): Promise<{ created: number }> {
  return native(async () => {
    const body = assignInputSchema.parse(input);
    const actor = await requireUserByEmail(actorEmail);
    const allowed =
      actor.role === "ADMIN" ||
      actor.role === "OPS" ||
      actor.role === "CEO" ||
      actor.role === "HOD" ||
      isOperationDeptSite(actor);
    if (!allowed) {
      throw new ApiHttpError(
        403,
        "Only superadmin, operations, HOD, the CEO, or the Operation department account can assign tasks",
      );
    }

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
            : actor.role === "ADMIN" || isOperationDeptSite(actor)
              ? ADMIN_ASSIGN_FLOW_ID
              : ADHOC_FLOW_ID; // unreachable given the allow-list — safe fallback only
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
        await prisma.runBlock.create({
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

    return { created: runIds.length };
  }, "assignFlowTask");
}

/** Click-to-complete: assignee-only, single-required-CHECKBOX tasks only. */
export function completeFlowTask(
  actorEmail: string,
  runBlockId: string,
): Promise<{ completed: boolean; runBlockId: string; runCompleted: boolean }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({
      where: { id },
      include: { runItems: true },
    });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only complete your own tasks");
    }

    // Re-verify eligibility server-side — never trust the client's view.
    const required = runBlock.runItems.filter((it) => it.required);
    if (required.length !== 1 || required[0].type !== "CHECKBOX") {
      throw new ApiHttpError(400, "This task can't be quick-completed — open it in the full run view.");
    }

    await submitItem({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      runItemId: required[0].id,
      value: { type: "CHECKBOX", checked: true },
      actorId: user.id,
    });
    const result = await completeBlock({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      actorId: user.id,
    });

    return { completed: true, ...result } as {
      completed: boolean;
      runBlockId: string;
      runCompleted: boolean;
    };
  }, "completeFlowTask");
}

/** Status dropdown "N/A": assignee-only, any of the caller's own non-terminal tasks. */
export function skipFlowTask(
  actorEmail: string,
  runBlockId: string,
): Promise<{ skipped: boolean; runBlockId: string; runCompleted: boolean }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({ where: { id } });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only mark your own tasks N/A");
    }

    const result = await skipBlock({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      actorId: user.id,
    });

    return { skipped: true, ...result } as {
      skipped: boolean;
      runBlockId: string;
      runCompleted: boolean;
    };
  }, "skipFlowTask");
}

/** Status dropdown "Pending" on a Completed/N-A task: assignee-only reopen. */
export function reopenFlowTask(
  actorEmail: string,
  runBlockId: string,
): Promise<{ reopened: boolean; runBlockId: string; runReopened: boolean }> {
  return native(async () => {
    const id = z.string().min(1).parse(runBlockId);
    const user = await requireUserByEmail(actorEmail);

    const runBlock = await prisma.runBlock.findUnique({ where: { id } });
    if (!runBlock) throw new ApiHttpError(404, "Task not found");
    if (runBlock.assigneeId !== user.id) {
      throw new ApiHttpError(403, "You can only reopen your own tasks");
    }

    const result = await reopenBlock({
      runId: runBlock.runId,
      runBlockId: runBlock.id,
      actorId: user.id,
    });

    return { reopened: true, ...result } as {
      reopened: boolean;
      runBlockId: string;
      runReopened: boolean;
    };
  }, "reopenFlowTask");
}
