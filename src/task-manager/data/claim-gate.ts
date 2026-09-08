// Claim gate (2026-09-03) — the ENFORCEMENT half of the "No Claim/Incentive"
// rule. That rule already existed as an ADVISORY: the ⋮ menu on the Task
// Manager page opens a Finance/CEO-only list of everyone with at least one
// open task in a month, so a human could withhold a claim/incentive payment
// (task-manager/ui/no-claim-incentive-menu.tsx + getNoClaimIncentivePayload,
// analytics/_payloads.ts, 2026-08-18). This asks the SAME question about ONE
// person, so src/app/claim/actions.ts can refuse the claim automatically
// instead of relying on someone remembering to open the modal.
//
// The definition of "open" is deliberately COPIED from that list rather than
// invented: bucketOf() says DONE = completed and SKIPPED = n/a, so open is
// PENDING | ACTIVE | OVERDUE | ESCALATED. Membership in the month is the same
// `dueAt ?? startedAt` fallback the list applies (a task with neither date
// belongs to no month and never blocks), NOT the cadence-tag rule
// fetchPeriodBlocks' own `window` param would use — same deliberate choice,
// and the same reason: every task type counts here, tagged or not.
//
// Scoped to the CLAIM'S month for the same reason the list has a month
// picker: the rule is "were you square for the period you are claiming for",
// so a task due in December must not block a September claim.
//
// FAIL-OPEN is the contract. Most portal users have no Task Manager row at
// all (NoAccountError is the normal case, see core.ts), an environment whose
// Phase 2 cutover has not run has no TASK_MANAGER_DATABASE_URL at all
// (SetupPendingError), and a database can simply be down. None of those mean
// "this person is behind on their tasks", and claims are money — a Task
// Manager outage must never freeze claim submission company-wide. Every one
// of those paths returns "not blocked" and reports why via `skipped`.
import type { BlockStatus } from "@/generated/task-manager-client";
import { prisma } from "../prisma";
import { formatLocalDate, resolveWindow } from "../analytics/_lib";
import { NoAccountError, SetupPendingError, native } from "./core";

/** Not DONE and not SKIPPED — mirrors bucketOf() === "pending". */
const OPEN_STATUSES: BlockStatus[] = ["PENDING", "ACTIVE", "OVERDUE", "ESCALATED"];

/** How many task titles the caller may name in its error message. */
const SAMPLE_SIZE = 3;

export interface BlockingTask {
  id: string;
  title: string;
  status: BlockStatus;
  /** Local YYYY-MM-DD, or null for an undated task matched via startedAt. */
  dueAt: string | null;
}

export interface ClaimTaskGate {
  /** True only when the gate really ran AND found at least one open task. */
  blocked: boolean;
  /** Total open tasks in the month — may exceed `sample.length`. */
  openCount: number;
  /** The first few, for a human-readable reason. Ordered by due date. */
  sample: BlockingTask[];
  /** Why the gate did not evaluate; null when it did. Never blocks. */
  skipped: "no-account" | "setup-pending" | "error" | null;
}

const NOT_BLOCKED = (skipped: ClaimTaskGate["skipped"] = null): ClaimTaskGate => ({
  blocked: false,
  openCount: 0,
  sample: [],
  skipped,
});

/**
 * Open Task Manager tasks for one person in the month `claimDate` falls in.
 *
 * `hrfsUserId` (portal users.user_id) is tried first — User.hrfsUserId is the
 * durable cross-database key added precisely so this join stops depending on
 * two systems spelling an email the same way. It is nullable (portal-only
 * staff, site logins, unresolved mismatches), so email remains the fallback,
 * and it is still the key the rest of the Task Manager identifies actors by.
 */
export async function getOpenTasksForClaim(
  actor: { email: string; hrfsUserId?: number | null },
  claimDate: Date,
): Promise<ClaimTaskGate> {
  try {
    return await native(async () => {
      const email = actor.email.toLowerCase();
      const user =
        (actor.hrfsUserId != null
          ? await prisma.user.findFirst({ where: { hrfsUserId: actor.hrfsUserId } })
          : null) ?? (await prisma.user.findUnique({ where: { email } }));
      if (!user) throw new NoAccountError(actor.email);

      const window = resolveWindow("monthly", formatLocalDate(claimDate));
      const where = {
        assigneeId: user.id,
        status: { in: OPEN_STATUSES },
        // The one gate every active Task Manager list reads through:
        // cancelled runs and archived runs are not outstanding work.
        run: { status: { not: "CANCELLED" as const }, archivedAt: null },
        OR: [
          { dueAt: { gte: window.start, lt: window.end } },
          { dueAt: null, startedAt: { gte: window.start, lt: window.end } },
        ],
      };

      // Two indexed reads ([assigneeId, status]) rather than loading every
      // open task just to name three of them.
      const [openCount, rows] = await Promise.all([
        prisma.runBlock.count({ where }),
        prisma.runBlock.findMany({
          where,
          orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
          take: SAMPLE_SIZE,
          select: { id: true, title: true, status: true, dueAt: true },
        }),
      ]);

      return {
        blocked: openCount > 0,
        openCount,
        sample: rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          dueAt: r.dueAt ? formatLocalDate(r.dueAt) : null,
        })),
        skipped: null,
      };
    }, "getOpenTasksForClaim");
  } catch (err) {
    if (err instanceof NoAccountError) return NOT_BLOCKED("no-account");
    if (err instanceof SetupPendingError) return NOT_BLOCKED("setup-pending");
    // Already logged by native(); swallowing it here is the fail-open contract.
    return NOT_BLOCKED("error");
  }
}
