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

/** Row shape the Account Management table renders — mirrors AccountUser. */
export interface NewAccountUser {
  user_id: number;
  email: string;
  full_name: string | null;
  role_id: number;
  role_type: string;
  status: string;
  last_login: string | null;
  created_at: string;
  branch_id: number | null;
  branch_name: string | null;
  department_id: number | null;
  department_name: string | null;
  position: string | null;
}

export interface CreateAccountResult {
  ok: boolean;
  error?: string;
  user?: NewAccountUser;
}

export interface StaffLookupResult {
  ok: boolean;
  error?: string;
  userId?: number;
  name?: string | null;
  branchName?: string | null;
  departmentName?: string | null;
  position?: string | null;
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

// ──────────────────────────────────────────────────────────
// Add account — creation flows started from the "Add User" modal
// ──────────────────────────────────────────────────────────

/** Re-reads a freshly created/activated account in the shape the table wants. */
async function fetchNewAccount(userId: number): Promise<NewAccountUser | undefined> {
  const u = await prisma.users.findUnique({
    where: { user_id: userId },
    select: {
      user_id: true,
      email: true,
      status: true,
      last_login: true,
      created_at: true,
      role: { select: { role_id: true, role_type: true } },
      user_profile: { select: { full_name: true } },
      employment: {
        take: 1,
        orderBy: { employment_id: "desc" },
        select: {
          position: true,
          branch: { select: { branch_id: true, branch_name: true } },
          department: { select: { department_id: true, department_name: true } },
        },
      },
    },
  });
  if (!u) return undefined;
  return {
    user_id: u.user_id,
    email: u.email,
    full_name: u.user_profile?.full_name ?? null,
    role_id: u.role.role_id,
    role_type: u.role.role_type,
    status: u.status ?? "active",
    last_login: u.last_login ? u.last_login.toISOString() : null,
    created_at: u.created_at.toISOString(),
    branch_id: u.employment[0]?.branch?.branch_id ?? null,
    branch_name: u.employment[0]?.branch?.branch_name ?? null,
    department_id: u.employment[0]?.department?.department_id ?? null,
    department_name: u.employment[0]?.department?.department_name ?? null,
    position: u.employment[0]?.position ?? null,
  };
}

/**
 * Staff are pre-registered by HR (a users row with a null password). Adding a
 * staff account is really *claiming* that record: verify the email resolves to
 * a claimable staff record and surface its branch/department/position so the
 * modal can show them automatically. Mirrors /register's checkEmail.
 */
export async function lookupStaffEmail(
  emailRaw: string,
): Promise<StaffLookupResult> {
  const guard = await authorize();
  if (!guard.ok) return { ok: false, error: guard.error };

  const email = emailRaw.trim().toLowerCase();
  if (!email) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const existing = await prisma.users.findUnique({
    where: { email },
    select: {
      user_id: true,
      password: true,
      user_profile: { select: { full_name: true } },
      employment: {
        take: 1,
        orderBy: { employment_id: "desc" },
        select: {
          position: true,
          branch: { select: { branch_name: true } },
          department: { select: { department_name: true } },
        },
      },
    },
  });

  if (!existing) {
    return {
      ok: false,
      error:
        "No staff record found for this email. Ask HR to add them to staff records first.",
    };
  }
  if (existing.password !== null) {
    return { ok: false, error: "This email already has an active account." };
  }

  const emp = existing.employment[0];
  return {
    ok: true,
    userId: existing.user_id,
    name: existing.user_profile?.full_name ?? null,
    branchName: emp?.branch?.branch_name ?? null,
    departmentName: emp?.department?.department_name ?? null,
    position: emp?.position ?? null,
  };
}

/**
 * Activates a pre-registered staff record: sets its password + role and marks
 * it active. `userId` must come from a prior lookupStaffEmail on the same email.
 */
export async function activateStaffAccount(
  userId: number,
  roleId: number,
  password: string,
): Promise<CreateAccountResult> {
  const guard = await authorize();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!Number.isInteger(userId) || !Number.isInteger(roleId)) {
    return { ok: false, error: "Invalid request." };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters long." };
  }

  const role = await prisma.role.findUnique({
    where: { role_id: roleId },
    select: { role_id: true },
  });
  if (!role) return { ok: false, error: "That role no longer exists." };

  const existing = await prisma.users.findUnique({
    where: { user_id: userId },
    select: { password: true },
  });
  if (!existing) return { ok: false, error: "Account not found." };
  if (existing.password !== null) {
    return { ok: false, error: "This account is already active." };
  }

  const hashed = await bcrypt.hash(password, 10);
  try {
    await prisma.users.update({
      where: { user_id: userId },
      data: {
        password: hashed,
        role_id: roleId,
        status: "active",
        updated_at: new Date(),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not activate account: ${msg}` };
  }

  const user = await fetchNewAccount(userId);
  revalidatePath("/account-management");
  return { ok: true, user };
}

/**
 * Creates a brand-new managed account (department / branch / regional manager /
 * everything that isn't a claimable staff record). `orgUnit` is
 * "branch:<id>", "dept:<id>", or ""; `region` (A/B/C) is used for regional
 * managers and resolves to a representative branch in that region so the
 * access engine can read their region from employment.branch.region.
 */
export async function createManagedAccount(input: {
  roleId: number;
  email: string;
  name: string;
  password: string;
  orgUnit?: string;
  region?: string;
}): Promise<CreateAccountResult> {
  const guard = await authorize();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!Number.isInteger(input.roleId)) {
    return { ok: false, error: "Please select a role." };
  }

  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const name = titleCaseName(input.name.trim());
  if (!name) return { ok: false, error: "Name is required." };

  if (!input.password || input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters long." };
  }

  const role = await prisma.role.findUnique({
    where: { role_id: input.roleId },
    select: { role_id: true },
  });
  if (!role) return { ok: false, error: "That role no longer exists." };

  const clash = await prisma.users.findUnique({
    where: { email },
    select: { user_id: true },
  });
  if (clash) {
    return { ok: false, error: "An account with this email already exists." };
  }

  // Resolve branch / department from either a region (regional manager) or the
  // orgUnit selector.
  let branchId: number | null = null;
  let departmentId: number | null = null;
  const region = (input.region ?? "").trim();
  if (region) {
    const b = await prisma.branch.findFirst({
      where: { region },
      select: { branch_id: true },
      orderBy: { branch_id: "asc" },
    });
    if (!b) return { ok: false, error: "No branch found for that region." };
    branchId = b.branch_id;
  } else {
    const org = (input.orgUnit ?? "").trim();
    if (org.startsWith("branch:")) {
      const n = parseInt(org.slice("branch:".length), 10);
      if (Number.isNaN(n)) return { ok: false, error: "Invalid branch." };
      branchId = n;
    } else if (org.startsWith("dept:")) {
      const n = parseInt(org.slice("dept:".length), 10);
      if (Number.isNaN(n)) return { ok: false, error: "Invalid department." };
      departmentId = n;
    } else if (org !== "") {
      return { ok: false, error: "Invalid branch or department selection." };
    }
  }

  const hashed = await bcrypt.hash(input.password, 10);
  let newId: number;
  try {
    newId = await prisma.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          email,
          password: hashed,
          role_id: input.roleId,
          status: "active",
        },
      });
      await tx.user_profile.create({
        data: { user_id: user.user_id, full_name: name },
      });
      await tx.employment.create({
        data: {
          user_id: user.user_id,
          branch_id: branchId,
          department_id: departmentId,
          status: "active",
        },
      });
      return user.user_id;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not create account: ${msg}` };
  }

  const user = await fetchNewAccount(newId);
  revalidatePath("/account-management");
  return { ok: true, user };
}
