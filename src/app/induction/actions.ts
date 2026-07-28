"use server";
import { auth } from "@/auth";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRequestBaseUrl } from "@/lib/baseUrl";

// Transaction client type derived from the prisma singleton — avoids
// importing the Prisma namespace, which some IDE TS servers fail to
// resolve from @prisma/client v7's package exports even though tsc
// builds clean.
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
import { uploadToDrive } from "@/lib/drive";
import { canManageInductions } from "@/app/induction/roles";
import {
  getOwnInductionView,
  type InductionView,
} from "@/app/induction/queries";
import {
  WORKFLOW_TEMPLATES,
  computeStepDueDate,
  defaultDurationDays,
  isKnownTemplate,
} from "@/app/induction/templates";

const TOKEN_TTL_DAYS = 30;

// Day-blocking phases — must mirror the bucketing in OnboardingWorkflow.tsx.
type InductionPhase = "pre" | "day1" | "day2" | "day3";
const PHASE_ORDER: InductionPhase[] = ["pre", "day1", "day2", "day3"];
const PHASE_LABEL: Record<InductionPhase, string> = {
  pre: "Pre-onboarding",
  day1: "Day 1",
  day2: "Day 2",
  day3: "Day 3",
};

function phaseFor(stepDueDate: Date, profileStartDate: Date): InductionPhase {
  const ms = stepDueDate.getTime() - profileStartDate.getTime();
  const days = Math.round(ms / 86_400_000);
  if (days < 0) return "pre";
  if (days === 0) return "day1";
  if (days === 1) return "day2";
  return "day3";
}

/**
 * Returns the first incomplete step in any phase that comes BEFORE the target
 * phase, or null if all earlier-phase steps are done. Used to enforce that
 * Day N+1 cannot be completed until Day N is fully done.
 */
async function findPriorPhaseBlocker(
  profileId: number,
  startDate: Date,
  targetPhase: InductionPhase,
): Promise<
  | { stepNumber: number; title: string; phase: InductionPhase }
  | null
> {
  const targetIdx = PHASE_ORDER.indexOf(targetPhase);
  if (targetIdx <= 0) return null;
  const earlier = new Set(PHASE_ORDER.slice(0, targetIdx));
  const all = await prisma.induction_step.findMany({
    where: { induction_profile_id: profileId },
    select: { step_number: true, title: true, due_date: true, status: true },
    orderBy: { step_number: "asc" },
  });
  for (const s of all) {
    if (s.status === "Completed") continue;
    const phase = phaseFor(s.due_date, startDate);
    if (earlier.has(phase)) {
      return { stepNumber: s.step_number, title: s.title, phase };
    }
  }
  return null;
}

const ALLOWED_EVIDENCE_EXTS = new Set([".jpg", ".jpeg", ".png"]);
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024; // 10 MB cap matches typical phone photos.

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function expiryFromNow(days: number = TOKEN_TTL_DAYS): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function dateOnlyOrNull(value: string): Date | null {
  if (!value) return null;
  // Treat YYYY-MM-DD as midnight UTC so Postgres @db.Date stores the intended day.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

async function loadActorAndAuthorize(): Promise<
  | { ok: true; actor: { user_id: number; role_type: string | null } }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Not authenticated." };

  const actor = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      user_id: true,
      role: { select: { role_type: true } },
    },
  });
  if (!actor) return { ok: false, error: "User record not found." };
  if (!canManageInductions(actor.role?.role_type ?? null)) {
    return { ok: false, error: "You do not have permission to manage inductions." };
  }
  return {
    ok: true,
    actor: { user_id: actor.user_id, role_type: actor.role?.role_type ?? null },
  };
}

export interface CreateInductionResult {
  ok: boolean;
  error?: string;
  inductionProfileId?: number;
  token?: string;
}

export async function createInduction(
  _prev: CreateInductionResult | null,
  formData: FormData,
): Promise<CreateInductionResult> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  const userIdRaw = s(formData, "user_id");
  const userId = Number.parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId)) return { ok: false, error: "Employee is required." };

  const inductionType = s(formData, "induction_type");
  if (!["Onboarding", "Offboarding"].includes(inductionType)) {
    return { ok: false, error: "Induction type must be Onboarding or Offboarding." };
  }

  const template = s(formData, "workflow_template") || "Standard";
  if (!isKnownTemplate(template)) {
    return { ok: false, error: `Unknown workflow template "${template}".` };
  }

  const startDate = dateOnlyOrNull(s(formData, "start_date"));
  if (!startDate) return { ok: false, error: "Start date is required (YYYY-MM-DD)." };

  const exitDateRaw = s(formData, "exit_date");
  const exitDate = exitDateRaw ? dateOnlyOrNull(exitDateRaw) : null;
  if (exitDateRaw && !exitDate) return { ok: false, error: "Exit date is invalid." };

  const buddyIdRaw = s(formData, "buddy_user_id");
  const buddyId = buddyIdRaw ? Number.parseInt(buddyIdRaw, 10) : NaN;
  const buddyUserId = Number.isFinite(buddyId) ? buddyId : null;
  if (buddyUserId !== null && buddyUserId === userId) {
    return { ok: false, error: "Buddy must be a different employee." };
  }

  const employee = await prisma.users.findUnique({
    where: { user_id: userId },
    select: { user_id: true, email: true, status: true, user_profile: { select: { full_name: true } } },
  });
  if (!employee) return { ok: false, error: "Selected employee not found." };

  if (buddyUserId !== null) {
    const buddy = await prisma.users.findUnique({
      where: { user_id: buddyUserId },
      select: { user_id: true },
    });
    if (!buddy) return { ok: false, error: "Selected buddy not found." };
  }

  const existing = await prisma.induction_profile.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: "This employee already has an induction profile. Regenerate the link instead.",
    };
  }

  const templateSteps = WORKFLOW_TEMPLATES[template];
  const token = generateToken();
  const expiresAt = expiryFromNow();

  try {
    const created = await prisma.$transaction(async (tx: TxClient) => {
      const profile = await tx.induction_profile.create({
        data: {
          user_id: userId,
          induction_type: inductionType,
          workflow_template: template,
          buddy_user_id: buddyUserId,
          link_token: token,
          link_expires_at: expiresAt,
          status: "Created",
          start_date: startDate,
          exit_date: exitDate,
          created_by: auth.actor.user_id,
        },
        select: { id: true },
      });

      await tx.induction_step.createMany({
        data: templateSteps.map((step) => ({
          induction_profile_id: profile.id,
          step_number: step.stepNumber,
          title: step.title,
          description: step.description,
          due_date: computeStepDueDate(startDate, step.daysFromStart),
          status: "Pending",
        })),
      });

      return profile;
    });

    revalidatePath("/induction/onboarding-dashboard");

    return { ok: true, inductionProfileId: created.id, token };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not create induction: ${msg}` };
  }
}

export interface RegenerateTokenResult {
  ok: boolean;
  error?: string;
  token?: string;
  expiresAt?: string;
}

export async function regenerateInductionToken(
  inductionProfileId: number,
): Promise<RegenerateTokenResult> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!Number.isFinite(inductionProfileId) || inductionProfileId <= 0) {
    return { ok: false, error: "Invalid induction profile id." };
  }

  const token = generateToken();
  const expiresAt = expiryFromNow();

  try {
    await prisma.induction_profile.update({
      where: { id: inductionProfileId },
      data: {
        link_token: token,
        link_expires_at: expiresAt,
        status: "Sent",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not regenerate token: ${msg}` };
  }

  revalidatePath("/induction/onboarding-dashboard");
  return { ok: true, token, expiresAt: expiresAt.toISOString() };
}

export interface CreateInductionRequestResult {
  ok: boolean;
  error?: string;
  requestId?: number;
}

export async function createInductionRequest(
  targetUserId: number,
): Promise<CreateInductionRequestResult> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return { ok: false, error: "Invalid employee id." };
  }

  const target = await prisma.users.findUnique({
    where: { user_id: targetUserId },
    select: { user_id: true, status: true },
  });
  if (!target) return { ok: false, error: "Selected employee not found." };

  const existingActive = await prisma.induction_request.findFirst({
    where: { user_id: targetUserId, status: { not: "completed" } },
    select: { id: true, status: true },
  });
  if (existingActive) {
    return {
      ok: false,
      error: `An induction request for this employee is already ${existingActive.status}.`,
    };
  }

  try {
    const created = await prisma.induction_request.create({
      data: {
        user_id: targetUserId,
        triggered_by_id: auth.actor.user_id,
        status: "pending",
      },
      select: { id: true },
    });
    revalidatePath("/dashboards/hrms");
    revalidatePath("/induction/onboarding-dashboard");
    return { ok: true, requestId: created.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not create induction request: ${msg}` };
  }
}

export interface CreateBulkInductionRequestsResult {
  ok: boolean;
  error?: string;
  created: number;
  skipped: number;
}

function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".");
}

export async function createInductionRequestForEbrightCandidate(
  candidateSourceId: number,
): Promise<CreateInductionRequestResult> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!Number.isFinite(candidateSourceId)) {
    return { ok: false, error: "Invalid candidate id." };
  }

  const candidate = await prisma.onboarding_candidate.findUnique({
    where: { source_id: candidateSourceId },
  });
  if (!candidate) {
    return { ok: false, error: "Ebrightleads candidate not found." };
  }

  // Reuse if we already promoted this candidate before.
  if (candidate.induction_profile_id) {
    const profile = await prisma.induction_profile.findUnique({
      where: { id: candidate.induction_profile_id },
      select: { user_id: true },
    });
    if (profile) return createInductionRequest(profile.user_id);
  }

  const baseEmail = `${slugifyName(candidate.name) || `candidate-${candidate.source_id}`}@ebrightleads.local`;

  const staffRole = await prisma.role.findFirst({
    where: { role_type: "staff" },
    select: { role_id: true },
  });
  if (!staffRole) {
    return { ok: false, error: "No 'staff' role configured in the system." };
  }

  const department = await prisma.department.findFirst({
    where: { department_name: candidate.department_branch },
    select: { department_id: true },
  });

  try {
    const newUser = await prisma.$transaction(async (tx: TxClient) => {
      // Ensure unique email — append source_id if the slug collides.
      let email = baseEmail;
      const existing = await tx.users.findUnique({ where: { email } });
      if (existing) email = `${slugifyName(candidate.name)}.${candidate.source_id}@ebrightleads.local`;

      const created = await tx.users.create({
        data: {
          email,
          role_id: staffRole.role_id,
          status: "active",
          user_profile: {
            create: { full_name: candidate.name },
          },
          employment: {
            create: {
              position: candidate.position,
              department_id: department?.department_id,
              start_date: candidate.start_date,
              end_date: candidate.end_date,
              status: candidate.candidate_type === "offboarding" ? "offboarding" : "active",
            },
          },
        },
        select: { user_id: true },
      });

      return created;
    });

    const result = await createInductionRequest(newUser.user_id);

    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/induction/hr-dashboard");
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not promote candidate: ${msg}` };
  }
}

export async function createBulkInductionRequests(
  userIds: number[],
): Promise<CreateBulkInductionRequestsResult> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error, created: 0, skipped: 0 };

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { ok: true, created: 0, skipped: 0 };
  }

  let created = 0;
  let skipped = 0;

  for (const userId of userIds) {
    if (!Number.isFinite(userId) || userId <= 0) {
      skipped++;
      continue;
    }

    const target = await prisma.users.findUnique({
      where: { user_id: userId },
      select: { user_id: true },
    });
    if (!target) {
      skipped++;
      continue;
    }

    const existing = await prisma.induction_request.findFirst({
      where: { user_id: userId, status: { not: "completed" } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    try {
      await prisma.induction_request.create({
        data: {
          user_id: userId,
          triggered_by_id: auth.actor.user_id,
          status: "pending",
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }

  if (created > 0) {
    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/induction/hr-dashboard");
    revalidatePath("/induction/hr-dashboard/onboarding-detail");
    revalidatePath("/induction/hr-dashboard/offboarding-detail");
  }

  return { ok: true, created, skipped };
}

export interface AcceptInductionRequestResult {
  ok: boolean;
  error?: string;
  trainingLink?: string;
  inductionProfileId?: number;
  token?: string;
}

export async function acceptInductionRequest(
  requestId: number,
): Promise<AcceptInductionRequestResult> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!Number.isFinite(requestId) || requestId <= 0) {
    return { ok: false, error: "Invalid request id." };
  }

  const request = await prisma.induction_request.findUnique({
    where: { id: requestId },
    include: {
      user: {
        include: {
          user_profile: { select: { full_name: true } },
          employment: {
            where: { status: "active" },
            orderBy: { start_date: "desc" },
            take: 1,
          },
        },
      },
    },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "pending") {
    return { ok: false, error: `Cannot accept a request with status "${request.status}".` };
  }

  const existingProfile = await prisma.induction_profile.findUnique({
    where: { user_id: request.user_id },
    select: { id: true, status: true, link_token: true },
  });

  // New flow path: HR pre-created an induction_profile (status=Sent) via
  // Save & Generate Link on the Employee form. First login created the
  // pending request. Accept just promotes the profile to In Progress
  // and marks the request accepted — no new steps to seed since the
  // existing profile already has them.
  if (existingProfile) {
    try {
      await prisma.$transaction(async (tx: TxClient) => {
        if (existingProfile.status === "Sent") {
          await tx.induction_profile.update({
            where: { id: existingProfile.id },
            data: { status: "In Progress" },
          });
        }
        await tx.induction_request.update({
          where: { id: requestId },
          data: {
            status: "accepted",
            accepted_at: new Date(),
            induction_profile_id: existingProfile.id,
          },
        });
      });

      revalidatePath("/induction/onboarding-dashboard");
      revalidatePath("/dashboards/hrms");
      revalidatePath("/dashboard-employee-management");

      const baseUrl = await getRequestBaseUrl();
      const trainingLink = `${baseUrl}/induction/${existingProfile.link_token}`;
      return {
        ok: true,
        trainingLink,
        inductionProfileId: existingProfile.id,
        token: existingProfile.link_token,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown database error.";
      return { ok: false, error: `Could not accept request: ${msg}` };
    }
  }

  // Legacy path: no pre-existing profile (the old request-first flow
  // used by the EbrightLeads bulk-add buttons). Create the profile +
  // steps + accept the request, as before.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startDate = request.user.employment[0]?.start_date ?? today;
  const token = randomBytes(64).toString("hex");
  const expiresAt = expiryFromNow();
  const templateName = "Standard";
  const templateSteps = WORKFLOW_TEMPLATES[templateName];

  try {
    const profile = await prisma.$transaction(async (tx: TxClient) => {
      const created = await tx.induction_profile.create({
        data: {
          user_id: request.user_id,
          induction_type: "Onboarding",
          workflow_template: templateName,
          link_token: token,
          link_expires_at: expiresAt,
          status: "Sent",
          start_date: startDate,
          created_by: auth.actor.user_id,
        },
        select: { id: true },
      });

      await tx.induction_step.createMany({
        data: templateSteps.map((step) => ({
          induction_profile_id: created.id,
          step_number: step.stepNumber,
          title: step.title,
          description: step.description,
          due_date: computeStepDueDate(startDate, step.daysFromStart),
          status: "Pending",
        })),
      });

      await tx.induction_request.update({
        where: { id: requestId },
        data: {
          status: "accepted",
          accepted_at: new Date(),
          induction_profile_id: created.id,
        },
      });

      return created;
    });

    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/dashboards/hrms");

    const baseUrl = await getRequestBaseUrl();
    const trainingLink = `${baseUrl}/induction/${token}`;

    return {
      ok: true,
      trainingLink,
      inductionProfileId: profile.id,
      token,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not accept request: ${msg}` };
  }
}

export interface DeclineInductionRequestResult {
  ok: boolean;
  error?: string;
}

/**
 * Decline a pending induction request — HR/Admin only.
 *
 * Updates induction_request.status = "declined". The DB unique constraint
 * (one open request per user where status <> 'completed') means a declined
 * row keeps the user "blocked" until the row is removed or status changes
 * again. That matches the spec's "removes from queue" semantics for the
 * HR-facing list.
 */
export async function declineInductionRequest(
  requestId: number,
): Promise<DeclineInductionRequestResult> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!Number.isFinite(requestId) || requestId <= 0) {
    return { ok: false, error: "Invalid request id." };
  }

  const request = await prisma.induction_request.findUnique({
    where: { id: requestId },
    select: { id: true, status: true },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "pending") {
    return {
      ok: false,
      error: `Cannot decline a request with status "${request.status}".`,
    };
  }

  try {
    await prisma.induction_request.update({
      where: { id: requestId },
      data: { status: "declined" },
    });

    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/dashboards/hrms");

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not decline request: ${msg}` };
  }
}

export interface AssignCandidateRoleParams {
  profileId: number;
  role: string;
  departmentId: number;
  branchId: number | null;
  /** Manager the new hire reports to. NOT PERSISTED in this PR — schema has
   *  no reports_to column on employment yet. Accepted for forward-compat
   *  with future schema add. Logged for audit but otherwise ignored. */
  reportsToUserId: number | null;
}

export interface AssignCandidateRoleResult {
  ok: boolean;
  error?: string;
}

/**
 * Move a completed candidate out of the onboarding pipeline by promoting
 * their employment record to the chosen permanent role. Admin-only — gated
 * via the same loadActorAndAuthorize() that other mutations use, narrowed
 * here to admin/superadmin specifically.
 *
 * What this does:
 *  1. Verifies the profile exists, is Onboarding, and status is "Completed"
 *  2. Updates the user's most-recent employment row: position = role,
 *     department_id, branch_id, status = "active"
 *  3. Marks induction_profile.status = "Assigned" so it drops out of
 *     pipeline queries
 *
 * What this does NOT do (deferred):
 *  - reportsToUserId is captured in the form but NOT persisted (no
 *    `reports_to` column on employment yet — add via future schema PR)
 *  - No audit log event yet (audit log subsystem is its own future PR)
 *  - No email notification to the candidate
 */
export async function assignCandidateRole(
  params: AssignCandidateRoleParams,
): Promise<AssignCandidateRoleResult> {
  const { profileId, role, departmentId, branchId, reportsToUserId } = params;

  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  // Narrow further: only admin/superadmin can assign roles. canManageInductions
  // (which loadActorAndAuthorize uses) includes "hr" and "od" too, but the
  // spec says Assign Role is admin-only on this page.
  const roleType = (auth.actor.role_type ?? "").toLowerCase();
  if (roleType !== "admin" && roleType !== "superadmin") {
    return { ok: false, error: "Only admin / superadmin can assign roles." };
  }

  if (!Number.isFinite(profileId) || profileId <= 0) {
    return { ok: false, error: "Invalid profile id." };
  }
  if (!role.trim()) return { ok: false, error: "Role is required." };
  if (!Number.isFinite(departmentId) || departmentId <= 0) {
    return { ok: false, error: "Department is required." };
  }

  const profile = await prisma.induction_profile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      user_id: true,
      induction_type: true,
      status: true,
    },
  });
  if (!profile) return { ok: false, error: "Induction profile not found." };
  if (profile.induction_type === "Offboarding") {
    return { ok: false, error: "Cannot assign a role to an offboarding profile." };
  }
  if (profile.status !== "Completed") {
    return {
      ok: false,
      error: `Cannot assign a role until induction is Completed (current status: "${profile.status}").`,
    };
  }

  // Find the user's most-recent employment row (active or onboarding).
  // If none exists, we create one — the candidate's account was likely
  // created via /register without an immediate employment row.
  const existingEmployment = await prisma.employment.findFirst({
    where: {
      user_id: profile.user_id,
      status: { in: ["active", "onboarding"] },
    },
    orderBy: { start_date: "desc" },
    select: { employment_id: true },
  });

  try {
    await prisma.$transaction(async (tx: TxClient) => {
      if (existingEmployment) {
        await tx.employment.update({
          where: { employment_id: existingEmployment.employment_id },
          data: {
            position: role,
            department_id: departmentId,
            branch_id: branchId,
            status: "active",
          },
        });
      } else {
        await tx.employment.create({
          data: {
            user_id: profile.user_id,
            position: role,
            department_id: departmentId,
            branch_id: branchId,
            status: "active",
            start_date: new Date(),
          },
        });
      }

      await tx.induction_profile.update({
        where: { id: profileId },
        data: { status: "Assigned" },
      });
    });

    console.info(
      "[admin] assignCandidateRole:",
      JSON.stringify({
        profileId,
        userId: profile.user_id,
        role,
        departmentId,
        branchId,
        reportsToUserId,
        assignedBy: auth.actor.role_type,
      }),
    );

    revalidatePath("/admin/onboarding");
    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/dashboards/hrms");

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not assign role: ${msg}` };
  }
}

export interface MarkStepCompleteResult {
  ok: boolean;
  error?: string;
}

/**
 * Token-authenticated action — anyone holding the link may mark steps for that profile.
 * The token must match the step's parent profile, otherwise the call is rejected.
 */
export async function markStepCompleteByToken(
  stepId: number,
  token: string,
): Promise<MarkStepCompleteResult> {
  if (!Number.isFinite(stepId) || stepId <= 0) {
    return { ok: false, error: "Invalid step id." };
  }
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Missing token." };
  }

  const profile = await prisma.induction_profile.findUnique({
    where: { link_token: token },
    select: { id: true, user_id: true, link_expires_at: true, status: true, start_date: true },
  });
  if (!profile) return { ok: false, error: "Invalid or revoked link." };
  if (profile.link_expires_at.getTime() < Date.now()) {
    return { ok: false, error: "This induction link has expired." };
  }

  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, error: "Please sign in to mark steps complete." };
  }
  const actor = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { user_id: true, role: { select: { role_type: true } } },
  });
  if (!actor) return { ok: false, error: "User record not found." };
  const isManager = canManageInductions(actor.role?.role_type ?? null);
  const isOwner = actor.user_id === profile.user_id;
  if (!isManager && !isOwner) {
    return { ok: false, error: "You are not authorized to mark this step complete." };
  }

  const step = await prisma.induction_step.findUnique({
    where: { id: stepId },
    select: {
      id: true,
      title: true,
      induction_profile_id: true,
      status: true,
      due_date: true,
      responsible_person: { select: { email: true } },
    },
  });
  if (!step || step.induction_profile_id !== profile.id) {
    return { ok: false, error: "Step does not belong to this induction." };
  }
  if (step.status === "Completed") {
    return { ok: true };
  }

  // Day-blocking: refuse if any earlier-phase step is still incomplete.
  const targetPhase = phaseFor(step.due_date, profile.start_date);
  const blocker = await findPriorPhaseBlocker(profile.id, profile.start_date, targetPhase);
  if (blocker) {
    return {
      ok: false,
      error: `${PHASE_LABEL[blocker.phase]} isn't complete yet — finish step ${blocker.stepNumber} (${blocker.title}) first.`,
    };
  }

  try {
    await prisma.$transaction(async (tx: TxClient) => {
      await tx.induction_step.update({
        where: { id: stepId },
        data: {
          status: "Completed",
          completed_at: new Date(),
          // Prisma 7 hides the scalar FK on update inputs when the field is
          // bound to a relation; must write through the relation instead.
          completed_by_user: { connect: { user_id: profile.user_id } },
        },
      });

      const remaining = await tx.induction_step.count({
        where: {
          induction_profile_id: profile.id,
          status: { not: "Completed" },
        },
      });

      const nextProfileStatus =
        remaining === 0 ? "Completed" : profile.status === "Created" ? "In Progress" : profile.status === "Sent" ? "In Progress" : profile.status;

      if (nextProfileStatus !== profile.status || remaining === 0) {
        await tx.induction_profile.update({
          where: { id: profile.id },
          data: {
            status: nextProfileStatus,
            completed_at: remaining === 0 ? new Date() : null,
          },
        });
      }

      if (remaining === 0) {
        await tx.induction_request.updateMany({
          where: {
            induction_profile_id: profile.id,
            status: { in: ["accepted", "pending"] },
          },
          data: { status: "completed" },
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not mark step complete: ${msg}` };
  }

  revalidatePath(`/induction/${token}`);
  revalidatePath("/induction/onboarding-dashboard");
  return { ok: true };
}

export interface SubmitEvidenceResult {
  ok: boolean;
  error?: string;
  fileId?: string;
}

/**
 * Upload a photo as evidence for a step, then mark the step Completed.
 * Same auth model as markStepCompleteByToken (token + signed-in owner-or-manager)
 * plus day-blocking: cannot submit if an earlier phase still has incomplete steps.
 */
export async function submitStepEvidenceByToken(
  formData: FormData,
): Promise<SubmitEvidenceResult> {
  const stepId = Number(formData.get("stepId"));
  const token = s(formData, "token");
  const file = formData.get("file");

  if (!Number.isFinite(stepId) || stepId <= 0) {
    return { ok: false, error: "Invalid step id." };
  }
  if (!token) {
    return { ok: false, error: "Missing token." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please attach a photo." };
  }
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  if (!ALLOWED_EVIDENCE_EXTS.has(ext)) {
    return { ok: false, error: "Photo must be JPG or PNG." };
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    return { ok: false, error: "Photo exceeds 10MB." };
  }

  const profile = await prisma.induction_profile.findUnique({
    where: { link_token: token },
    select: {
      id: true,
      user_id: true,
      link_expires_at: true,
      status: true,
      start_date: true,
    },
  });
  if (!profile) return { ok: false, error: "Invalid or revoked link." };
  if (profile.link_expires_at.getTime() < Date.now()) {
    return { ok: false, error: "This induction link has expired." };
  }

  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, error: "Please sign in to submit evidence." };
  }
  const actor = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { user_id: true, role: { select: { role_type: true } } },
  });
  if (!actor) return { ok: false, error: "User record not found." };
  const isManager = canManageInductions(actor.role?.role_type ?? null);
  const isOwner = actor.user_id === profile.user_id;
  if (!isManager && !isOwner) {
    return { ok: false, error: "You are not authorized to submit evidence here." };
  }

  const step = await prisma.induction_step.findUnique({
    where: { id: stepId },
    select: {
      id: true,
      title: true,
      induction_profile_id: true,
      status: true,
      due_date: true,
    },
  });
  if (!step || step.induction_profile_id !== profile.id) {
    return { ok: false, error: "Step does not belong to this induction." };
  }
  if (step.status === "Completed") {
    return { ok: true };
  }

  const targetPhase = phaseFor(step.due_date, profile.start_date);
  const blocker = await findPriorPhaseBlocker(profile.id, profile.start_date, targetPhase);
  if (blocker) {
    return {
      ok: false,
      error: `${PHASE_LABEL[blocker.phase]} isn't complete yet — finish step ${blocker.stepNumber} (${blocker.title}) first.`,
    };
  }

  let evidenceFileId: string;
  try {
    const uploaded = await uploadToDrive(file, {
      prefix: `step-${stepId}`,
      folderPath: ["induction-evidence", String(profile.id)],
      folderEnvVar: "GOOGLE_DRIVE_INDUCTION_FOLDER_ID",
    });
    evidenceFileId = uploaded.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Drive upload failed.";
    return { ok: false, error: msg };
  }

  try {
    await prisma.$transaction(async (tx: TxClient) => {
      await tx.induction_step.update({
        where: { id: stepId },
        data: {
          status: "Completed",
          completed_at: new Date(),
          completed_by_user: { connect: { user_id: profile.user_id } },
          evidence_file_id: evidenceFileId,
          evidence_uploaded_at: new Date(),
        },
      });

      const remaining = await tx.induction_step.count({
        where: {
          induction_profile_id: profile.id,
          status: { not: "Completed" },
        },
      });

      const nextProfileStatus =
        remaining === 0
          ? "Completed"
          : profile.status === "Created" || profile.status === "Sent"
            ? "In Progress"
            : profile.status;

      if (nextProfileStatus !== profile.status || remaining === 0) {
        await tx.induction_profile.update({
          where: { id: profile.id },
          data: {
            status: nextProfileStatus,
            completed_at: remaining === 0 ? new Date() : null,
          },
        });
      }

      if (remaining === 0) {
        await tx.induction_request.updateMany({
          where: {
            induction_profile_id: profile.id,
            status: { in: ["accepted", "pending"] },
          },
          data: { status: "completed" },
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not record evidence: ${msg}` };
  }

  revalidatePath(`/induction/${token}`);
  revalidatePath("/induction/onboarding-dashboard");
  return { ok: true, fileId: evidenceFileId };
}

// ============ Slice E: surveys & recommendations ============

export type SurveySubmissionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function submitSurveyResponse(
  inductionProfileId: number,
  milestone: string,
  responses: Record<string, string | number>,
): Promise<SurveySubmissionResult> {
  try {
    // Authz: only the induction's own candidate or an induction manager may
    // submit a survey response (action was previously unauthenticated).
    const session = await auth();
    if (!session?.user?.email) return { ok: false, error: "Not authenticated." };
    const [actor, profile] = await Promise.all([
      prisma.users.findUnique({
        where: { email: session.user.email },
        select: { user_id: true, role: { select: { role_type: true } } },
      }),
      prisma.induction_profile.findUnique({
        where: { id: inductionProfileId },
        select: { user_id: true },
      }),
    ]);
    if (!profile) return { ok: false, error: "Induction profile not found." };
    const isOwner = actor?.user_id === profile.user_id;
    if (!isOwner && !canManageInductions(actor?.role?.role_type ?? null)) {
      return { ok: false, error: "Not authorized to submit this survey." };
    }

    const template = await prisma.survey_template.findUnique({
      where: { milestone },
    });

    if (!template) {
      return { ok: false, error: "Survey template not found." };
    }

    const numericValues = Object.values(responses).filter(
      (v): v is number => typeof v === "number" && v >= 1 && v <= 5,
    );
    const sentimentScore =
      numericValues.length > 0
        ? Math.round(
            numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
          )
        : null;

    await prisma.survey_response.create({
      data: {
        induction_profile_id: inductionProfileId,
        survey_template_id: template.id,
        responses,
        sentiment_score: sentimentScore,
        submitted_at: new Date(),
      },
    });

    return { ok: true, message: "Survey submitted." };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Failed to submit survey: ${msg}` };
  }
}

export type RecommendationStatus =
  | "New"
  | "In Progress"
  | "Implemented"
  | "Verified";

export async function updateRecommendationStatus(
  recommendationId: number,
  newStatus: RecommendationStatus,
): Promise<void> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return;

  await prisma.recommendation.update({
    where: { id: recommendationId },
    data: {
      status: newStatus,
      completed_at: newStatus === "Verified" ? new Date() : null,
    },
  });

  revalidatePath("/induction/feedback-analytics");
}

// ============ Employee detail modal — manager fetch by user id ============

export type FetchInductionForManagerResult =
  | { ok: true; data: InductionView }
  | { ok: false; error: string };

/**
 * Fetches the full InductionView for a single employee, by user id, on behalf
 * of an HR / admin / CEO viewer (or the inductee themselves). Used by the
 * employee-detail modal on the HR dashboard so a manager can see per-step
 * status and uploaded evidence without needing the induction's link token.
 */
export async function fetchInductionForManager(
  userId: number,
): Promise<FetchInductionForManagerResult> {
  if (!Number.isFinite(userId) || userId <= 0) {
    return { ok: false, error: "Invalid user id." };
  }

  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, error: "Not authenticated." };
  }

  const actor = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { user_id: true, role: { select: { role_type: true } } },
  });
  if (!actor) return { ok: false, error: "User record not found." };

  const isManager = canManageInductions(actor.role?.role_type ?? null);
  const isOwner = actor.user_id === userId;
  if (!isManager && !isOwner) {
    return { ok: false, error: "Not authorised to view this induction." };
  }

  const view = await getOwnInductionView(userId);
  if (!view) {
    return { ok: false, error: "No induction profile exists for this employee yet." };
  }

  return { ok: true, data: view };
}

// ============ Substep template management (HR-only) ============

export interface SubstepActionResult {
  ok: boolean;
  error?: string;
  id?: number;
}

/**
 * Add a sub-task to a parent step in a workflow template.
 * Used by departments / branches to flesh out placeholder steps like
 * "Department Training" and "3-Week Branch Training". HR-gated.
 */
export async function addSubstepTemplate(
  formData: FormData,
): Promise<SubstepActionResult> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  const templateKey = s(formData, "template_key");
  const parentStepRaw = formData.get("parent_step_number");
  const parentStepNumber = Number(parentStepRaw);
  const title = s(formData, "title");
  const description = s(formData, "description") || null;
  const evidenceTypeRaw = s(formData, "evidence_type") || "photo";
  const departmentIdRaw = formData.get("department_id");
  const departmentId =
    typeof departmentIdRaw === "string" && departmentIdRaw.trim() !== ""
      ? Number(departmentIdRaw)
      : null;

  const ALLOWED_EVIDENCE_TYPES = new Set([
    "photo",
    "video",
    "screenshot",
    "document",
    "text",
    "none",
  ]);
  const evidenceType = ALLOWED_EVIDENCE_TYPES.has(evidenceTypeRaw)
    ? evidenceTypeRaw
    : "photo";

  if (!templateKey || !isKnownTemplate(templateKey)) {
    return { ok: false, error: "Unknown workflow template." };
  }
  if (!Number.isFinite(parentStepNumber) || parentStepNumber <= 0) {
    return { ok: false, error: "Invalid parent step number." };
  }
  if (!title || title.length > 200) {
    return { ok: false, error: "Title is required (up to 200 characters)." };
  }
  if (departmentId !== null && (!Number.isFinite(departmentId) || departmentId <= 0)) {
    return { ok: false, error: "Invalid department." };
  }

  try {
    const created = await prisma.induction_substep_template.create({
      data: {
        template_key: templateKey,
        parent_step_number: parentStepNumber,
        department_id: departmentId,
        title,
        description,
        evidence_type: evidenceType,
      },
      select: { id: true },
    });
    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/induction/onboarding-dashboard");
    return { ok: true, id: created.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error.";
    return { ok: false, error: `Could not save sub-task: ${msg}` };
  }
}

export async function deleteSubstepTemplate(
  id: number,
): Promise<SubstepActionResult> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: "Invalid sub-task id." };
  }

  try {
    await prisma.induction_substep_template.delete({ where: { id } });
    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/induction/onboarding-dashboard");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error.";
    return { ok: false, error: `Could not delete sub-task: ${msg}` };
  }
}

// ============ Set HR-assigned induction duration ============

export interface SetInductionDurationResult {
  ok: boolean;
  error?: string;
  durationDays?: number;
}

/**
 * HR sets how many calendar days an induction should take. NULL clears the
 * override and falls back to the template default (3 for most paths, 21 for
 * Coach Part-timer).
 */
export async function setInductionDurationDays(
  inductionProfileId: number,
  days: number | null,
): Promise<SetInductionDurationResult> {
  const auth = await loadActorAndAuthorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!Number.isFinite(inductionProfileId) || inductionProfileId <= 0) {
    return { ok: false, error: "Invalid induction profile id." };
  }
  if (days !== null && (!Number.isFinite(days) || days <= 0 || days > 365)) {
    return { ok: false, error: "Duration must be between 1 and 365 days." };
  }

  try {
    const updated = await prisma.induction_profile.update({
      where: { id: inductionProfileId },
      data: { target_duration_days: days },
      select: { target_duration_days: true, workflow_template: true },
    });
    const effective = updated.target_duration_days ?? defaultDurationDays(updated.workflow_template);
    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/induction/onboarding-dashboard");
    revalidatePath("/induction/hr-dashboard");
    return { ok: true, durationDays: effective };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error.";
    return { ok: false, error: `Could not save duration: ${msg}` };
  }
}

