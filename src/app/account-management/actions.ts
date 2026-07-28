"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { titleCaseName } from "@/lib/text";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLE_TYPES = new Set(["superadmin", "ceo"]);

/**
 * Confirms the caller is signed in and holds a superadmin/ceo role.
 * Returns the caller's own user_id so mutations can guard self-targeting.
 */
async function authorize(): Promise<
  { ok: true; userId: number } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, error: "Not authenticated." };
  }
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { user_id: true, role: { select: { role_type: true } } },
  });
  const roleType = me?.role?.role_type?.toLowerCase() ?? "";
  if (!me || !ALLOWED_ROLE_TYPES.has(roleType)) {
    return { ok: false, error: "You don't have permission to manage accounts." };
  }
  return { ok: true, userId: me.user_id };
}

export async function updateAccountRole(
  userId: number,
  roleId: number,
): Promise<ActionResult> {
  const guard = await authorize();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!Number.isInteger(userId) || !Number.isInteger(roleId)) {
    return { ok: false, error: "Invalid request." };
  }

  const role = await prisma.role.findUnique({
    where: { role_id: roleId },
    select: { role_id: true },
  });
  if (!role) return { ok: false, error: "That role no longer exists." };

  try {
    await prisma.users.update({
      where: { user_id: userId },
      data: { role_id: roleId, updated_at: new Date() },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not update role: ${msg}` };
  }

  revalidatePath("/account-management");
  return { ok: true };
}

export async function updateAccountEmail(
  userId: number,
  emailRaw: string,
): Promise<ActionResult> {
  const guard = await authorize();
  if (!guard.ok) return { ok: false, error: guard.error };

  const email = emailRaw.trim().toLowerCase();
  if (!email) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const clash = await prisma.users.findUnique({
    where: { email },
    select: { user_id: true },
  });
  if (clash && clash.user_id !== userId) {
    return { ok: false, error: "Another account already uses that email." };
  }

  try {
    await prisma.users.update({
      where: { user_id: userId },
      data: { email, updated_at: new Date() },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not update email: ${msg}` };
  }

  revalidatePath("/account-management");
  return { ok: true };
}

export async function updateAccountName(
  userId: number,
  nameRaw: string,
): Promise<ActionResult> {
  const guard = await authorize();
  if (!guard.ok) return { ok: false, error: guard.error };

  const name = titleCaseName(nameRaw.trim());
  if (!name) return { ok: false, error: "Name is required." };

  try {
    await prisma.$transaction([
      prisma.user_profile.upsert({
        where: { user_id: userId },
        create: { user_id: userId, full_name: name },
        update: { full_name: name },
      }),
      prisma.users.update({
        where: { user_id: userId },
        data: { updated_at: new Date() },
      }),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not update name: ${msg}` };
  }

  revalidatePath("/account-management");
  return { ok: true };
}

/**
 * Sets the account's branch OR department (mutually exclusive) on its most
 * recent employment row. `orgUnit` is "branch:<id>", "dept:<id>", or "" to clear.
 */
export async function updateAccountOrgUnit(
  userId: number,
  orgUnit: string,
): Promise<ActionResult> {
  const guard = await authorize();
  if (!guard.ok) return { ok: false, error: guard.error };

  let branchId: number | null = null;
  let departmentId: number | null = null;
  const value = orgUnit.trim();
  if (value.startsWith("branch:")) {
    const n = parseInt(value.slice("branch:".length), 10);
    if (Number.isNaN(n)) return { ok: false, error: "Invalid branch." };
    branchId = n;
  } else if (value.startsWith("dept:")) {
    const n = parseInt(value.slice("dept:".length), 10);
    if (Number.isNaN(n)) return { ok: false, error: "Invalid department." };
    departmentId = n;
  } else if (value !== "") {
    return { ok: false, error: "Invalid branch or department selection." };
  }

  const existing = await prisma.employment.findFirst({
    where: { user_id: userId },
    orderBy: { start_date: "desc" },
    select: { employment_id: true },
  });

  const branchRel =
    branchId !== null
      ? { connect: { branch_id: branchId } }
      : { disconnect: true };
  const departmentRel =
    departmentId !== null
      ? { connect: { department_id: departmentId } }
      : { disconnect: true };

  try {
    if (existing) {
      await prisma.employment.update({
        where: { employment_id: existing.employment_id },
        data: { branch: branchRel, department: departmentRel },
      });
    } else {
      await prisma.employment.create({
        data: {
          user_id: userId,
          branch_id: branchId,
          department_id: departmentId,
          status: "active",
        },
      });
    }
    await prisma.users.update({
      where: { user_id: userId },
      data: { updated_at: new Date() },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not update branch/department: ${msg}` };
  }

  revalidatePath("/account-management");
  return { ok: true };
}

export async function updateAccountPassword(
  userId: number,
  password: string,
): Promise<ActionResult> {
  const guard = await authorize();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!password) return { ok: false, error: "Password is required." };
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters long." };
  }

  const hashed = await bcrypt.hash(password, 10);
  try {
    await prisma.users.update({
      where: { user_id: userId },
      data: { password: hashed, updated_at: new Date() },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not update password: ${msg}` };
  }

  revalidatePath("/account-management");
  return { ok: true };
}
