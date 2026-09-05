"use server";
import { auth } from "@/auth";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { titleCaseName } from "@/lib/text";

export interface ChangePasswordResult {
  ok: boolean;
  error?: string;
}

export interface UpdateOrgUnitResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export interface UpdateEmailResult {
  ok: boolean;
  error?: string;
}

export interface UpdateMyProfileResult {
  ok: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dateOrNull(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDobParts(formData: FormData): { dob: Date | null; invalid: boolean } {
  const y = str(formData, "dobYear");
  const m = str(formData, "dobMonth");
  const d = str(formData, "dobDay");
  if (!y && !m && !d) return { dob: null, invalid: false };
  if (!y || !m || !d) return { dob: null, invalid: true };
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return { dob: null, invalid: true };
  const dt = new Date(Date.UTC(year, month - 1, day));
  const valid = dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
  return valid ? { dob: dt, invalid: false } : { dob: null, invalid: true };
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function changePassword(
  _: ChangePasswordResult | null,
  formData: FormData,
): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You are not signed in." };
  const userId = parseInt((session.user as { id?: string }).id ?? "", 10);
  if (!Number.isFinite(userId)) return { ok: false, error: "Session is missing user id." };

  const current = str(formData, "currentPassword");
  const next = str(formData, "newPassword");
  const confirm = str(formData, "confirmPassword");

  if (!current) return { ok: false, error: "Current password is required." };
  if (!next) return { ok: false, error: "New password is required." };
  if (next.length < 8) return { ok: false, error: "New password must be at least 8 characters long." };
  if (next !== confirm) return { ok: false, error: "New passwords do not match." };
  if (current === next) return { ok: false, error: "New password must differ from the current password." };

  const user = await prisma.users.findUnique({ where: { user_id: userId }, select: { password: true } });
  if (!user) return { ok: false, error: "Account not found." };
  if (!user.password) return { ok: false, error: "Account has no password set. Contact admin." };

  const valid = await bcrypt.compare(current, user.password);
  if (!valid) return { ok: false, error: "Current password is incorrect." };

  const hashed = await bcrypt.hash(next, 10);
  await prisma.users.update({ where: { user_id: userId }, data: { password: hashed } });

  redirect("/profile?changed=1");
}

export async function updateMyProfile(
  _: UpdateMyProfileResult | null,
  formData: FormData,
): Promise<UpdateMyProfileResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You are not signed in." };
  const userId = parseInt((session.user as { id?: string }).id ?? "", 10);
  if (!Number.isFinite(userId)) return { ok: false, error: "Session is missing user id." };

  const fullName = str(formData, "fullName").trim();
  if (!fullName) return { ok: false, error: "Full Name is required." };

  const orgUnit = str(formData, "orgUnit").trim();
  let branchId: number | null = null;
  let departmentId: number | null = null;
  if (orgUnit.startsWith("branch:")) {
    const n = parseInt(orgUnit.slice("branch:".length), 10);
    if (!Number.isNaN(n)) branchId = n;
  } else if (orgUnit.startsWith("dept:")) {
    const n = parseInt(orgUnit.slice("dept:".length), 10);
    if (!Number.isNaN(n)) departmentId = n;
  }

  const role = str(formData, "role").trim() || null;
  const employmentType = str(formData, "employmentType").trim() || null;
  const startDate = dateOrNull(str(formData, "startDate"));
  const endDate = dateOrNull(str(formData, "endDate"));
  const statusField = str(formData, "status").trim() || "active";
  const probation = formData.get("probation") === "on";
  const rate = role === "PT COACH" ? (str(formData, "rate").trim() || null) : null;

  const nickName = str(formData, "nickName").trim() || null;
  const phone = str(formData, "phone").trim() || null;
  const gender = str(formData, "gender").trim() || null;
  const { dob, invalid: dobInvalid } = parseDobParts(formData);
  if (dobInvalid) return { ok: false, error: "Date of Birth is incomplete or invalid." };
  const nric = str(formData, "nric").trim() || null;
  const nationality = str(formData, "nationality").trim() || null;
  const homeAddress = str(formData, "homeAddress").trim() || null;

  const bankName = str(formData, "bankName").trim() || null;
  const bankAccount = str(formData, "bankAccount").trim() || null;

  const emergencyName = str(formData, "emergencyName").trim() || null;
  const emergencyPhone = str(formData, "emergencyPhone").trim() || null;
  const emergencyRelation = str(formData, "emergencyRelation").trim() || null;

  const existing = await prisma.users.findUnique({
    where: { user_id: userId },
    include: {
      employment: { orderBy: { start_date: "desc" }, take: 1 },
      emergency_contact: { take: 1 },
    },
  });
  if (!existing) return { ok: false, error: "Account not found." };

  const existingEmploymentId = existing.employment[0]?.employment_id ?? null;
  const existingEmergencyId = existing.emergency_contact[0]?.contract_id ?? null;

  try {
    await prisma.$transaction(async (tx) => {
      const cleanFullName = titleCaseName(fullName);
      const cleanNickName = nickName ? titleCaseName(nickName) : null;
      await tx.user_profile.upsert({
        where: { user_id: userId },
        create: {
          user_id: userId,
          full_name: cleanFullName,
          nick_name: cleanNickName,
          gender,
          dob,
          phone,
          nationality,
          nric,
          home_address: homeAddress,
        },
        update: {
          full_name: cleanFullName,
          nick_name: cleanNickName,
          gender,
          dob,
          phone,
          nationality,
          nric,
          home_address: homeAddress,
        },
      });

      const empScalars = {
        position: role,
        start_date: startDate,
        end_date: endDate,
        employment_type: employmentType,
        status: statusField,
        probation,
        rate,
      };
      const branchRel = branchId !== null
        ? { connect: { branch_id: branchId } }
        : { disconnect: true };
      const departmentRel = departmentId !== null
        ? { connect: { department_id: departmentId } }
        : { disconnect: true };

      if (existingEmploymentId) {
        await tx.employment.update({
          where: { employment_id: existingEmploymentId },
          data: { ...empScalars, branch: branchRel, department: departmentRel },
        });
      } else {
        await tx.employment.create({
          data: { user_id: userId, ...empScalars, branch_id: branchId, department_id: departmentId },
        });
      }

      if (bankName || bankAccount) {
        await tx.bank_details.upsert({
          where: { user_id: userId },
          create: { user_id: userId, bank_name: bankName, bank_account: bankAccount },
          update: { bank_name: bankName, bank_account: bankAccount },
        });
      } else {
        await tx.bank_details.deleteMany({ where: { user_id: userId } });
      }

      if (emergencyName) {
        const cleanEmergencyName = titleCaseName(emergencyName);
        if (existingEmergencyId) {
          await tx.emergency_contact.update({
            where: { contract_id: existingEmergencyId },
            data: { name: cleanEmergencyName, phone: emergencyPhone, relation: emergencyRelation },
          });
        } else {
          await tx.emergency_contact.create({
            data: { user_id: userId, name: cleanEmergencyName, phone: emergencyPhone, relation: emergencyRelation },
          });
        }
      } else if (existingEmergencyId) {
        await tx.emergency_contact.delete({ where: { contract_id: existingEmergencyId } });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not update profile: ${msg}` };
  }

  revalidatePath("/profile");
  redirect("/profile?updated=1");
}

export async function updateEmail(
  _: UpdateEmailResult | null,
  formData: FormData,
): Promise<UpdateEmailResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You are not signed in." };
  const userId = parseInt((session.user as { id?: string }).id ?? "", 10);
  if (!Number.isFinite(userId)) return { ok: false, error: "Session is missing user id." };

  const currentPassword = str(formData, "currentPassword");
  const newEmail = str(formData, "newEmail").trim().toLowerCase();

  if (!currentPassword) return { ok: false, error: "Current password is required." };
  if (!newEmail) return { ok: false, error: "New email is required." };
  if (!EMAIL_RE.test(newEmail)) return { ok: false, error: "Please enter a valid email address." };

  const user = await prisma.users.findUnique({ where: { user_id: userId }, select: { email: true, password: true } });
  if (!user) return { ok: false, error: "Account not found." };
  if (user.email === newEmail) return { ok: false, error: "That is already your current email." };
  if (!user.password) return { ok: false, error: "Account has no password set. Contact admin." };

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return { ok: false, error: "Current password is incorrect." };

  const dupe = await prisma.users.findUnique({ where: { email: newEmail }, select: { user_id: true } });
  if (dupe && dupe.user_id !== userId) return { ok: false, error: "That email is already in use." };

  try {
    await prisma.users.update({ where: { user_id: userId }, data: { email: newEmail } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not update email: ${msg}` };
  }

  redirect("/profile?emailChanged=1");
}

export async function updateOrgUnit(
  _: UpdateOrgUnitResult | null,
  formData: FormData,
): Promise<UpdateOrgUnitResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You are not signed in." };
  const userId = parseInt((session.user as { id?: string }).id ?? "", 10);
  if (!Number.isFinite(userId)) return { ok: false, error: "Session is missing user id." };

  const user = await prisma.users.findUnique({
    where: { user_id: userId },
    include: { role: true, employment: { orderBy: { start_date: "desc" }, take: 1 } },
  });
  if (!user) return { ok: false, error: "Account not found." };
  if (user.role.role_type === "superadmin") {
    return { ok: false, error: "Superadmin accounts don't have a branch or department." };
  }

  const orgUnit = str(formData, "orgUnit").trim();
  let branchId: number | null = null;
  let departmentId: number | null = null;
  if (orgUnit.startsWith("branch:")) {
    const n = parseInt(orgUnit.slice("branch:".length), 10);
    if (!Number.isNaN(n)) branchId = n;
  } else if (orgUnit.startsWith("dept:")) {
    const n = parseInt(orgUnit.slice("dept:".length), 10);
    if (!Number.isNaN(n)) departmentId = n;
  } else {
    return { ok: false, error: "Please select a branch or department." };
  }

  // A department only ever sits under HQ, so picking one implies the branch:
  // look HQ up by code and attach it, instead of leaving branch empty and
  // making every "which branch is this person at?" query treat HQ staff as
  // unassigned. If the HQ row is missing the save still goes through with no
  // branch, exactly as before.
  if (departmentId !== null) {
    const hq = await prisma.branch.findFirst({
      where: { branch_code: "HQ" },
      select: { branch_id: true },
    });
    if (hq) branchId = hq.branch_id;
  }

  const existingEmployment = user.employment[0];
  const branchRel = branchId !== null
    ? { connect: { branch_id: branchId } }
    : { disconnect: true };
  const departmentRel = departmentId !== null
    ? { connect: { department_id: departmentId } }
    : { disconnect: true };

  try {
    if (existingEmployment) {
      await prisma.employment.update({
        where: { employment_id: existingEmployment.employment_id },
        data: { branch: branchRel, department: departmentRel },
      });
    } else {
      await prisma.employment.create({
        data: {
          user_id: userId,
          branch_id: branchId,
          department_id: departmentId,
          position: user.role.role_type === "admin" ? "ADMIN" : null,
          status: "active",
        },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not save: ${msg}` };
  }

  revalidatePath("/profile");
  return { ok: true, message: "Managed unit updated." };
}
