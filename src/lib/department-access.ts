// Server-only: resolves which departments a signed-in user may see.
// Kept separate from departments.ts because that file is imported by client
// components and must not pull in Prisma.
import { prisma } from "./prisma";
import { DEPARTMENTS, canSeeAllDepartments, type Department } from "./departments";

/**
 * Departments the given user is allowed to open.
 *  - Admins (superadmin, ceo) → all departments.
 *  - Everyone else → only the department of their active employment, matched by
 *    department_code (e.g. HR, FNC). Returns [] if they have no mapped department.
 */
export async function resolveAllowedDepartments(
  email: string,
  role?: string | null,
): Promise<Department[]> {
  if (canSeeAllDepartments(role)) return DEPARTMENTS;

  const user = await prisma.users.findUnique({
    where: { email },
    select: {
      employment: {
        where: { status: "active" },
        take: 1,
        select: { department: { select: { department_code: true } } },
      },
    },
  });

  const code = user?.employment[0]?.department?.department_code ?? null;
  if (!code) return [];

  const dept = DEPARTMENTS.find((d) => d.code.toLowerCase() === code.toLowerCase());
  return dept ? [dept] : [];
}
