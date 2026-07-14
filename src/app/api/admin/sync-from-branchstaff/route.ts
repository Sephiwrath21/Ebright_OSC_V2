import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["superadmin", "ceo", "hr"]);

// Copies HRFS BranchStaff fields into the LOCAL DB so the Employee Dashboard,
// Summary, and Report reflect the same data as BranchStaff. Match key is
// employment.employee_id == BranchStaff.employeeId.
//
// Fields synced per matched employment row:
//   user_profile.full_name      ← BranchStaff.name (when present and non-empty)
//   employment.position         ← BranchStaff.position
//   employment.branch_id        ← BranchStaff.branch  (lookup local branch by branch_code)
//   employment.department_id    ← BranchStaff.department (lookup local department by name)
//   employment.working_hours_json ← BranchStaff.workingHours
//   employment_schedule_version ← BranchStaffSchedule rows (versioned history)
//
// Idempotent — safe to re-run. Updates existing rows only; doesn't CREATE
// new users/employments (creating a user needs a password, which BranchStaff
// doesn't carry). Unmatched BranchStaff entries surface in the report so HR
// can decide whether to add them manually.
export async function POST() {
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1) Pull current snapshot from HRFS — active staff with employeeId.
  //    Filtering on employeeId only (NOT workingHours) so we still sync
  //    name/branch/dept/position for people whose schedule isn't set yet.
  const bs = await queryEbrightHrfs<{
    id: number;
    employee_id: string | null;
    name: string | null;
    branch: string | null;
    position: string | null;
    department: string | null;
    working_hours: unknown;
  }>(
    `SELECT id, "employeeId" AS employee_id, name, branch, position, department,
            "workingHours" AS working_hours
       FROM public."BranchStaff"
      WHERE status = 'Active' AND "employeeId" IS NOT NULL`,
  );

  // 2) Pull versioned schedule rows if the table is there.
  type HrfsVersion = {
    branch_staff_id: number;
    effective_from: string;
    schedule: unknown;
  };
  let hrfsVersions: HrfsVersion[] = [];
  try {
    const res = await queryEbrightHrfs<HrfsVersion>(
      `SELECT "branchStaffId" AS branch_staff_id,
              to_char("effectiveFrom", 'YYYY-MM-DD') AS effective_from,
              schedule
         FROM public."BranchStaffSchedule"`,
    );
    hrfsVersions = res.rows;
  } catch (e) {
    void e;
  }

  const branchStaffIdToEmployeeId = new Map<number, string>();
  for (const row of bs.rows) {
    if (row.employee_id) branchStaffIdToEmployeeId.set(row.id, row.employee_id);
  }
  const sourceCodes = [...new Set(bs.rows.map((b) => b.employee_id).filter((x): x is string => !!x))];

  // 3) Local lookups (matched once, used per-row below).
  const [localEmps, localBranches, localDepts] = await Promise.all([
    prisma.employment.findMany({
      where: {
        status: "active",
        employee_id: { in: sourceCodes },
      },
      select: {
        employment_id: true,
        user_id: true,
        employee_id: true,
        position: true,
        branch_id: true,
        department_id: true,
        users: {
          select: { user_profile: { select: { profile_id: true, full_name: true } } },
        },
      },
    }),
    prisma.branch.findMany({
      select: { branch_id: true, branch_code: true, branch_name: true },
    }),
    prisma.department.findMany({
      select: { department_id: true, department_code: true, department_name: true },
    }),
  ]);

  const empByCode = new Map<string, (typeof localEmps)[number]>();
  for (const e of localEmps) if (e.employee_id) empByCode.set(e.employee_id, e);
  // Branch lookup is by branch_code (HQ, ST, AMP, etc.) — case-sensitive
  // match against BranchStaff.branch.
  const branchByCode = new Map<string, number>();
  for (const b of localBranches) if (b.branch_code) branchByCode.set(b.branch_code, b.branch_id);
  // Department lookup tries name first, code second (BranchStaff.department
  // is usually the human name e.g. "Academy", "HR", "Operation").
  const deptByName = new Map<string, number>();
  for (const d of localDepts) deptByName.set(d.department_name.toLowerCase(), d.department_id);
  const deptByCode = new Map<string, number>();
  for (const d of localDepts) deptByCode.set(d.department_code, d.department_id);

  // 4) Per-row updates. Each field tracked separately so the report shows
  //    exactly what got synced.
  let updatedSchedule = 0;
  let updatedName = 0;
  let updatedPosition = 0;
  let updatedBranch = 0;
  let updatedDepartment = 0;
  const unmatchedStaff: string[] = [];
  const unknownBranches = new Set<string>();
  const unknownDepts = new Set<string>();

  for (const row of bs.rows) {
    if (!row.employee_id) continue;
    const emp = empByCode.get(row.employee_id);
    if (!emp) {
      unmatchedStaff.push(`${row.name ?? "?"} (${row.employee_id})`);
      continue;
    }

    // ── name ────────────────────────────────────────────────────────
    if (row.name && row.name.trim()) {
      const newName = row.name.trim();
      if (emp.users.user_profile) {
        if ((emp.users.user_profile.full_name ?? "").trim() !== newName) {
          await prisma.user_profile.update({
            where: { profile_id: emp.users.user_profile.profile_id },
            data: { full_name: newName },
          });
          updatedName += 1;
        }
      } else {
        // No user_profile row yet — create one so the dashboard has a name.
        await prisma.user_profile.create({
          data: { user_id: emp.user_id, full_name: newName },
        });
        updatedName += 1;
      }
    }

    // ── employment fields (build a delta object so we issue one UPDATE) ─
    const empUpdate: Record<string, unknown> = {};

    // position
    if (row.position && row.position.trim() && (emp.position ?? "") !== row.position.trim()) {
      empUpdate.position = row.position.trim();
      updatedPosition += 1;
    }

    // branch — lookup by branch_code
    if (row.branch && row.branch.trim()) {
      const newBranchId = branchByCode.get(row.branch.trim());
      if (newBranchId === undefined) {
        unknownBranches.add(row.branch.trim());
      } else if (emp.branch_id !== newBranchId) {
        empUpdate.branch_id = newBranchId;
        updatedBranch += 1;
      }
    }

    // department — lookup by name (lowercased), then by code
    if (row.department && row.department.trim()) {
      const raw = row.department.trim();
      const newDeptId = deptByName.get(raw.toLowerCase()) ?? deptByCode.get(raw);
      if (newDeptId === undefined) {
        unknownDepts.add(raw);
      } else if (emp.department_id !== newDeptId) {
        empUpdate.department_id = newDeptId;
        updatedDepartment += 1;
      }
    }

    // working hours (existing behaviour)
    if (row.working_hours !== null && row.working_hours !== undefined) {
      empUpdate.working_hours_json = row.working_hours as never;
      updatedSchedule += 1;
    }

    if (Object.keys(empUpdate).length > 0) {
      await prisma.employment.update({
        where: { employment_id: emp.employment_id },
        data: empUpdate,
      });
    }
  }

  // 5) Upsert versioned rows where we can map them via employee_id.
  let upsertedVersions = 0;
  const unmappedVersions: number[] = [];
  for (const v of hrfsVersions) {
    const code = branchStaffIdToEmployeeId.get(v.branch_staff_id);
    if (!code) {
      unmappedVersions.push(v.branch_staff_id);
      continue;
    }
    const emp = empByCode.get(code);
    if (!emp) {
      unmappedVersions.push(v.branch_staff_id);
      continue;
    }
    await prisma.employment_schedule_version.upsert({
      where: {
        employment_id_effective_from: {
          employment_id: emp.employment_id,
          effective_from: new Date(v.effective_from + "T00:00:00Z"),
        },
      },
      create: {
        employment_id: emp.employment_id,
        effective_from: new Date(v.effective_from + "T00:00:00Z"),
        schedule: v.schedule as never,
      },
      update: { schedule: v.schedule as never },
    });
    upsertedVersions += 1;
  }

  return NextResponse.json({
    ok: true,
    branchStaffScanned: bs.rows.length,
    matchedToLocal: bs.rows.length - unmatchedStaff.length,
    updated: {
      schedule: updatedSchedule,
      name: updatedName,
      position: updatedPosition,
      branch: updatedBranch,
      department: updatedDepartment,
      scheduleVersions: upsertedVersions,
    },
    unmatchedStaff: unmatchedStaff.slice(0, 25),
    unmatchedStaffCount: unmatchedStaff.length,
    unknownBranches: [...unknownBranches],
    unknownDepts: [...unknownDepts],
    unmappedVersionCount: unmappedVersions.length,
  });
}

export async function GET() {
  return POST();
}
