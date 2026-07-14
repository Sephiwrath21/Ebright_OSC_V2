import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["superadmin", "ceo"]);

// Per-run safety cap. Default 50, configurable via ?limit=N up to MAX_LIMIT.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

// Creates local user accounts for BranchStaff entries that exist on HRFS but
// have no matching employment.employee_id locally.
//
// For each unmatched BranchStaff with non-empty employeeId AND email:
//   1. If users.email already exists locally → reuse that user, only create
//      a missing employment row (avoids duplicate accounts).
//   2. Else → create users + user_profile + employment in one transaction.
//      Password is a random 12-char string, bcrypt-hashed. The plain password
//      is returned in the response so HR can hand it to the new user (or send
//      a password-reset email).
//
// Locked to superadmin/CEO (NOT HR) — creating accounts is higher-risk than
// the other sync endpoint. Use POST with ?dryRun=1 first to preview.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  const roleType = me?.role?.role_type?.toLowerCase() ?? "";
  if (!ALLOWED_ROLES.has(roleType)) {
    return NextResponse.json(
      { error: "Forbidden — superadmin or CEO only" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const limitParam = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, Math.floor(limitParam)), MAX_LIMIT)
    : DEFAULT_LIMIT;

  // 1) Default role for new accounts. Look up "STAFF" or "USER" first; if
  //    neither exists, fall back to the lowest role_id in the table (least
  //    privileged by convention).
  const allRoles = await prisma.role.findMany({
    select: { role_id: true, role_type: true },
    orderBy: { role_id: "asc" },
  });
  if (allRoles.length === 0) {
    return NextResponse.json(
      { error: "No roles defined in local DB — cannot assign role to new users" },
      { status: 500 },
    );
  }
  const defaultRoleId =
    allRoles.find((r) => r.role_type.toLowerCase() === "staff")?.role_id ??
    allRoles.find((r) => r.role_type.toLowerCase() === "user")?.role_id ??
    allRoles[allRoles.length - 1].role_id; // last entry — typically the least privileged

  // 2) Pull HRFS BranchStaff with the fields we need to create a usable account.
  const bs = await queryEbrightHrfs<{
    employee_id: string | null;
    name: string | null;
    email: string | null;
    branch: string | null;
    position: string | null;
    department: string | null;
    phone: string | null;
    nric: string | null;
    gender: string | null;
    start_date: string | null;
    working_hours: unknown;
  }>(
    `SELECT "employeeId" AS employee_id, name, email, branch, position, department,
            phone, nric, gender, start_date, "workingHours" AS working_hours
       FROM public."BranchStaff"
      WHERE status = 'Active' AND "employeeId" IS NOT NULL`,
  );

  // 3) Local lookups
  const sourceCodes = bs.rows.map((b) => b.employee_id).filter((x): x is string => !!x);
  const existingByCode = new Set(
    (
      await prisma.employment.findMany({
        where: { employee_id: { in: sourceCodes } },
        select: { employee_id: true },
      })
    )
      .map((e) => e.employee_id)
      .filter((x): x is string => !!x),
  );

  // Branch + department lookup tables (same logic as sync-from-branchstaff)
  const [branches, depts] = await Promise.all([
    prisma.branch.findMany({ select: { branch_id: true, branch_code: true } }),
    prisma.department.findMany({
      select: { department_id: true, department_code: true, department_name: true },
    }),
  ]);
  const branchByCode = new Map<string, number>();
  for (const b of branches) if (b.branch_code) branchByCode.set(b.branch_code, b.branch_id);
  const deptByName = new Map<string, number>();
  for (const d of depts) deptByName.set(d.department_name.toLowerCase(), d.department_id);
  const deptByCode = new Map<string, number>();
  for (const d of depts) deptByCode.set(d.department_code, d.department_id);

  // 4) Build the candidate list (unmatched + has email).
  type Candidate = {
    employeeId: string;
    name: string;
    email: string;
    branch: string | null;
    position: string | null;
    department: string | null;
    phone: string | null;
    nric: string | null;
    gender: string | null;
    startDate: string | null;
    workingHours: unknown;
  };
  const candidates: Candidate[] = [];
  const skippedNoEmail: string[] = [];
  const skippedNoName: string[] = [];
  for (const r of bs.rows) {
    if (!r.employee_id) continue;
    if (existingByCode.has(r.employee_id)) continue; // already linked
    if (!r.name || !r.name.trim()) {
      skippedNoName.push(r.employee_id);
      continue;
    }
    if (!r.email || !r.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim())) {
      skippedNoEmail.push(`${r.name.trim()} (${r.employee_id})`);
      continue;
    }
    candidates.push({
      employeeId: r.employee_id,
      name: r.name.trim(),
      email: r.email.trim().toLowerCase(),
      branch: r.branch?.trim() ?? null,
      position: r.position?.trim() ?? null,
      department: r.department?.trim() ?? null,
      phone: r.phone?.trim() ?? null,
      nric: r.nric?.trim() ?? null,
      gender: r.gender?.trim() ?? null,
      startDate: r.start_date?.trim() ?? null,
      workingHours: r.working_hours,
    });
  }

  // 5) Find pre-existing users by email (so we LINK instead of duplicating).
  const existingUserByEmail = new Map<string, number>();
  if (candidates.length > 0) {
    const found = await prisma.users.findMany({
      where: { email: { in: candidates.map((c) => c.email) } },
      select: { user_id: true, email: true },
    });
    for (const u of found) existingUserByEmail.set(u.email.toLowerCase(), u.user_id);
  }

  const toProcess = candidates.slice(0, limit);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      defaultRoleId,
      defaultRoleType: allRoles.find((r) => r.role_id === defaultRoleId)?.role_type ?? "?",
      totalUnmatched: candidates.length,
      wouldProcess: toProcess.length,
      wouldLinkExistingUser: toProcess.filter((c) => existingUserByEmail.has(c.email)).length,
      wouldCreateNewUser: toProcess.filter((c) => !existingUserByEmail.has(c.email)).length,
      skippedNoEmail: skippedNoEmail.slice(0, 25),
      skippedNoEmailCount: skippedNoEmail.length,
      skippedNoName: skippedNoName.slice(0, 25),
      skippedNoNameCount: skippedNoName.length,
    });
  }

  // 6) Real run. Process candidates one at a time so a single failure doesn't
  //    take the whole batch down.
  const created: Array<{ employeeId: string; email: string; name: string; tempPassword: string }> = [];
  const linked: Array<{ employeeId: string; email: string; name: string; existingUserId: number }> = [];
  const errors: Array<{ employeeId: string; email: string; error: string }> = [];

  function parseStartDate(s: string | null): Date | null {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }

  for (const c of toProcess) {
    try {
      const branchId = c.branch ? branchByCode.get(c.branch) ?? null : null;
      const deptId = c.department
        ? deptByName.get(c.department.toLowerCase()) ?? deptByCode.get(c.department) ?? null
        : null;
      const startDate = parseStartDate(c.startDate);

      const existingUserId = existingUserByEmail.get(c.email);

      if (existingUserId) {
        // Link path — create employment for existing user.
        await prisma.employment.create({
          data: {
            user_id: existingUserId,
            employee_id: c.employeeId,
            branch_id: branchId,
            department_id: deptId,
            position: c.position,
            start_date: startDate,
            status: "active",
            working_hours_json: (c.workingHours ?? null) as never,
          },
        });
        linked.push({
          employeeId: c.employeeId,
          email: c.email,
          name: c.name,
          existingUserId,
        });
        continue;
      }

      // Create path — fresh user + profile + employment in one transaction.
      const tempPassword = randomBytes(8).toString("base64").replace(/[/+=]/g, "").slice(0, 12);
      const hashed = await bcrypt.hash(tempPassword, 10);

      await prisma.$transaction(async (tx) => {
        const u = await tx.users.create({
          data: {
            email: c.email,
            password: hashed,
            role_id: defaultRoleId,
            status: "active",
          },
          select: { user_id: true },
        });
        await tx.user_profile.create({
          data: {
            user_id: u.user_id,
            full_name: c.name,
            phone: c.phone,
            nric: c.nric,
            gender: c.gender,
          },
        });
        await tx.employment.create({
          data: {
            user_id: u.user_id,
            employee_id: c.employeeId,
            branch_id: branchId,
            department_id: deptId,
            position: c.position,
            start_date: startDate,
            status: "active",
            working_hours_json: (c.workingHours ?? null) as never,
          },
        });
      });

      created.push({
        employeeId: c.employeeId,
        email: c.email,
        name: c.name,
        tempPassword,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ employeeId: c.employeeId, email: c.email, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    defaultRoleType: allRoles.find((r) => r.role_id === defaultRoleId)?.role_type ?? "?",
    totalUnmatched: candidates.length,
    processed: toProcess.length,
    createdCount: created.length,
    linkedCount: linked.length,
    errorCount: errors.length,
    skippedNoEmailCount: skippedNoEmail.length,
    skippedNoNameCount: skippedNoName.length,
    // ⚠ tempPassword values are sensitive — hand them to each user and
    // require they change on first login. Returned ONCE; rerunning the
    // endpoint will not create them again (since the user now exists).
    created,
    linked,
    errors,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
