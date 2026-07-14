"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// Transaction client type derived from the prisma singleton — avoids
// importing the Prisma namespace, which some IDE TS servers fail to
// resolve from @prisma/client v7's package exports even though tsc
// builds clean.
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
import bcrypt from "bcryptjs";
import { STAFF_ROLE_ID } from "@/lib/employeeQueries";
import { titleCaseName } from "@/lib/text";
import { WORKFLOW_TEMPLATES, computeStepDueDate, isKnownTemplate } from "@/app/induction/templates";
import { getRequestBaseUrl } from "@/lib/baseUrl";

export interface OnboardingCredentials {
  candidateName: string;
  candidateEmail: string;
  username: string;
  tempPassword: string;
  /** Best-effort full URL built from request headers. The client should
   *  prefer rebuilding from window.location.origin + loginToken when
   *  rendering the credential overlay — see EmployeeForm. */
  loginLink: string;
  /** Raw token — client uses this to rebuild loginLink from
   *  window.location.origin (most reliable source of truth). */
  loginToken: string;
}

export interface CreateEmployeeResult {
  ok: boolean;
  error?: string;
  /** Returned when assign_to_onboarding=on so the form can render the
   *  credential overlay instead of redirecting away. */
  credentials?: OnboardingCredentials;
}

const ONBOARDING_TOKEN_TTL_DAYS = 30;

function generateOnboardingUsername(email: string): string {
  return email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function generateOnboardingTempPassword(): string {
  return "eBright@" + String(Math.floor(1000 + Math.random() * 9000));
}

function expiryFromNow(ttlDays = ONBOARDING_TOKEN_TTL_DAYS): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ttlDays);
  return d;
}

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function dateOrNull(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDobParts(formData: FormData): { dob: Date | null; invalid: boolean } {
  const y = s(formData, "dobYear");
  const m = s(formData, "dobMonth");
  const d = s(formData, "dobDay");
  if (!y && !m && !d) return { dob: null, invalid: false };
  if (!y || !m || !d) return { dob: null, invalid: true };
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return { dob: null, invalid: true };
  const dt = new Date(Date.UTC(year, month - 1, day));
  const valid =
    dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
  return valid ? { dob: dt, invalid: false } : { dob: null, invalid: true };
}

export async function createEmployee(_: CreateEmployeeResult | null, formData: FormData): Promise<CreateEmployeeResult> {
  const fullName = s(formData, "fullName");
  const email = s(formData, "email");

  if (!fullName) return { ok: false, error: "Full Name is required." };
  if (!email) return { ok: false, error: "Email is required." };

  // Form sends Branch always; Department only when Branch is HQ.
  const branchIdRaw = s(formData, "branchId");
  const departmentIdRaw = s(formData, "departmentId");
  const branchId = branchIdRaw ? Number.parseInt(branchIdRaw, 10) : NaN;
  const departmentId = departmentIdRaw ? Number.parseInt(departmentIdRaw, 10) : NaN;
  const branchIdValue = Number.isFinite(branchId) ? branchId : null;
  const departmentIdValue = Number.isFinite(departmentId) ? departmentId : null;

  const employeeId = s(formData, "employeeId") || null;
  const role = s(formData, "role") || null;
  const employmentType = s(formData, "employmentType") || null;
  const startDate = dateOrNull(s(formData, "startDate"));
  const endDate = dateOrNull(s(formData, "endDate"));
  const statusField = s(formData, "status") || "active";
  const probation = formData.get("probation") === "on";
  const rate = role === "PT COACH" ? (s(formData, "rate") || null) : null;

  const nickName = s(formData, "nickName") || null;
  const phone = s(formData, "phone") || null;
  const gender = s(formData, "gender") || null;
  const { dob, invalid: dobInvalid } = parseDobParts(formData);
  if (dobInvalid) return { ok: false, error: "Date of Birth is incomplete or invalid." };
  const nric = s(formData, "nric") || null;
  const nationality = s(formData, "nationality") || null;
  const homeAddress = s(formData, "homeAddress") || null;

  const bankName = s(formData, "bankName") || null;
  const bankAccount = s(formData, "bankAccount") || null;
  const accountName = s(formData, "accountName") || null;

  const emergencyName = s(formData, "emergencyName") || null;
  const emergencyPhone = s(formData, "emergencyPhone") || null;
  const emergencyRelation = s(formData, "emergencyRelation") || null;

  // Optional: "Assign to onboarding" toggle on the Employment tab.
  // When on, the same transaction also creates an induction_profile
  // (status=Sent) and seeds its induction_step rows from the chosen
  // workflow template. Validation happens before the transaction so we
  // never half-create anything.
  const assignOnboarding = formData.get("assign_to_onboarding") === "on";
  const onbTemplate = s(formData, "workflow_template");
  const onbStartDateRaw = s(formData, "onboarding_start_date");
  const onbSendEmailOnRaw = s(formData, "send_email_on");
  const onbBuddyIdRaw = s(formData, "buddy_user_id");

  let onbStartDate: Date | null = null;
  let onbSendEmailOn: Date | null = null;
  let onbBuddyUserId: number | null = null;
  if (assignOnboarding) {
    if (!isKnownTemplate(onbTemplate)) {
      return { ok: false, error: "Please pick a workflow template for onboarding." };
    }
    onbStartDate = dateOrNull(onbStartDateRaw);
    if (!onbStartDate) {
      return { ok: false, error: "Onboarding start date is required when assigning onboarding." };
    }
    // Default the send date to the start date if HR didn't pick one.
    // The cron job sends on send_email_on (or earlier if it catches up).
    onbSendEmailOn = onbSendEmailOnRaw ? dateOrNull(onbSendEmailOnRaw) : onbStartDate;
    if (!onbSendEmailOn) {
      return { ok: false, error: "Email send date is invalid." };
    }
    if (onbBuddyIdRaw) {
      const parsed = Number.parseInt(onbBuddyIdRaw, 10);
      onbBuddyUserId = Number.isFinite(parsed) ? parsed : null;
    }
  }

  const existing = await prisma.users.findUnique({ where: { email }, select: { user_id: true } });
  if (existing) return { ok: false, error: `Email "${email}" is already registered.` };

  if (employeeId) {
    const dupe = await prisma.employment.findUnique({ where: { employee_id: employeeId }, select: { employment_id: true, user_id: true } });
    if (dupe) {
      const dupeProfile = await prisma.user_profile.findUnique({ where: { user_id: dupe.user_id }, select: { full_name: true } });
      const dupeName = dupeProfile?.full_name ? titleCaseName(dupeProfile.full_name) : `User #${dupe.user_id}`;
      return { ok: false, error: `Employee ID "${employeeId}" is already taken by ${dupeName}.` };
    }
  }

  // Pre-generate onboarding credential bits (only used when toggle is on).
  const onbToken = randomBytes(32).toString("hex");
  const onbExpiresAt = expiryFromNow();
  const onbUsername = generateOnboardingUsername(email);
  const onbTempPassword = generateOnboardingTempPassword();
  // Hash outside the transaction (bcrypt is CPU-heavy, no need to hold
  // the tx open while it runs). Only used when assigning onboarding —
  // without it, the candidate could never log in with the temp password
  // we show HR, since the auth credentials provider rejects null passwords.
  const onbHashedPassword = assignOnboarding
    ? await bcrypt.hash(onbTempPassword, 10)
    : null;

  try {
    await prisma.$transaction(async (tx: TxClient) => {
      const user = await tx.users.create({
        data: {
          email,
          password: onbHashedPassword,
          role_id: STAFF_ROLE_ID,
          status: statusField,
        },
      });

      await tx.user_profile.create({
        data: {
          user_id: user.user_id,
          full_name: titleCaseName(fullName),
          nick_name: nickName ? titleCaseName(nickName) : null,
          gender,
          dob,
          phone,
          nationality,
          nric,
          home_address: homeAddress,
        },
      });

      await tx.employment.create({
        data: {
          user_id: user.user_id,
          employee_id: employeeId,
          branch_id: branchIdValue,
          department_id: departmentIdValue,
          position: role,
          start_date: startDate,
          end_date: endDate,
          employment_type: employmentType,
          status: statusField,
          probation,
          rate,
        },
      });

      if (bankName || bankAccount || accountName) {
        await tx.bank_details.create({
          data: {
            user_id: user.user_id,
            bank_name: bankName,
            bank_account: bankAccount,
            account_name: accountName,
          },
        });
      }

      if (emergencyName) {
        await tx.emergency_contact.create({
          data: {
            user_id: user.user_id,
            name: titleCaseName(emergencyName),
            phone: emergencyPhone,
            relation: emergencyRelation,
          },
        });
      }

      if (assignOnboarding && onbStartDate) {
        const templateSteps = WORKFLOW_TEMPLATES[onbTemplate];
        const profile = await tx.induction_profile.create({
          data: {
            user_id: user.user_id,
            induction_type: "Onboarding",
            workflow_template: onbTemplate,
            buddy_user_id: onbBuddyUserId,
            link_token: onbToken,
            link_expires_at: onbExpiresAt,
            status: "Sent",
            start_date: onbStartDate,
            send_email_on: onbSendEmailOn,
            // Plaintext temp password is held here so the cron job can
            // include it in the welcome email. Cleared as soon as the
            // email is dispatched (see /api/jobs/send-onboarding-emails).
            pending_email_password: onbTempPassword,
            created_by: user.user_id,
          },
          select: { id: true },
        });
        await tx.induction_step.createMany({
          data: templateSteps.map((step) => ({
            induction_profile_id: profile.id,
            step_number: step.stepNumber,
            title: step.title,
            description: step.description,
            due_date: computeStepDueDate(onbStartDate as Date, step.daysFromStart),
            status: "Pending",
          })),
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not save employee: ${msg}` };
  }

  revalidatePath("/dashboard-employee-management");

  if (assignOnboarding) {
    revalidatePath("/induction/onboarding-dashboard");
    const baseUrl = await getRequestBaseUrl();
    // Login link points at the standard /login page (not the token route).
    // Candidates log in with username + temp password; the token URL is
    // shown to HR as a backup direct-access link.
    const loginLink = `${baseUrl}/login`;
    // Real send is delegated to the cron route
    // (/api/jobs/send-onboarding-emails) which fires daily and dispatches
    // any induction_profile rows where send_email_on <= today AND
    // email_sent_at IS NULL. HR sees the credentials in the overlay
    // straight away so they can copy/paste them out-of-band if needed.
    return {
      ok: true,
      credentials: {
        candidateName: titleCaseName(fullName),
        candidateEmail: email,
        username: onbUsername,
        tempPassword: onbTempPassword,
        loginLink,
        loginToken: onbToken,
      },
    };
  }

  redirect("/dashboard-employee-management");
}

export async function updateEmployee(_: CreateEmployeeResult | null, formData: FormData): Promise<CreateEmployeeResult> {
  const userIdRaw = s(formData, "userId");
  const userId = parseInt(userIdRaw, 10);
  if (!userIdRaw || Number.isNaN(userId)) return { ok: false, error: "Missing or invalid employee id." };

  const fullName = s(formData, "fullName");
  const email = s(formData, "email");
  if (!fullName) return { ok: false, error: "Full Name is required." };
  if (!email) return { ok: false, error: "Email is required." };

  // Form sends Branch always; Department only when Branch is HQ.
  const branchIdRaw = s(formData, "branchId");
  const departmentIdRaw = s(formData, "departmentId");
  const branchId = branchIdRaw ? Number.parseInt(branchIdRaw, 10) : NaN;
  const departmentId = departmentIdRaw ? Number.parseInt(departmentIdRaw, 10) : NaN;
  const branchIdValue = Number.isFinite(branchId) ? branchId : null;
  const departmentIdValue = Number.isFinite(departmentId) ? departmentId : null;

  const employeeId = s(formData, "employeeId") || null;
  const role = s(formData, "role") || null;
  const employmentType = s(formData, "employmentType") || null;
  const startDate = dateOrNull(s(formData, "startDate"));
  const endDate = dateOrNull(s(formData, "endDate"));
  const statusField = s(formData, "status") || "active";
  const probation = formData.get("probation") === "on";
  const rate = role === "PT COACH" ? (s(formData, "rate") || null) : null;

  const nickName = s(formData, "nickName") || null;
  const phone = s(formData, "phone") || null;
  const gender = s(formData, "gender") || null;
  const { dob, invalid: dobInvalid } = parseDobParts(formData);
  if (dobInvalid) return { ok: false, error: "Date of Birth is incomplete or invalid." };
  const nric = s(formData, "nric") || null;
  const nationality = s(formData, "nationality") || null;
  const homeAddress = s(formData, "homeAddress") || null;

  const bankName = s(formData, "bankName") || null;
  const bankAccount = s(formData, "bankAccount") || null;
  const accountName = s(formData, "accountName") || null;

  const emergencyName = s(formData, "emergencyName") || null;
  const emergencyPhone = s(formData, "emergencyPhone") || null;
  const emergencyRelation = s(formData, "emergencyRelation") || null;

  const existing = await prisma.users.findUnique({
    where: { user_id: userId },
    include: {
      employment: { orderBy: { start_date: "desc" }, take: 1 },
      emergency_contact: { take: 1 },
    },
  });
  if (!existing) return { ok: false, error: "Employee not found." };

  if (email !== existing.email) {
    const dupe = await prisma.users.findUnique({ where: { email }, select: { user_id: true } });
    if (dupe && dupe.user_id !== userId) return { ok: false, error: `Email "${email}" is already registered.` };
  }

  if (employeeId) {
    const dupe = await prisma.employment.findUnique({ where: { employee_id: employeeId }, select: { employment_id: true, user_id: true } });
    if (dupe && dupe.user_id !== userId) {
      const dupeProfile = await prisma.user_profile.findUnique({ where: { user_id: dupe.user_id }, select: { full_name: true } });
      const dupeName = dupeProfile?.full_name ? titleCaseName(dupeProfile.full_name) : `User #${dupe.user_id}`;
      return { ok: false, error: `Employee ID "${employeeId}" is already taken by ${dupeName} (User #${dupe.user_id}). If this is the same person, a duplicate account may exist.` };
    }
  }

  const existingEmploymentId = existing.employment[0]?.employment_id ?? null;
  const existingEmergencyId = existing.emergency_contact[0]?.contract_id ?? null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.users.update({
        where: { user_id: userId },
        data: { email, status: statusField },
      });

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
        employee_id: employeeId,
        position: role,
        start_date: startDate,
        end_date: endDate,
        employment_type: employmentType,
        status: statusField,
        probation,
        rate,
      };
      const branchRel = branchIdValue !== null
        ? { connect: { branch_id: branchIdValue } }
        : { disconnect: true };
      const departmentRel = departmentIdValue !== null
        ? { connect: { department_id: departmentIdValue } }
        : { disconnect: true };

      if (existingEmploymentId) {
        await tx.employment.update({
          where: { employment_id: existingEmploymentId },
          data: { ...empScalars, branch: branchRel, department: departmentRel },
        });
      } else {
        await tx.employment.create({
          data: { user_id: userId, ...empScalars, branch_id: branchIdValue, department_id: departmentIdValue },
        });
      }

      if (bankName || bankAccount || accountName) {
        await tx.bank_details.upsert({
          where: { user_id: userId },
          create: { user_id: userId, bank_name: bankName, bank_account: bankAccount, account_name: accountName },
          update: { bank_name: bankName, bank_account: bankAccount, account_name: accountName },
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
    return { ok: false, error: `Could not update employee: ${msg}` };
  }

  revalidatePath("/dashboard-employee-management");
  revalidatePath(`/dashboard-employee-management/${userId}`);
  redirect(`/dashboard-employee-management/${userId}`);
}

export interface DeleteEmployeeResult {
  ok: boolean;
  error?: string;
}

export async function deleteEmployee(userId: number): Promise<DeleteEmployeeResult> {
  if (!Number.isFinite(userId) || userId <= 0) {
    return { ok: false, error: "Invalid employee id." };
  }
  try {
    await prisma.users.delete({ where: { user_id: userId } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown database error.";
    return { ok: false, error: `Could not delete employee: ${msg}` };
  }
  revalidatePath("/dashboard-employee-management");
  return { ok: true };
}
