"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { STAFF_ROLE_ID } from "@/lib/employeeQueries";
import { titleCaseName } from "@/lib/text";

export interface RegisterResult {
  ok: boolean;
  error?: string;
  success?: boolean;
  claimed?: boolean;
}

export interface EmailCheckResult {
  ok: boolean;
  error?: string;
  status?: "claim" | "new";
  email?: string;
  name?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function checkEmail(_: EmailCheckResult | null, formData: FormData): Promise<EmailCheckResult> {
  const email = s(formData, "email").toLowerCase();

  if (!email) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };

  const existing = await prisma.users.findUnique({
    where: { email },
    select: { user_id: true, password: true, user_profile: { select: { full_name: true } } },
  });

  if (existing) {
    if (existing.password !== null) {
      return { ok: false, error: "An account with this email already exists. Please sign in." };
    }
    return { ok: true, status: "claim", email, name: existing.user_profile?.full_name ?? undefined };
  }

  if (email.endsWith("@ebright.my")) {
    return {
      ok: false,
      error: "This email is not registered in our staff records. Please contact HR at 01169491088 to update your email",
    };
  }

  return { ok: true, status: "new", email };
}

export async function registerUser(_: RegisterResult | null, formData: FormData): Promise<RegisterResult> {
  const email = s(formData, "email").toLowerCase();
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";
  const confirm = typeof formData.get("confirmPassword") === "string" ? (formData.get("confirmPassword") as string) : "";

  if (!email) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!password) return { ok: false, error: "Password is required." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters long." };
  if (password !== confirm) return { ok: false, error: "Passwords do not match." };

  const existing = await prisma.users.findUnique({
    where: { email },
    select: { user_id: true, password: true },
  });

  if (existing) {
    if (existing.password !== null) {
      return { ok: false, error: "An account with this email already exists." };
    }
    const hashed = await bcrypt.hash(password, 10);
    try {
      await prisma.users.update({
        where: { user_id: existing.user_id },
        data: { password: hashed },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown database error.";
      return { ok: false, error: `Could not set password: ${msg}` };
    }
    return { ok: true, success: true, claimed: true };
  }

  if (email.endsWith("@ebright.my")) {
    return {
      ok: false,
      error: "This email is not registered in our staff records. Please contact HR at 01169491088 to update your email",
    };
  }

  const fullName = s(formData, "fullName");
  const orgUnit = s(formData, "orgUnit");
  const position = s(formData, "position");

  if (!fullName) return { ok: false, error: "Full name is required." };
  if (!orgUnit) return { ok: false, error: "Please select a branch or department." };
  if (!position) return { ok: false, error: "Please select your position." };

  let branchId: number | null = null;
  let departmentId: number | null = null;
  if (orgUnit.startsWith("branch:")) {
    const n = parseInt(orgUnit.slice("branch:".length), 10);
    if (!Number.isNaN(n)) branchId = n;
  } else if (orgUnit.startsWith("dept:")) {
    const n = parseInt(orgUnit.slice("dept:".length), 10);
    if (!Number.isNaN(n)) departmentId = n;
  }
  if (branchId === null && departmentId === null) {
    return { ok: false, error: "Invalid branch or department selection." };
  }

  const hashed = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          email,
          password: hashed,
          role_id: STAFF_ROLE_ID,
          status: "pending",
        },
      });

      await tx.user_profile.create({
        data: {
          user_id: user.user_id,
          full_name: titleCaseName(fullName),
        },
      });

      await tx.employment.create({
        data: {
          user_id: user.user_id,
          branch_id: branchId,
          department_id: departmentId,
          position,
          status: "pending",
        },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not create account: ${msg}` };
  }

  return { ok: true, success: true };
}
