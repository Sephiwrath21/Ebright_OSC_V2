import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isOnline } from "./presence";

/** Cheap check: is this email an active member of the department? (one small query) */
export async function isDeptMember(email: string | null | undefined, slug: string): Promise<boolean> {
  const codes = DEPT_CODES[slug.toLowerCase()];
  if (!codes?.length || !email) return false;
  const rows = await prisma.$queryRaw<Array<{ ok: number }>>(Prisma.sql`
    SELECT 1 AS ok FROM users u
    JOIN employment e ON e.user_id = u.user_id AND e.status ILIKE 'active'
    JOIN department d ON d.department_id = e.department_id
    WHERE lower(u.email) = ${email.toLowerCase()} AND d.department_code IN (${Prisma.join(codes)})
    LIMIT 1`);
  return rows.length > 0;
}

/** Active admins (superadmin / ceo). They can chat with every department. */
export async function getAdmins(): Promise<DeptMember[]> {
  const rows = await prisma.$queryRaw<
    Array<{ email: string; name: string | null; role_type: string }>
  >(Prisma.sql`
    SELECT u.email, up.full_name AS name, r.role_type
    FROM users u
    JOIN role r ON r.role_id = u.role_id
    LEFT JOIN user_profile up ON up.user_id = u.user_id
    WHERE u.status ILIKE 'active' AND lower(r.role_type) IN ('superadmin', 'ceo')`);
  return rows.map((r) => ({
    name: (r.name ?? (r.role_type.toLowerCase() === "ceo" ? "CEO" : "Superadmin")).trim(),
    email: r.email,
    role: r.role_type,
    online: isOnline(r.email),
  }));
}

/** Is this email an active admin (superadmin / ceo)? */
export async function isAdminEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const rows = await prisma.$queryRaw<Array<{ ok: number }>>(Prisma.sql`
    SELECT 1 AS ok FROM users u
    JOIN role r ON r.role_id = u.role_id
    WHERE lower(u.email) = ${email.toLowerCase()} AND u.status ILIKE 'active'
      AND lower(r.role_type) IN ('superadmin', 'ceo')
    LIMIT 1`);
  return rows.length > 0;
}

// Department slug (URL) -> department_code in the hrfs DB. These match
// DEPARTMENTS.code; HR also folds in the separate IOP code.
const DEPT_CODES: Record<string, string[]> = {
  optimisation: ["OPT"],
  marketing: ["MKT"],
  finance: ["FNC"],
  hr: ["HR", "IOP"],
  academy: ["ACD"],
  operation: ["OPS"],
};

export type DeptMember = {
  name: string;
  email: string | null;
  role: string | null;
  online: boolean;
};

/**
 * Active members of a department, each flagged with whether they're currently
 * on the website. Sourced from the SAME database as login (hrfs: users +
 * employment + department), so a signed-in user's email always matches their
 * roster row — that's what makes presence light up. Scope is HQ (branch 'HQ'
 * or unassigned/new staff with no branch yet). Online status is in-memory only.
 */
export async function getDepartmentMembers(slug: string): Promise<DeptMember[]> {
  const codes = DEPT_CODES[slug.toLowerCase()];
  if (!codes?.length) return [];

  const rows = await prisma.$queryRaw<
    Array<{ email: string | null; name: string | null; role: string | null }>
  >(Prisma.sql`
    SELECT u.email, up.full_name AS name, e.position AS role
    FROM users u
    JOIN employment e ON e.user_id = u.user_id AND e.status ILIKE 'active'
    JOIN department d ON d.department_id = e.department_id
    LEFT JOIN branch b ON b.branch_id = e.branch_id
    LEFT JOIN user_profile up ON up.user_id = u.user_id
    WHERE d.department_code IN (${Prisma.join(codes)})
      AND u.status ILIKE 'active'
      AND (b.branch_name ILIKE 'HQ' OR b.location ILIKE 'HQ' OR e.branch_id IS NULL)
    ORDER BY up.full_name
  `);

  // One member per email (a user can have >1 active employment row).
  const seen = new Set<string>();
  const members: DeptMember[] = [];
  for (const r of rows) {
    const key = (r.email ?? r.name ?? "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    members.push({
      name: (r.name ?? r.email ?? "Unknown").trim(),
      email: r.email,
      role: r.role,
      online: isOnline(r.email),
    });
  }

  // Admins (superadmin / ceo) can chat with every department, so they appear in
  // every roster (and as a selectable recipient) even without an employment row.
  for (const a of await getAdmins()) {
    const key = a.email?.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    members.push(a);
  }
  return members;
}
