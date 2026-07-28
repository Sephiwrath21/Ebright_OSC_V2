import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Shape consumed by the planning grid: { id, name, branch (full name), role }.
// `role` follows the old convention where a branch manager is rendered as
// `branch_manager_<lowercased first 3 letters of branch name>` so the Manager
// on Duty dropdown can pick them out. Everyone else gets role=null.
interface StaffPayload {
  id: number;
  name: string;
  fullName: string;
  branch: string;
  role: string | null;
  endDate: string | null;
}

const MANAGER_POSITIONS = new Set(["BM", "BRANCH MANAGER", "MANAGER"]);

// Positions that can be picked in the manpower grid. Anything else
// (e.g. "INTERN", "ADMIN", "PART TIME" without "COACH") is excluded.
const ASSIGNABLE_POSITIONS = new Set([
  "BM",
  "BRANCH MANAGER",
  "MANAGER",
  "FT COACH",
  "PT COACH",
  "FULL TIME COACH",
  "PART TIME COACH",
]);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const branchIdParam = url.searchParams.get("branch_id");
    const branchNameParam = url.searchParams.get("branch");

    // Resolve an optional branch filter at the SQL layer.
    let branchIdFilter: number | undefined;
    if (branchIdParam && !Number.isNaN(Number(branchIdParam))) {
      branchIdFilter = Number(branchIdParam);
    } else if (branchNameParam) {
      const b = await prisma.branch.findFirst({
        where: { branch_name: branchNameParam },
        select: { branch_id: true },
      });
      if (b) branchIdFilter = b.branch_id;
      else return NextResponse.json([]);
    }

    // Pull every active employee with a branch — no position filter, so all
    // employees of the requested branch surface in the grid dropdowns.
    // Latest employment wins (transfers are reflected immediately).
    const users = await prisma.users.findMany({
      where: {
        status: "active",
        deleted_at: null,
        employment: {
          some: branchIdFilter
            ? { branch_id: branchIdFilter }
            : { branch_id: { not: null } },
        },
      },
      select: {
        user_id: true,
        user_profile: { select: { full_name: true, nick_name: true } },
        employment: {
          orderBy: { employment_id: "desc" },
          take: 1,
          where: branchIdFilter ? { branch_id: branchIdFilter } : undefined,
          select: {
            position: true,
            branch: { select: { branch_name: true } },
            end_date: true,
          },
        },
      },
    });

    const payload: StaffPayload[] = users.flatMap((u) => {
      const emp = u.employment[0];
      if (!emp?.branch?.branch_name) return [];
      const displayName =
        u.user_profile?.nick_name?.trim() ||
        u.user_profile?.full_name?.trim();
      if (!displayName) return [];
      const position = emp.position?.toUpperCase().trim() ?? "";
      // Only BM / FT COACH / PT COACH (and variants). Excludes intern, admin,
      // and any other non-assignable role.
      if (!ASSIGNABLE_POSITIONS.has(position)) return [];
      const branchName = emp.branch.branch_name;
      const role = MANAGER_POSITIONS.has(position)
        ? `branch_manager_${branchName.substring(0, 3).toLowerCase()}`
        : null;
      return [
        {
          id: u.user_id,
          name: displayName,
          fullName: u.user_profile?.full_name?.trim() || displayName,
          branch: branchName,
          role,
          endDate: emp.end_date ? emp.end_date.toISOString() : null,
        },
      ];
    });

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[GET /api/branch-staff]", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
