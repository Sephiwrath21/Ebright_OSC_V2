import "server-only";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import { STAFF_ROLE_ID } from "@/lib/employeeQueries";
import { BOARD_STAGE_TO_OUR_STAGE } from "@/lib/boardStageMapping";

export { BOARD_STAGE_TO_OUR_STAGE };

// Syncs EVERY applicant from ebright_hrfs.career_applications — every stage,
// including rejected — into our own Pre stage (users/employment with
// status="pre") — the same shape addPreStageEmployee() creates manually, so
// everything downstream (display, the manual "Proceed" button, the
// advancePreStageEmployees sweep) just works without any special-casing.
// Pre-only, deliberately kept simple — a board_stage-based routing branch
// into Probation, and an accepted/hired-only filter, were both proposed and
// then pulled back out (see conversation) to keep this to the basics.
//
// Every applicant gets synced, whether or not a start_date is known.
// career_applications has no column literally named start_date —
// trial_date is a text column that's empty on all 229 rows; start_trial is
// the only real date field, populated on very few rows. Deliberately no
// cross-database lookup for a start_date — only ebright_hrfs is connected,
// hrfs is not referenced at all. A row synced with no start_date simply won't
// be picked up by advancePreStageEmployees until HR fills one in later —
// expected, not an error. In the Pre stage list, that shows up sorted after
// every dated row (StageFlatListView's ascending default), not gapped/hidden.
//
// Three safety checks before creating/advancing anything:
//  - already a real employee (by normalized name) -> skip, not a new Pre.
//  - already synced previously (a placeholder user with the same normalized
//    name already exists) -> checked against board_stage for advancement
//    (see below), never re-created as a duplicate.
// Dedup has no shared ID to key off (a schema column for this was proposed
// and declined), so it's name-based and therefore approximate — two
// unrelated applicants who happen to share a full name would collide.
//
// Stage advancement is driven by board_stage (career_applications' own
// column) via BOARD_STAGE_TO_OUR_STAGE — REPLACES an earlier version keyed
// off rec_recruit/rec_stage (a separate table pair, joined by an exact FK),
// reverted per explicit decision: board_stage and rec_stage are two
// genuinely different fields that can disagree for the same application
// (confirmed case: Chan Ten Kiat's application id=63 has board_stage=
// "Rejected" but its linked rec_stage was "Trial" — see conversation).
// board_stage is read directly off each row here, no join needed.
//
// Personal Info field mapping (career_applications -> users/user_profile),
// matching exactly what ActiveProfilePanels.tsx's PersonalInfoPanel actually
// shows for Pre stage — see the full mapping table in conversation:
//  - email    -> users.email (replaces the placeholder login email, since
//                that field IS what PersonalInfoPanel displays/edits as
//                "Email" — it doubles as the login identifier). Falls back
//                to the placeholder pattern if the real email is blank or
//                would collide with any existing users.email (real or
//                another placeholder) — users.email is UNIQUE, so a
//                collision must never be allowed to crash the row.
//  - phone    -> user_profile.phone
//  - gender   -> user_profile.gender
// education_level and city have no matching field anywhere in
// user_profile/employment, and PersonalInfoPanel has no slot for either —
// left unmapped (see conversation for the full gap list: also dob, nric,
// home_address, none of which career_applications collects at all).

export interface CareerApplicationRow {
  id: number;
  name: string;
  position: string;
  branch: string | null;
  department: string | null;
  start_trial: Date | null;
  email: string;
  phone: string | null;
  gender: string | null;
  board_stage: string | null;
}

export interface CareerApplicationSyncGap {
  applicationId: number;
  name: string;
  reason: "already-employee" | "duplicate-placeholder" | "no-board-stage-match";
}

export interface CareerApplicationSyncResult {
  created: number;
  updated: number;
  gaps: CareerApplicationSyncGap[];
}

export interface PlaceholderRecord {
  userId: number;
  employmentId: number;
  status: string | null;
  probation: boolean;
  email: string;
  phone: string | null;
  gender: string | null;
}

export interface SyncContext {
  realEmployeeNames: Set<string>;
  // Already-synced applicants, by normalized name — carries their current
  // employment row so the update path (board_stage-driven advancement)
  // knows what to compare against and which row to write.
  placeholdersByName: Map<string, PlaceholderRecord>;
  branchByCode: Map<string, number>;
  departmentByCodeOrName: Map<string, number>;
  usedEmails: Set<string>;
}

export type SyncAction =
  | {
      type: "create";
      startDate: Date | null;
      branchId: number | null;
      departmentId: number | null;
      // The real applicant email, or null if it's blank/would collide with
      // an existing users.email — the write loop falls back to the
      // placeholder pattern in that case.
      email: string | null;
      phone: string | null;
      gender: string | null;
    }
  | {
      // Already-synced applicant needing a refresh — either their current
      // board_stage now resolves to Onboarding (stage) and/or their
      // phone/gender/email in career_applications has since changed, or was
      // never set on our side (personalInfo). Either half may be present
      // alone; the write loop only touches what's set.
      type: "update";
      userId: number;
      employmentId: number;
      stage?: { status: "onboarding"; probation: boolean };
      // Each field is present only if it actually needs writing — absent
      // (not just falsy) means "leave this field alone." A present value of
      // null means "career_applications' current value is genuinely blank,
      // sync that blankness over" — distinct from "don't touch."
      personalInfo?: { email?: string | null; phone?: string | null; gender?: string | null };
    }
  | { type: "skip"; reason: CareerApplicationSyncGap["reason"] };

export function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CareerApplicationLookupEntry {
  applicationId: number;
  boardStage: string | null;
  hiringNote: string | null;
}

// Live name-matched lookup into career_applications — used wherever a
// synced Pre/Probation record's page needs to reflect that source row's
// CURRENT data (board_stage for the list Status column and the Probation
// list's dual-listing; feedback1/feedback2 as the Hiring Notes fallback),
// not just what was true at sync time. Same normalizeName matching the sync
// itself uses, same "approximate, name-based" caveat. Cheap in practice —
// career_applications is ~230 rows total — so always fetches the full table
// rather than trying to filter server-side by a list of names.
export async function lookupCareerApplicationsByName(): Promise<Map<string, CareerApplicationLookupEntry>> {
  const { rows } = await queryEbrightHrfs<{
    id: number;
    name: string;
    board_stage: string | null;
    feedback1: string | null;
    feedback2: string | null;
  }>(`select id, name, board_stage, feedback1, feedback2 from public.career_applications`);

  const map = new Map<string, CareerApplicationLookupEntry>();
  for (const r of rows) {
    const key = normalizeName(r.name);
    if (!key) continue;
    map.set(key, {
      applicationId: r.id,
      boardStage: r.board_stage,
      hiringNote: (r.feedback1?.trim() || r.feedback2?.trim()) || null,
    });
  }
  return map;
}

// Pure per-applicant decision — no I/O, fully unit-testable without a
// database or mocks. The DB-writing loop below just executes what this
// returns.
export function decideSyncAction(app: CareerApplicationRow, ctx: SyncContext): SyncAction {
  const key = normalizeName(app.name);

  const placeholder = ctx.placeholdersByName.get(key);
  if (placeholder) {
    const mapped = app.board_stage ? BOARD_STAGE_TO_OUR_STAGE[app.board_stage] : undefined;
    const stage =
      mapped && (placeholder.status !== mapped.status || placeholder.probation !== mapped.probation)
        ? { status: mapped.status, probation: mapped.probation }
        : undefined;

    // Personal info refresh — phone/gender always refreshed to match
    // career_applications' current value (per explicit decision, this is an
    // ongoing sync, not a one-time fill); email only filled in if it's still
    // the auto-generated placeholder pattern, never overwriting a real
    // email that's since been set (manually or by an earlier sync run) —
    // users.email is the login identifier, so silently changing an
    // already-real value would be a genuinely surprising, risky side effect.
    const newPhone = app.phone?.trim() || null;
    const newGender = app.gender?.trim() || null;
    const phoneChanged = newPhone !== placeholder.phone;
    const genderChanged = newGender !== placeholder.gender;
    const isPlaceholderEmail = placeholder.email.startsWith("pre-") && placeholder.email.endsWith("@placeholder.ebright.my");
    const normalizedNewEmail = app.email ? normalizeEmail(app.email) : "";
    const emailFillable = isPlaceholderEmail && normalizedNewEmail && !ctx.usedEmails.has(normalizedNewEmail);
    const personalInfo =
      phoneChanged || genderChanged || emailFillable
        ? {
            ...(phoneChanged ? { phone: newPhone } : {}),
            ...(genderChanged ? { gender: newGender } : {}),
            ...(emailFillable ? { email: app.email.trim() } : {}),
          }
        : undefined;

    if (!stage && !personalInfo) {
      return { type: "skip", reason: mapped ? "duplicate-placeholder" : "no-board-stage-match" };
    }
    return { type: "update", userId: placeholder.userId, employmentId: placeholder.employmentId, stage, personalInfo };
  }
  if (ctx.realEmployeeNames.has(key)) return { type: "skip", reason: "already-employee" };

  const branchId = app.branch ? ctx.branchByCode.get(app.branch.toUpperCase()) ?? null : null;
  const departmentId = app.department ? ctx.departmentByCodeOrName.get(app.department.toUpperCase()) ?? null : null;
  const normalizedEmail = app.email ? normalizeEmail(app.email) : "";
  const email = normalizedEmail && !ctx.usedEmails.has(normalizedEmail) ? app.email.trim() : null;
  return {
    type: "create",
    startDate: app.start_trial,
    branchId,
    departmentId,
    email,
    phone: app.phone?.trim() || null,
    gender: app.gender?.trim() || null,
  };
}

export async function syncCareerApplicationsToPreStage(): Promise<CareerApplicationSyncResult> {
  const gaps: CareerApplicationSyncGap[] = [];
  let created = 0;
  let updated = 0;

  // No filter — every row, every stage (new/screening/interview/offer/
  // hired/rejected alike). Widened from an accepted/hired-only filter per
  // explicit decision (see conversation).
  const { rows: applications } = await queryEbrightHrfs<CareerApplicationRow>(
    `select id, name, position, branch, department, start_trial, email, phone, gender, board_stage
     from public.career_applications`,
  );
  if (applications.length === 0) return { created, updated, gaps };

  const [branches, departments, existingUsers, placeholderUsers, allUserEmails] = await Promise.all([
    prisma.branch.findMany({ select: { branch_id: true, branch_code: true } }),
    prisma.department.findMany({ select: { department_id: true, department_code: true, department_name: true } }),
    prisma.user_profile.findMany({ select: { full_name: true } }),
    prisma.users.findMany({
      where: { email: { startsWith: "pre-", endsWith: "@placeholder.ebright.my" } },
      select: {
        user_id: true,
        email: true,
        user_profile: { select: { full_name: true, phone: true, gender: true } },
        employment: { orderBy: { start_date: "desc" }, take: 1, select: { employment_id: true, status: true, probation: true } },
      },
    }),
    prisma.users.findMany({ select: { email: true } }),
  ]);

  const placeholdersByName = new Map<string, PlaceholderRecord>();
  for (const u of placeholderUsers) {
    const key = normalizeName(u.user_profile?.full_name ?? "");
    const emp = u.employment[0];
    if (!key || !emp) continue;
    placeholdersByName.set(key, {
      userId: u.user_id,
      employmentId: emp.employment_id,
      status: emp.status,
      probation: emp.probation,
      email: u.email,
      phone: u.user_profile?.phone ?? null,
      gender: u.user_profile?.gender ?? null,
    });
  }

  const ctx: SyncContext = {
    realEmployeeNames: new Set(existingUsers.map((u) => normalizeName(u.full_name))),
    placeholdersByName,
    branchByCode: new Map(branches.filter((b) => b.branch_code).map((b) => [b.branch_code!.toUpperCase(), b.branch_id])),
    departmentByCodeOrName: new Map<string, number>(),
    usedEmails: new Set(allUserEmails.map((u) => normalizeEmail(u.email))),
  };
  for (const d of departments) {
    ctx.departmentByCodeOrName.set(d.department_code.toUpperCase(), d.department_id);
    ctx.departmentByCodeOrName.set(d.department_name.toUpperCase(), d.department_id);
  }

  for (const app of applications) {
    const key = normalizeName(app.name);
    if (!key) continue;

    const action = decideSyncAction(app, ctx);
    if (action.type === "skip") {
      gaps.push({ applicationId: app.id, name: app.name, reason: action.reason });
      continue;
    }

    if (action.type === "update") {
      const previous = ctx.placeholdersByName.get(key)!;
      await Promise.all([
        action.stage
          ? prisma.employment.update({
              where: { employment_id: action.employmentId },
              data: { status: action.stage.status, probation: action.stage.probation },
            })
          : Promise.resolve(),
        action.personalInfo
          ? prisma.users.update({
              where: { user_id: action.userId },
              data: {
                ...(action.personalInfo.email !== undefined ? { email: action.personalInfo.email! } : {}),
                user_profile: {
                  update: {
                    ...(action.personalInfo.phone !== undefined ? { phone: action.personalInfo.phone } : {}),
                    ...(action.personalInfo.gender !== undefined ? { gender: action.personalInfo.gender } : {}),
                  },
                },
              },
            })
          : Promise.resolve(),
      ]);
      // Reflect the new state in ctx so a duplicate application row later in
      // this same run (or the "already at target" no-op check) sees it.
      ctx.placeholdersByName.set(key, {
        userId: action.userId,
        employmentId: action.employmentId,
        status: action.stage?.status ?? previous.status,
        probation: action.stage?.probation ?? previous.probation,
        email: action.personalInfo?.email !== undefined ? action.personalInfo.email! : previous.email,
        phone: action.personalInfo?.phone !== undefined ? action.personalInfo.phone : previous.phone,
        gender: action.personalInfo?.gender !== undefined ? action.personalInfo.gender : previous.gender,
      });
      if (action.personalInfo?.email !== undefined) ctx.usedEmails.add(normalizeEmail(action.personalInfo.email!));
      updated++;
      continue;
    }

    const placeholderEmail = `pre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.ebright.my`;
    const email = action.email ?? placeholderEmail;
    const created_ = await prisma.users.create({
      data: {
        email,
        role_id: STAFF_ROLE_ID,
        status: "active",
        user_profile: { create: { full_name: app.name, phone: action.phone, gender: action.gender } },
        employment: {
          create: {
            position: app.position,
            branch_id: action.branchId,
            department_id: action.departmentId,
            start_date: action.startDate,
            status: "pre",
          },
        },
      },
      select: { user_id: true, employment: { select: { employment_id: true } } },
    });
    // Prevent a second application row in the same run from also matching
    // this name (e.g. a re-submitted/duplicate application), and from
    // reusing the same email (e.g. a re-submitted/duplicate application, or
    // two different applicants who happen to share an inbox).
    ctx.placeholdersByName.set(key, {
      userId: created_.user_id,
      employmentId: created_.employment[0].employment_id,
      status: "pre",
      probation: false,
      email,
      phone: action.phone,
      gender: action.gender,
    });
    ctx.usedEmails.add(normalizeEmail(email));
    created++;
  }

  return { created, updated, gaps };
}
