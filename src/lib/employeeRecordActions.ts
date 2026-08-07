"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadToDrive, deleteFromDrive } from "@/lib/drive";
import { getCurrentEmployeeScope, isRowInScope } from "@/lib/employeeScope";
import { STAFF_ROLE_ID, getEmployeeOverviewRowById, listBranches, listDepartments, resolveDepartmentBranch } from "@/lib/employeeQueries";
import { positionGroup } from "@/lib/employeeStages";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireSession(): Promise<ActionResult | null> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Not signed in." };
  return null;
}

// Every mutation below targets a specific employee (userId, always the first
// parameter) — this blocks a department/branch-scoped account from writing
// to an out-of-scope employee's record via a direct action call, not just
// from browsing to their profile page. Mirrors the same department-first/
// branch-fallback scope rule enforced for reads in employeeScope.ts.
async function requireEmployeeInScope(userId: number): Promise<ActionResult | null> {
  const scope = await getCurrentEmployeeScope();
  if (!scope) return { ok: false, error: "Not signed in." };

  const target = await prisma.users.findUnique({
    where: { user_id: userId },
    select: {
      employment: {
        where: { status: "active" },
        include: { department: true, branch: true },
        orderBy: { employment_id: "desc" },
        take: 1,
      },
    },
  });
  // Guards every write action against a userId with no real portal account —
  // e.g. an onboarding_candidate profile (see getOnboardingCandidateDetail),
  // which uses a negative sentinel id precisely because it isn't a real
  // users row. Without this, a save attempt would reach the underlying
  // table's own FK constraint on user_id and throw instead of failing
  // cleanly. Checked before the fullAccess shortcut so it applies to every
  // account, not just scoped ones.
  if (!target) return { ok: false, error: "This employee doesn't have a portal account yet — nothing to save." };
  if (scope.fullAccess) return null;

  const emp = target.employment[0];
  const inScope = isRowInScope(scope, {
    id: userId,
    departmentCode: emp?.department?.department_code ?? null,
    branchCode: emp?.branch?.branch_code ?? null,
  });
  if (!inScope) return { ok: false, error: "You do not have access to this employee's record." };
  return null;
}

// Probation's Confirm/Extend/Stop decision (decideProbationOutcome below) is
// deliberately narrower than every other write in this file — per explicit
// decision (see conversation), restricted to role_type "hr"/"superadmin"
// specifically, not the broader is_full_access flag or department/branch
// scope that requireEmployeeInScope above allows for the general Probation
// edit form. Checked in addition to (not instead of) requireEmployeeInScope,
// so an HR account still can't decide for someone outside their scope.
async function requireHrOrSuperadmin(): Promise<ActionResult | null> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Not signed in." };
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  const roleType = me?.role?.role_type?.toLowerCase();
  if (roleType !== "hr" && roleType !== "superadmin") {
    return { ok: false, error: "Only HR or Superadmin accounts can decide a probation outcome." };
  }
  return null;
}

// Matches pinfo_personalInfo.html's exact field set, plus Full Name/Email
// (user_profile.full_name / users.email) — editable here too now, even
// though they double as the login identifier, per explicit request. Signed
// Offer Letter is a real Google Drive file now too (employment.
// offer_letter_file_id, on the employee's current/most-recent employment
// row) — same upload-on-save convention as Resume/CV.
export interface PersonalInfoInput {
  fullName: string;
  email: string;
  dob: string; // yyyy-mm-dd, "" = unset
  phone: string;
  gender: string;
  nric: string;
  homeAddress: string;
  offerLetterFileId: string | null;
  offerLetterFile: File | null;
}

export async function updatePersonalInfo(userId: number, data: PersonalInfoInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  const fullName = data.fullName.trim();
  const email = data.email.trim();
  if (!fullName) return { ok: false, error: "Full Name cannot be empty." };
  if (!email) return { ok: false, error: "Email cannot be empty." };
  try {
    const currentEmployment = await prisma.employment.findFirst({
      where: { user_id: userId },
      orderBy: { start_date: "desc" },
      select: { employment_id: true, offer_letter_file_id: true },
    });

    let offerLetterFileId = data.offerLetterFileId;
    if (data.offerLetterFile) {
      const uploaded = await uploadToDrive(data.offerLetterFile, { prefix: "offer-letter", folderEnvVar: "GOOGLE_DRIVE_OFFER_LETTER_ID" });
      offerLetterFileId = uploaded.id;
    }
    if (currentEmployment?.offer_letter_file_id && currentEmployment.offer_letter_file_id !== offerLetterFileId) {
      await deleteFromDrive(currentEmployment.offer_letter_file_id);
    }

    await prisma.$transaction([
      prisma.user_profile.update({
        where: { user_id: userId },
        data: {
          full_name: fullName,
          dob: data.dob ? new Date(`${data.dob}T00:00:00Z`) : null,
          phone: data.phone || null,
          gender: data.gender || null,
          nric: data.nric || null,
          home_address: data.homeAddress || null,
        },
      }),
      prisma.users.update({ where: { user_id: userId }, data: { email } }),
      ...(currentEmployment
        ? [
            prisma.employment.update({
              where: { employment_id: currentEmployment.employment_id },
              data: { offer_letter_file_id: offerLetterFileId },
            }),
          ]
        : []),
    ]);
    return { ok: true };
  } catch (e) {
    // users.email is unique — Prisma surfaces a conflicting address as a
    // P2002 constraint violation rather than a plain thrown message.
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { ok: false, error: "This email is already in use by another account." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Personal Info." };
  }
}

export interface BankDetailsInput {
  bankName: string;
  accountName: string;
  bankAccount: string;
}

export async function updateBankDetails(userId: number, data: BankDetailsInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    await prisma.bank_details.upsert({
      where: { user_id: userId },
      update: {
        bank_name: data.bankName || null,
        account_name: data.accountName || null,
        bank_account: data.bankAccount || null,
      },
      create: {
        user_id: userId,
        bank_name: data.bankName || null,
        account_name: data.accountName || null,
        bank_account: data.bankAccount || null,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Payment & Bank Info." };
  }
}

export interface EmergencyContactInput {
  name: string;
  phone: string;
  relation: string;
  email: string;
  address: string;
}

export async function updateEmergencyContact(userId: number, data: EmergencyContactInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    // No unique constraint on emergency_contact.user_id (a user could have
    // more than one row) — find-then-update/create rather than a true upsert.
    const existing = await prisma.emergency_contact.findFirst({ where: { user_id: userId } });
    const fields = {
      name: data.name,
      phone: data.phone || null,
      relation: data.relation || null,
      email: data.email || null,
      address: data.address || null,
    };
    if (existing) {
      await prisma.emergency_contact.update({ where: { contract_id: existing.contract_id }, data: fields });
    } else {
      await prisma.emergency_contact.create({ data: { user_id: userId, ...fields } });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Emergency Contact." };
  }
}

// Real resume table. resumeFileId/cvFileId are the CLIENT's current value for
// each field (already null if the user cleared it, unchanged otherwise) —
// resumeFile/cvFile are only set when the user picked a brand-new file this
// edit, in which case it's uploaded and its ID wins over whatever was passed.
// Best-effort deletes whichever Drive file (if any) this replaces/clears —
// deleteFromDrive already swallows its own errors, so a stale/already-gone
// file there doesn't fail the save.
export interface UpdateResumeInput {
  resumeFileId: string | null;
  resumeFile: File | null;
  cvFileId: string | null;
  cvFile: File | null;
}

export async function updateResume(userId: number, input: UpdateResumeInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.resume.findUnique({ where: { user_id: userId } });

    let resumeFileId = input.resumeFileId;
    if (input.resumeFile) {
      const uploaded = await uploadToDrive(input.resumeFile, { prefix: "resume", folderEnvVar: "GOOGLE_DRIVE_RESUME_FOLDER_ID" });
      resumeFileId = uploaded.id;
    }
    if (existing?.resume_file_id && existing.resume_file_id !== resumeFileId) {
      await deleteFromDrive(existing.resume_file_id);
    }

    let cvFileId = input.cvFileId;
    if (input.cvFile) {
      const uploaded = await uploadToDrive(input.cvFile, { prefix: "cv", folderEnvVar: "GOOGLE_DRIVE_RESUME_FOLDER_ID" });
      cvFileId = uploaded.id;
    }
    if (existing?.cv_file_id && existing.cv_file_id !== cvFileId) {
      await deleteFromDrive(existing.cv_file_id);
    }

    await prisma.resume.upsert({
      where: { user_id: userId },
      update: { resume_file_id: resumeFileId, cv_file_id: cvFileId },
      create: { user_id: userId, resume_file_id: resumeFileId, cv_file_id: cvFileId },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Resume/CV." };
  }
}

// Real interview_assessment table — Pre stage's own Interview Assessment tab.
export interface UpdateInterviewAssessmentInput {
  intDate: string; // yyyy-mm-dd, "" = unset
  overallRate: string; // numeric string ("1".."5"), "" = unset
  recommendation: string;
  strength: string;
  weakness: string;
  hiringNote: string;
}

export async function updateInterviewAssessment(
  userId: number,
  data: UpdateInterviewAssessmentInput,
): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const overallRate = data.overallRate ? Number.parseInt(data.overallRate, 10) : null;
    await prisma.interview_assessment.upsert({
      where: { user_id: userId },
      update: {
        int_date: data.intDate ? new Date(`${data.intDate}T00:00:00Z`) : null,
        overall_rate: overallRate,
        recommendation: data.recommendation || null,
        strength: data.strength || null,
        weakness: data.weakness || null,
        hiring_note: data.hiringNote || null,
      },
      create: {
        user_id: userId,
        int_date: data.intDate ? new Date(`${data.intDate}T00:00:00Z`) : null,
        overall_rate: overallRate,
        recommendation: data.recommendation || null,
        strength: data.strength || null,
        weakness: data.weakness || null,
        hiring_note: data.hiringNote || null,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Interview Assessment." };
  }
}

// Real reference_check table — shared between Pre stage's own "Reference
// Check" tab and Employee Record's HR Info > "Reference" tab.
export interface UpdateReferenceCheckInput {
  refName: string;
  company: string;
  relationship: string;
  position: string;
  contactNumber: string;
  email: string;
}

export async function updateReferenceCheck(userId: number, data: UpdateReferenceCheckInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    await prisma.reference_check.upsert({
      where: { user_id: userId },
      update: {
        ref_name: data.refName || null,
        company: data.company || null,
        relationship: data.relationship || null,
        position: data.position || null,
        contact_number: data.contactNumber || null,
        email: data.email || null,
      },
      create: {
        user_id: userId,
        ref_name: data.refName || null,
        company: data.company || null,
        relationship: data.relationship || null,
        position: data.position || null,
        contact_number: data.contactNumber || null,
        email: data.email || null,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Reference Check." };
  }
}

// Real medical_check table — shared between Pre stage's own "Medical Check"
// tab and Employee Record's HR Info > "Medical Check" tab.
// medicalReportFileId/medicalReportFile follow updateResume's exact pattern —
// medicalReportFileId is the client's current value (already null if cleared,
// unchanged otherwise), medicalReportFile is only set when a brand-new file
// was picked this edit, in which case it's uploaded and its ID wins.
export interface UpdateMedicalCheckInput {
  medicalReportFileId: string | null;
  medicalReportFile: File | null;
  result: string;
}

export async function updateMedicalCheck(userId: number, input: UpdateMedicalCheckInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.medical_check.findUnique({ where: { user_id: userId } });

    let medicalReportFileId = input.medicalReportFileId;
    if (input.medicalReportFile) {
      const uploaded = await uploadToDrive(input.medicalReportFile, {
        prefix: "medical-report",
        folderEnvVar: "GOOGLE_DRIVE_MEDICAL_REPORT_FOLDER_ID",
      });
      medicalReportFileId = uploaded.id;
    }
    if (existing?.medical_report_file_id && existing.medical_report_file_id !== medicalReportFileId) {
      await deleteFromDrive(existing.medical_report_file_id);
    }

    await prisma.medical_check.upsert({
      where: { user_id: userId },
      update: { medical_report_file_id: medicalReportFileId, result: input.result || null },
      create: { user_id: userId, medical_report_file_id: medicalReportFileId, result: input.result || null },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Medical Check." };
  }
}

// Real probation table — Probation stage's own tab. confirmationLetter*/
// extensionLetter* follow updateResume's exact pattern (two independent
// Drive-file fields, each replaced/cleared the same way). probationStatus/
// startDate/endDate deliberately removed from this input — per explicit
// decision (see conversation), Start/End Date are now read-only from
// ebright_hrfs.BranchStaff (see probationDecision.ts) and Probation Status
// is only ever settable via the HR/Superadmin-only decideProbationOutcome
// below, not this broader-access form — keeping them here would have left
// exactly the loophole that restriction was meant to close.
export interface UpdateProbationInput {
  confirmDate: string;
  extEndDate: string;
  confirmationLetterFileId: string | null;
  confirmationLetterFile: File | null;
  extensionLetterFileId: string | null;
  extensionLetterFile: File | null;
}

export async function updateProbationInfo(userId: number, input: UpdateProbationInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.probation.findUnique({ where: { user_id: userId } });

    let confirmationLetterFileId = input.confirmationLetterFileId;
    if (input.confirmationLetterFile) {
      const uploaded = await uploadToDrive(input.confirmationLetterFile, {
        prefix: "confirmation-letter",
        folderEnvVar: "GOOGLE_DRIVE_LETTER_FOLDER_ID",
      });
      confirmationLetterFileId = uploaded.id;
    }
    if (existing?.confirmation_letter_file_id && existing.confirmation_letter_file_id !== confirmationLetterFileId) {
      await deleteFromDrive(existing.confirmation_letter_file_id);
    }

    let extensionLetterFileId = input.extensionLetterFileId;
    if (input.extensionLetterFile) {
      const uploaded = await uploadToDrive(input.extensionLetterFile, {
        prefix: "extension-letter",
        folderEnvVar: "GOOGLE_DRIVE_LETTER_FOLDER_ID",
      });
      extensionLetterFileId = uploaded.id;
    }
    if (existing?.extension_letter_file_id && existing.extension_letter_file_id !== extensionLetterFileId) {
      await deleteFromDrive(existing.extension_letter_file_id);
    }

    const data = {
      confirm_date: input.confirmDate ? new Date(`${input.confirmDate}T00:00:00Z`) : null,
      ext_end_date: input.extEndDate ? new Date(`${input.extEndDate}T00:00:00Z`) : null,
      confirmation_letter_file_id: confirmationLetterFileId,
      extension_letter_file_id: extensionLetterFileId,
    };
    await prisma.probation.upsert({
      where: { user_id: userId },
      update: data,
      create: { user_id: userId, ...data },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Probation." };
  }
}

// The one write path this whole Probation feature introduces (see
// conversation) — everything else it reads (BranchStaff dates,
// career_applications feedback2/status2) is read-only. HR/Superadmin only
// (requireHrOrSuperadmin above), on top of the usual scope check. Writes
// ONLY to the probation table, per explicit decision (see conversation) —
// no other hrfs table is touched by this action, including employment.
// "Confirmed" still moves a Full-Time employee to Active immediately in
// effect, without a second write: computeAutoConfirmedProbationIds (see
// probationDecision.ts) already treats a local probation_status="Confirmed"
// exactly the same as a live status2="Accept" read, live, on every render —
// the same mechanism that already handles the "nobody's clicked anything,
// status2 already says Accept" case. So the moment this upsert lands, the
// very next page load already shows them as Active, purely from this one
// write. Extended/Stopped only ever write the decision either way — Stopped
// stays in Probation with its display flipped to "Stop", Extended just
// keeps the existing timeline.
export async function decideProbationOutcome(
  userId: number,
  outcome: "Confirmed" | "Extended" | "Stopped",
): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  const hrError = await requireHrOrSuperadmin();
  if (hrError) return hrError;

  try {
    const session = await auth();
    const me = await prisma.users.findUnique({ where: { email: session!.user!.email! }, select: { user_id: true } });
    if (!me) return { ok: false, error: "Not signed in." };

    const now = new Date();
    await prisma.probation.upsert({
      where: { user_id: userId },
      update: { probation_status: outcome, decided_by: me.user_id, decided_at: now },
      create: { user_id: userId, probation_status: outcome, decided_by: me.user_id, decided_at: now },
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to record probation decision." };
  }
}

// Real documents table — shared between Onboarding stage's own "Documents"
// tab and Employee Record's HR Info > "Handbook" tab. employmentContract*/
// employeeHandbook* follow updateResume's exact pattern (two independent
// Drive-file fields, each replaced/cleared the same way), each routed to its
// own dedicated Drive folder.
export interface UpdateDocumentsInput {
  employmentContractFileId: string | null;
  employmentContractFile: File | null;
  employeeHandbookFileId: string | null;
  employeeHandbookFile: File | null;
}

export async function updateDocuments(userId: number, input: UpdateDocumentsInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.documents.findUnique({ where: { user_id: userId } });

    let employmentContractFileId = input.employmentContractFileId;
    if (input.employmentContractFile) {
      const uploaded = await uploadToDrive(input.employmentContractFile, {
        prefix: "employment-contract",
        folderEnvVar: "GOOGLE_DRIVE_EMP_CONTRACT_FOLDER_ID",
      });
      employmentContractFileId = uploaded.id;
    }
    if (existing?.employment_contract_file_id && existing.employment_contract_file_id !== employmentContractFileId) {
      await deleteFromDrive(existing.employment_contract_file_id);
    }

    let employeeHandbookFileId = input.employeeHandbookFileId;
    if (input.employeeHandbookFile) {
      const uploaded = await uploadToDrive(input.employeeHandbookFile, {
        prefix: "employee-handbook",
        folderEnvVar: "GOOGLE_DRIVE_HANDBOOK_FOLDER_ID",
      });
      employeeHandbookFileId = uploaded.id;
    }
    if (existing?.employee_handbook_file_id && existing.employee_handbook_file_id !== employeeHandbookFileId) {
      await deleteFromDrive(existing.employee_handbook_file_id);
    }

    await prisma.documents.upsert({
      where: { user_id: userId },
      update: { employment_contract_file_id: employmentContractFileId, employee_handbook_file_id: employeeHandbookFileId },
      create: { user_id: userId, employment_contract_file_id: employmentContractFileId, employee_handbook_file_id: employeeHandbookFileId },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Documents." };
  }
}

// Real payroll table — shared between Onboarding stage's own "Payroll" tab's
// Statutory Information + PCB subsections and Employee Record's Finance >
// "Tax Info" tab. Bank Details (bank_name/account_name/bank_account) is
// deliberately NOT handled here — it reuses the existing bank_details table
// via updateBankDetails, called alongside this action by the panel's own
// onSave. pcbAttachmentFileId follows updateResume's exact pattern.
export interface UpdatePayrollInput {
  epfNumber: string;
  socsoNumber: string;
  eisNumber: string;
  taxNumber: string;
  pcbForm: string;
  pcbAttachmentFileId: string | null;
  pcbAttachmentFile: File | null;
}

export async function updatePayroll(userId: number, input: UpdatePayrollInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.payroll.findUnique({ where: { user_id: userId } });

    let pcbAttachmentFileId = input.pcbAttachmentFileId;
    if (input.pcbAttachmentFile) {
      const uploaded = await uploadToDrive(input.pcbAttachmentFile, { prefix: "pcb", folderEnvVar: "GOOGLE_DRIVE_PCB_ID" });
      pcbAttachmentFileId = uploaded.id;
    }
    if (existing?.pcb_attachment_file_id && existing.pcb_attachment_file_id !== pcbAttachmentFileId) {
      await deleteFromDrive(existing.pcb_attachment_file_id);
    }

    const fields = {
      epf_number: input.epfNumber || null,
      socso_number: input.socsoNumber || null,
      eis_number: input.eisNumber || null,
      tax_number: input.taxNumber || null,
      pcb_form: input.pcbForm || null,
      pcb_attachment_file_id: pcbAttachmentFileId,
    };
    await prisma.payroll.upsert({
      where: { user_id: userId },
      update: fields,
      create: { user_id: userId, ...fields },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Payroll." };
  }
}

// ─── Active Employment (repeatable, "add new record" only — no edit/delete
// UI exists anywhere in the mock for these, matching leave_request/
// employee_rate_history's own append-only pattern) ───

export interface AddAchievementInput {
  name: string;
  date: string; // yyyy-mm-dd, "" = unset
  attachmentFile: File | null;
}

export async function addAchievement(userId: number, input: AddAchievementInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    let attachmentFileId: string | null = null;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "achievement", folderEnvVar: "GOOGLE_DRIVE_ACTIVE_ATTACHMENT_ID" });
      attachmentFileId = uploaded.id;
    }
    await prisma.achievement.create({
      data: {
        user_id: userId,
        name: input.name || null,
        date: input.date ? new Date(`${input.date}T00:00:00Z`) : null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Achievement." };
  }
}

export interface AddSalaryRevisionInput {
  issuedDate: string;
  effectiveDate: string;
  currentSalary: string;
  newSalary: string;
  reason: string;
  salaryAdjustment: string;
  approvedBy: string;
  attachmentFile: File | null;
}

export async function addSalaryRevision(userId: number, input: AddSalaryRevisionInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    let attachmentFileId: string | null = null;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "salary-revision", folderEnvVar: "GOOGLE_DRIVE_ACTIVE_ATTACHMENT_ID" });
      attachmentFileId = uploaded.id;
    }
    await prisma.salary_revision.create({
      data: {
        user_id: userId,
        issued_date: input.issuedDate ? new Date(`${input.issuedDate}T00:00:00Z`) : null,
        effective_date: input.effectiveDate ? new Date(`${input.effectiveDate}T00:00:00Z`) : null,
        current_salary: input.currentSalary ? Number.parseFloat(input.currentSalary) : null,
        new_salary: input.newSalary ? Number.parseFloat(input.newSalary) : null,
        reason: input.reason || null,
        salary_adjustment: input.salaryAdjustment ? Number.parseFloat(input.salaryAdjustment) : null,
        approved_by: input.approvedBy || null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Salary Revision." };
  }
}

export interface AddPromotionInput {
  promotionDate: string;
  effectiveDate: string;
  currentPosition: string;
  newPosition: string;
  reason: string;
  approvedBy: string;
  attachmentFile: File | null;
}

export async function addPromotion(userId: number, input: AddPromotionInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    let attachmentFileId: string | null = null;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "promotion", folderEnvVar: "GOOGLE_DRIVE_ACTIVE_ATTACHMENT_ID" });
      attachmentFileId = uploaded.id;
    }
    await prisma.promotion.create({
      data: {
        user_id: userId,
        promotion_date: input.promotionDate ? new Date(`${input.promotionDate}T00:00:00Z`) : null,
        effective_date: input.effectiveDate ? new Date(`${input.effectiveDate}T00:00:00Z`) : null,
        current_position: input.currentPosition || null,
        new_position: input.newPosition || null,
        reason: input.reason || null,
        approved_by: input.approvedBy || null,
        attachment_file_id: attachmentFileId,
      },
    });

    // A promotion's new position becomes the employee's actual current
    // position — positionGroup() (employeeStages.ts) classifies Full Time/
    // Part Time/Intern purely from employment.position, so updating this one
    // field is what makes every stage/grouping view (Onboarding/Active
    // namelist grouping, Exit's position filter, etc.) reflect the new
    // employment type automatically. Deliberately doesn't touch anything
    // else (payroll, benefits, leave entitlement aren't derived from this
    // field, so nothing else needs to change).
    if (input.newPosition) {
      const current = await prisma.employment.findFirst({
        where: { user_id: userId },
        orderBy: { start_date: "desc" },
        select: { employment_id: true },
      });
      if (current) {
        await prisma.employment.update({ where: { employment_id: current.employment_id }, data: { position: input.newPosition } });
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Promotion." };
  }
}

export interface AddTransferInput {
  type: string;
  effectiveDate: string;
  fromLocation: string;
  toLocation: string;
  /** Temporary Transfer only — required when type is "Temporary Transfer", ignored otherwise. */
  endDate: string;
  reason: string;
  attachmentFile: File | null;
}

export async function addTransfer(userId: number, input: AddTransferInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  const isTemporary = input.type === "Temporary Transfer";
  if (isTemporary && !input.endDate) {
    return { ok: false, error: "End Date is required for a Temporary Transfer." };
  }
  try {
    let attachmentFileId: string | null = null;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "transfer", folderEnvVar: "GOOGLE_DRIVE_ACTIVE_ATTACHMENT_ID" });
      attachmentFileId = uploaded.id;
    }
    await prisma.transfer.create({
      data: {
        user_id: userId,
        type: input.type || null,
        effective_date: input.effectiveDate ? new Date(`${input.effectiveDate}T00:00:00Z`) : null,
        from_location: input.fromLocation || null,
        to_location: input.toLocation || null,
        reason: input.reason || null,
        attachment_file_id: attachmentFileId,
        end_date: isTemporary && input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
      },
    });

    // A transfer's "To" becomes the employee's actual current Branch/
    // Department — every other view that shows branch/department grouping
    // (Employee Overview, stage namelists, Exit's branch/department filter,
    // etc.) reads employment.branch_id/department_id directly, so updating
    // this one field is what makes them all reflect the transfer
    // automatically. "To" is looked up by name against both tables (whichever
    // matches); the other FK is cleared, mirroring the department-priority
    // rule (an employee belongs to either a branch or a department, not both).
    if (input.toLocation) {
      const [branch, department] = await Promise.all([
        prisma.branch.findFirst({ where: { branch_name: input.toLocation } }),
        prisma.department.findFirst({ where: { department_name: input.toLocation } }),
      ]);
      if (branch || department) {
        const current = await prisma.employment.findFirst({
          where: { user_id: userId },
          orderBy: { start_date: "desc" },
          select: { employment_id: true },
        });
        if (current) {
          await prisma.employment.update({
            where: { employment_id: current.employment_id },
            data: { branch_id: branch?.branch_id ?? null, department_id: department?.department_id ?? null },
          });
        }
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Transfer." };
  }
}

export interface AddTrainingInput {
  name: string;
  date: string;
  status: string;
}

export async function addTraining(userId: number, input: AddTrainingInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    await prisma.training.create({
      data: {
        user_id: userId,
        name: input.name || null,
        date: input.date ? new Date(`${input.date}T00:00:00Z`) : null,
        status: input.status || null,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Training." };
  }
}

// ─── NDA / Non-Compete (singleton, update-in-place like resume) ───

export interface UpdateNdaInput {
  signDate: string;
  effectiveDate: string;
  status: string;
  attachmentFileId: string | null;
  attachmentFile: File | null;
}

export async function updateNda(userId: number, input: UpdateNdaInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.nda.findUnique({ where: { user_id: userId } });

    let attachmentFileId = input.attachmentFileId;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "nda", folderEnvVar: "GOOGLE_DRIVE_NDA_NC_ID" });
      attachmentFileId = uploaded.id;
    }
    if (existing?.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
      await deleteFromDrive(existing.attachment_file_id);
    }

    const fields = {
      sign_date: input.signDate ? new Date(`${input.signDate}T00:00:00Z`) : null,
      effective_date: input.effectiveDate ? new Date(`${input.effectiveDate}T00:00:00Z`) : null,
      status: input.status || null,
      attachment_file_id: attachmentFileId,
    };
    await prisma.nda.upsert({ where: { user_id: userId }, update: fields, create: { user_id: userId, ...fields } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save NDA." };
  }
}

export interface UpdateNonCompeteInput {
  signDate: string;
  expiryDate: string;
  duration: string;
  attachmentFileId: string | null;
  attachmentFile: File | null;
}

export async function updateNonCompete(userId: number, input: UpdateNonCompeteInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.non_compete.findUnique({ where: { user_id: userId } });

    let attachmentFileId = input.attachmentFileId;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "non-compete", folderEnvVar: "GOOGLE_DRIVE_NDA_NC_ID" });
      attachmentFileId = uploaded.id;
    }
    if (existing?.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
      await deleteFromDrive(existing.attachment_file_id);
    }

    const fields = {
      sign_date: input.signDate ? new Date(`${input.signDate}T00:00:00Z`) : null,
      expiry_date: input.expiryDate ? new Date(`${input.expiryDate}T00:00:00Z`) : null,
      duration: input.duration || null,
      attachment_file_id: attachmentFileId,
    };
    await prisma.non_compete.upsert({ where: { user_id: userId }, update: fields, create: { user_id: userId, ...fields } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Non-Compete." };
  }
}

// ─── Exit (singleton, update-in-place like nda/non_compete). Resignation
// Letter/Acceptance Letter/Issued Letter route to GOOGLE_DRIVE_LETTER_FOLDER_ID
// — the same shared "letters" folder probation's confirmation/extension
// letters and (per this task) suspension/showcause letters use, since these
// are the same kind of document; not explicitly specified for these 3 fields,
// flagged in the summary rather than silently assumed. ───

export interface UpdateResignationInput {
  submissionDate: string;
  lastWorkingDate: string;
  reason: string;
  resignLetterFileId: string | null;
  resignLetterFile: File | null;
  acceptLetterFileId: string | null;
  acceptLetterFile: File | null;
  exitType: string;
}

export async function updateResignation(userId: number, input: UpdateResignationInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.resignation.findUnique({ where: { user_id: userId } });

    let resignLetterFileId = input.resignLetterFileId;
    if (input.resignLetterFile) {
      const uploaded = await uploadToDrive(input.resignLetterFile, { prefix: "resign-letter", folderEnvVar: "GOOGLE_DRIVE_LETTER_FOLDER_ID" });
      resignLetterFileId = uploaded.id;
    }
    if (existing?.resign_letter_file_id && existing.resign_letter_file_id !== resignLetterFileId) {
      await deleteFromDrive(existing.resign_letter_file_id);
    }

    let acceptLetterFileId = input.acceptLetterFileId;
    if (input.acceptLetterFile) {
      const uploaded = await uploadToDrive(input.acceptLetterFile, { prefix: "accept-letter", folderEnvVar: "GOOGLE_DRIVE_LETTER_FOLDER_ID" });
      acceptLetterFileId = uploaded.id;
    }
    if (existing?.accept_letter_file_id && existing.accept_letter_file_id !== acceptLetterFileId) {
      await deleteFromDrive(existing.accept_letter_file_id);
    }

    const fields = {
      submission_date: input.submissionDate ? new Date(`${input.submissionDate}T00:00:00Z`) : null,
      last_working_date: input.lastWorkingDate ? new Date(`${input.lastWorkingDate}T00:00:00Z`) : null,
      reason: input.reason || null,
      resign_letter_file_id: resignLetterFileId,
      accept_letter_file_id: acceptLetterFileId,
      exit_type: input.exitType || null,
    };
    await prisma.resignation.upsert({ where: { user_id: userId }, update: fields, create: { user_id: userId, ...fields } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Resignation." };
  }
}

export interface UpdateReferenceLetterInput {
  requestDate: string;
  type: string;
  issuedDate: string;
  issuedBy: string;
  remark: string;
  issuedLetterFileId: string | null;
  issuedLetterFile: File | null;
}

export async function updateReferenceLetter(userId: number, input: UpdateReferenceLetterInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.reference_letter.findUnique({ where: { user_id: userId } });

    let issuedLetterFileId = input.issuedLetterFileId;
    if (input.issuedLetterFile) {
      const uploaded = await uploadToDrive(input.issuedLetterFile, { prefix: "reference-letter", folderEnvVar: "GOOGLE_DRIVE_LETTER_FOLDER_ID" });
      issuedLetterFileId = uploaded.id;
    }
    if (existing?.issued_letter_file_id && existing.issued_letter_file_id !== issuedLetterFileId) {
      await deleteFromDrive(existing.issued_letter_file_id);
    }

    const fields = {
      request_date: input.requestDate ? new Date(`${input.requestDate}T00:00:00Z`) : null,
      type: input.type || null,
      issued_date: input.issuedDate ? new Date(`${input.issuedDate}T00:00:00Z`) : null,
      issued_by: input.issuedBy || null,
      remark: input.remark || null,
      issued_letter_file_id: issuedLetterFileId,
    };
    await prisma.reference_letter.upsert({ where: { user_id: userId }, update: fields, create: { user_id: userId, ...fields } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Reference Letter." };
  }
}

export interface UpdateExitInterviewNoteInput {
  date: string;
  interviewer: string;
  reason: string;
  note: string;
}

export async function updateExitInterviewNote(userId: number, input: UpdateExitInterviewNoteInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const fields = {
      date: input.date ? new Date(`${input.date}T00:00:00Z`) : null,
      interviewer: input.interviewer || null,
      reason: input.reason || null,
      note: input.note || null,
    };
    await prisma.exit_interview_note.upsert({ where: { user_id: userId }, update: fields, create: { user_id: userId, ...fields } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Exit Interview Note." };
  }
}

// ─── Disciplinary (repeatable, "add new record" only, same convention as
// Achievement/Promotion/etc above) ───

export interface AddDomesticInquiryInput {
  date: string;
  panel: string;
  caseSummary: string;
  decision: string;
  attachmentFile: File | null;
}

export async function addDomesticInquiry(userId: number, input: AddDomesticInquiryInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    let attachmentFileId: string | null = null;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "domestic-inquiry", folderEnvVar: "GOOGLE_DRIVE_DISCIPLINARY_ID" });
      attachmentFileId = uploaded.id;
    }
    await prisma.domestic_inquiry.create({
      data: {
        user_id: userId,
        date: input.date ? new Date(`${input.date}T00:00:00Z`) : null,
        panel: input.panel || null,
        case_summary: input.caseSummary || null,
        decision: input.decision || null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Domestic Inquiry." };
  }
}

export interface AddSuspensionLetterInput {
  startDate: string;
  endDate: string;
  type: string;
  reason: string;
  issuedBy: string;
  attachmentFile: File | null;
}

export async function addSuspensionLetter(userId: number, input: AddSuspensionLetterInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    let attachmentFileId: string | null = null;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "suspension-letter", folderEnvVar: "GOOGLE_DRIVE_LETTER_FOLDER_ID" });
      attachmentFileId = uploaded.id;
    }
    await prisma.suspension_letter.create({
      data: {
        user_id: userId,
        start_date: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null,
        end_date: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
        type: input.type || null,
        reason: input.reason || null,
        issued_by: input.issuedBy || null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Suspension Letter." };
  }
}

export interface AddShowcauseWarningLetterInput {
  type: string;
  date: string;
  issuedBy: string;
  status: string;
  reason: string;
  empResponse: string;
  attachmentFile: File | null;
}

export async function addShowcauseWarningLetter(userId: number, input: AddShowcauseWarningLetterInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    let attachmentFileId: string | null = null;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "showcause-warning-letter", folderEnvVar: "GOOGLE_DRIVE_LETTER_FOLDER_ID" });
      attachmentFileId = uploaded.id;
    }
    await prisma.showcause_warning_letter.create({
      data: {
        user_id: userId,
        type: input.type || null,
        date: input.date ? new Date(`${input.date}T00:00:00Z`) : null,
        issued_by: input.issuedBy || null,
        status: input.status || null,
        reason: input.reason || null,
        emp_response: input.empResponse || null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Showcause/ Warning Letter." };
  }
}

export interface AddPipInput {
  startDate: string;
  endDate: string;
  supervisor: string;
  reviewResult: string;
  improvementGoal: string;
  remark: string;
}

export async function addPip(userId: number, input: AddPipInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    await prisma.pip.create({
      data: {
        user_id: userId,
        start_date: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null,
        end_date: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
        supervisor: input.supervisor || null,
        review_result: input.reviewResult || null,
        improvement_goal: input.improvementGoal || null,
        remark: input.remark || null,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save PIP." };
  }
}

// ─── Update — explicit exception to the "append only" convention above,
// requested for all 8 repeatable tables so clicking an existing row (while
// in edit mode) can correct it in place instead of only ever adding new
// rows. Each checks the row's own user_id matches the caller's employeeId
// first (same defense-in-depth as the deletes below), replaces the Drive
// attachment (uploading the new one, deleting the old one) only when a new
// file was actually picked — otherwise the existing attachment is left
// untouched. Promotion's/Transfer's "becomes the employee's current
// position/branch/department" side effect IS re-applied on edit, same as on
// add — but always computed from whichever record is actually the most
// recent by effective_date after the edit (re-queried fresh), not
// necessarily the row just saved, so editing an older record only changes
// current classification if it happens to still/now be the latest one. ───

export async function updateAchievement(userId: number, id: number, input: AddAchievementInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.achievement.findUnique({ where: { achievement_id: id } });
    if (!existing || existing.user_id !== userId) return { ok: false, error: "Record not found." };
    let attachmentFileId = existing.attachment_file_id;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "achievement", folderEnvVar: "GOOGLE_DRIVE_ACTIVE_ATTACHMENT_ID" });
      attachmentFileId = uploaded.id;
      if (existing.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
        await deleteFromDrive(existing.attachment_file_id);
      }
    }
    await prisma.achievement.update({
      where: { achievement_id: id },
      data: { name: input.name || null, date: input.date ? new Date(`${input.date}T00:00:00Z`) : null, attachment_file_id: attachmentFileId },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update Achievement." };
  }
}

export async function updatePromotion(userId: number, id: number, input: AddPromotionInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.promotion.findUnique({ where: { promotion_id: id } });
    if (!existing || existing.user_id !== userId) return { ok: false, error: "Record not found." };
    let attachmentFileId = existing.attachment_file_id;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "promotion", folderEnvVar: "GOOGLE_DRIVE_ACTIVE_ATTACHMENT_ID" });
      attachmentFileId = uploaded.id;
      if (existing.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
        await deleteFromDrive(existing.attachment_file_id);
      }
    }
    await prisma.promotion.update({
      where: { promotion_id: id },
      data: {
        promotion_date: input.promotionDate ? new Date(`${input.promotionDate}T00:00:00Z`) : null,
        effective_date: input.effectiveDate ? new Date(`${input.effectiveDate}T00:00:00Z`) : null,
        current_position: input.currentPosition || null,
        new_position: input.newPosition || null,
        reason: input.reason || null,
        approved_by: input.approvedBy || null,
        attachment_file_id: attachmentFileId,
      },
    });

    // Re-sync the employee's actual current position from whichever
    // promotion record is now the most recent by effective_date — same
    // ordering listPromotions uses to decide what's "latest" in the UI.
    // Re-queried fresh rather than assuming the just-edited row is latest,
    // since editing effective_date itself can change which row that is.
    // nulls: "last" is required — Postgres' default DESC ordering sorts
    // NULLs first, which would otherwise treat a record with no effective
    // date as "most recent" ahead of every dated one.
    const currentLatest = await prisma.promotion.findFirst({
      where: { user_id: userId },
      orderBy: [{ effective_date: { sort: "desc", nulls: "last" } }, { promotion_id: "desc" }],
    });
    if (currentLatest?.new_position) {
      const employment = await prisma.employment.findFirst({
        where: { user_id: userId },
        orderBy: { start_date: "desc" },
        select: { employment_id: true },
      });
      if (employment) {
        await prisma.employment.update({ where: { employment_id: employment.employment_id }, data: { position: currentLatest.new_position } });
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update Promotion." };
  }
}

export async function updateTransfer(userId: number, id: number, input: AddTransferInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  const isTemporary = input.type === "Temporary Transfer";
  if (isTemporary && !input.endDate) {
    return { ok: false, error: "End Date is required for a Temporary Transfer." };
  }
  try {
    const existing = await prisma.transfer.findUnique({ where: { transfer_id: id } });
    if (!existing || existing.user_id !== userId) return { ok: false, error: "Record not found." };
    let attachmentFileId = existing.attachment_file_id;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "transfer", folderEnvVar: "GOOGLE_DRIVE_ACTIVE_ATTACHMENT_ID" });
      attachmentFileId = uploaded.id;
      if (existing.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
        await deleteFromDrive(existing.attachment_file_id);
      }
    }
    await prisma.transfer.update({
      where: { transfer_id: id },
      data: {
        type: input.type || null,
        effective_date: input.effectiveDate ? new Date(`${input.effectiveDate}T00:00:00Z`) : null,
        from_location: input.fromLocation || null,
        to_location: input.toLocation || null,
        reason: input.reason || null,
        attachment_file_id: attachmentFileId,
        end_date: isTemporary && input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
      },
    });

    // Re-sync the employee's actual current Branch/Department from
    // whichever transfer record is now the most recent by effective_date —
    // same ordering listTransfers uses to decide what's "latest" in the UI.
    // Re-queried fresh rather than assuming the just-edited row is latest,
    // since editing effective_date itself can change which row that is.
    // nulls: "last" is required — Postgres' default DESC ordering sorts
    // NULLs first, which would otherwise treat a record with no effective
    // date as "most recent" ahead of every dated one.
    const currentLatest = await prisma.transfer.findFirst({
      where: { user_id: userId },
      orderBy: [{ effective_date: { sort: "desc", nulls: "last" } }, { transfer_id: "desc" }],
    });
    if (currentLatest?.to_location) {
      const [branch, department] = await Promise.all([
        prisma.branch.findFirst({ where: { branch_name: currentLatest.to_location } }),
        prisma.department.findFirst({ where: { department_name: currentLatest.to_location } }),
      ]);
      if (branch || department) {
        const employment = await prisma.employment.findFirst({
          where: { user_id: userId },
          orderBy: { start_date: "desc" },
          select: { employment_id: true },
        });
        if (employment) {
          await prisma.employment.update({
            where: { employment_id: employment.employment_id },
            data: { branch_id: branch?.branch_id ?? null, department_id: department?.department_id ?? null },
          });
        }
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update Transfer." };
  }
}

export async function updateTraining(userId: number, id: number, input: AddTrainingInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.training.findUnique({ where: { training_id: id } });
    if (!existing || existing.user_id !== userId) return { ok: false, error: "Record not found." };
    await prisma.training.update({
      where: { training_id: id },
      data: { name: input.name || null, date: input.date ? new Date(`${input.date}T00:00:00Z`) : null, status: input.status || null },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update Training." };
  }
}

export async function updateDomesticInquiry(userId: number, id: number, input: AddDomesticInquiryInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.domestic_inquiry.findUnique({ where: { domestic_inquiry_id: id } });
    if (!existing || existing.user_id !== userId) return { ok: false, error: "Record not found." };
    let attachmentFileId = existing.attachment_file_id;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "domestic-inquiry", folderEnvVar: "GOOGLE_DRIVE_DISCIPLINARY_ID" });
      attachmentFileId = uploaded.id;
      if (existing.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
        await deleteFromDrive(existing.attachment_file_id);
      }
    }
    await prisma.domestic_inquiry.update({
      where: { domestic_inquiry_id: id },
      data: {
        date: input.date ? new Date(`${input.date}T00:00:00Z`) : null,
        panel: input.panel || null,
        case_summary: input.caseSummary || null,
        decision: input.decision || null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update Domestic Inquiry." };
  }
}

export async function updateSuspensionLetter(userId: number, id: number, input: AddSuspensionLetterInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.suspension_letter.findUnique({ where: { suspension_letter_id: id } });
    if (!existing || existing.user_id !== userId) return { ok: false, error: "Record not found." };
    let attachmentFileId = existing.attachment_file_id;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "suspension-letter", folderEnvVar: "GOOGLE_DRIVE_LETTER_FOLDER_ID" });
      attachmentFileId = uploaded.id;
      if (existing.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
        await deleteFromDrive(existing.attachment_file_id);
      }
    }
    await prisma.suspension_letter.update({
      where: { suspension_letter_id: id },
      data: {
        start_date: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null,
        end_date: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
        type: input.type || null,
        reason: input.reason || null,
        issued_by: input.issuedBy || null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update Suspension Letter." };
  }
}

export async function updateShowcauseWarningLetter(
  userId: number,
  id: number,
  input: AddShowcauseWarningLetterInput,
): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.showcause_warning_letter.findUnique({ where: { showcause_warning_letter_id: id } });
    if (!existing || existing.user_id !== userId) return { ok: false, error: "Record not found." };
    let attachmentFileId = existing.attachment_file_id;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, {
        prefix: "showcause-warning-letter",
        folderEnvVar: "GOOGLE_DRIVE_LETTER_FOLDER_ID",
      });
      attachmentFileId = uploaded.id;
      if (existing.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
        await deleteFromDrive(existing.attachment_file_id);
      }
    }
    await prisma.showcause_warning_letter.update({
      where: { showcause_warning_letter_id: id },
      data: {
        type: input.type || null,
        date: input.date ? new Date(`${input.date}T00:00:00Z`) : null,
        issued_by: input.issuedBy || null,
        status: input.status || null,
        reason: input.reason || null,
        emp_response: input.empResponse || null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update Showcause/ Warning Letter." };
  }
}

export async function updatePip(userId: number, id: number, input: AddPipInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.pip.findUnique({ where: { pip_id: id } });
    if (!existing || existing.user_id !== userId) return { ok: false, error: "Record not found." };
    await prisma.pip.update({
      where: { pip_id: id },
      data: {
        start_date: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null,
        end_date: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
        supervisor: input.supervisor || null,
        review_result: input.reviewResult || null,
        improvement_goal: input.improvementGoal || null,
        remark: input.remark || null,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update PIP." };
  }
}

// Salary Revision and Performance Review aren't RepeatableRecordSection
// tables (they're the bespoke "form defaults to latest + history table
// below" pattern), but the same requested behavior — click a history row
// while in edit mode to load it into the form and save as a correction
// rather than a new append — applies to them too, so these two follow the
// exact same update-in-place shape as the 8 above.
export async function updateSalaryRevision(userId: number, id: number, input: AddSalaryRevisionInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.salary_revision.findUnique({ where: { salary_revision_id: id } });
    if (!existing || existing.user_id !== userId) return { ok: false, error: "Record not found." };
    let attachmentFileId = existing.attachment_file_id;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "salary-revision", folderEnvVar: "GOOGLE_DRIVE_ACTIVE_ATTACHMENT_ID" });
      attachmentFileId = uploaded.id;
      if (existing.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
        await deleteFromDrive(existing.attachment_file_id);
      }
    }
    await prisma.salary_revision.update({
      where: { salary_revision_id: id },
      data: {
        issued_date: input.issuedDate ? new Date(`${input.issuedDate}T00:00:00Z`) : null,
        effective_date: input.effectiveDate ? new Date(`${input.effectiveDate}T00:00:00Z`) : null,
        current_salary: input.currentSalary ? Number.parseFloat(input.currentSalary) : null,
        new_salary: input.newSalary ? Number.parseFloat(input.newSalary) : null,
        reason: input.reason || null,
        salary_adjustment: input.salaryAdjustment ? Number.parseFloat(input.salaryAdjustment) : null,
        approved_by: input.approvedBy || null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update Salary Revision." };
  }
}

export async function updatePerformanceReview(userId: number, id: number, input: AddPerformanceReviewInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.performance_review.findUnique({ where: { performance_review_id: id } });
    if (!existing || existing.user_id !== userId) return { ok: false, error: "Record not found." };
    let attachmentFileId = existing.attachment_file_id;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, {
        prefix: "performance-review",
        folderEnvVar: "GOOGLE_DRIVE_PERFORMANCE_REVIEW_ID",
      });
      attachmentFileId = uploaded.id;
      if (existing.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
        await deleteFromDrive(existing.attachment_file_id);
      }
    }
    await prisma.performance_review.update({
      where: { performance_review_id: id },
      data: {
        period: input.period || null,
        review_date: input.reviewDate ? new Date(`${input.reviewDate}T00:00:00Z`) : null,
        reviewer: input.reviewer || null,
        overall_rating: input.overallRating || null,
        comment: input.comment || null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update Performance Review." };
  }
}

// ─── Delete — explicit exception to the "append only" convention above,
// requested for all 8 repeatable tables (not just Salary Revision) to keep
// the UX consistent. Each checks the row's own user_id matches the caller's
// employeeId before deleting (defense in depth against an id belonging to a
// different employee), best-effort cleans up any Drive attachment first. ───

export async function deleteAchievement(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.achievement.findUnique({ where: { achievement_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    if (row.attachment_file_id) await deleteFromDrive(row.attachment_file_id);
    await prisma.achievement.delete({ where: { achievement_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete Achievement." };
  }
}

export async function deleteSalaryRevision(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.salary_revision.findUnique({ where: { salary_revision_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    if (row.attachment_file_id) await deleteFromDrive(row.attachment_file_id);
    await prisma.salary_revision.delete({ where: { salary_revision_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete Salary Revision." };
  }
}

export async function deletePromotion(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.promotion.findUnique({ where: { promotion_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    if (row.attachment_file_id) await deleteFromDrive(row.attachment_file_id);
    await prisma.promotion.delete({ where: { promotion_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete Promotion." };
  }
}

export async function deleteTransfer(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.transfer.findUnique({ where: { transfer_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    if (row.attachment_file_id) await deleteFromDrive(row.attachment_file_id);
    await prisma.transfer.delete({ where: { transfer_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete Transfer." };
  }
}

export async function deleteTraining(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.training.findUnique({ where: { training_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    await prisma.training.delete({ where: { training_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete Training." };
  }
}

export async function deleteDomesticInquiry(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.domestic_inquiry.findUnique({ where: { domestic_inquiry_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    if (row.attachment_file_id) await deleteFromDrive(row.attachment_file_id);
    await prisma.domestic_inquiry.delete({ where: { domestic_inquiry_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete Domestic Inquiry." };
  }
}

export async function deleteSuspensionLetter(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.suspension_letter.findUnique({ where: { suspension_letter_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    if (row.attachment_file_id) await deleteFromDrive(row.attachment_file_id);
    await prisma.suspension_letter.delete({ where: { suspension_letter_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete Suspension Letter." };
  }
}

export async function deleteShowcauseWarningLetter(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.showcause_warning_letter.findUnique({ where: { showcause_warning_letter_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    if (row.attachment_file_id) await deleteFromDrive(row.attachment_file_id);
    await prisma.showcause_warning_letter.delete({ where: { showcause_warning_letter_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete Showcause/ Warning Letter." };
  }
}

export async function deletePip(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.pip.findUnique({ where: { pip_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    await prisma.pip.delete({ where: { pip_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete PIP." };
  }
}

// ─── Employee Record additions: Guardian Info (repeatable), Payment,
// Performance Review, Payslip ───

export interface AddGuardianInfoInput {
  name: string;
  relationship: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
}

export async function addGuardianInfo(userId: number, input: AddGuardianInfoInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    await prisma.guardian_info.create({
      data: {
        user_id: userId,
        name: input.name || null,
        relationship: input.relationship || null,
        gender: input.gender || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Guardian Info." };
  }
}

// UI shows every guardian's fields inline (label/value pairs under "Guardian
// N" headings, one shared Edit/Save toggle for the whole panel — see
// EmployeeRecordPanels.GuardianInfoPanel) rather than an "add new via modal"
// record table, so an already-saved guardian's fields need to be editable
// in place, not just append-only like the other repeatable tables.
export async function updateGuardianInfo(userId: number, id: number, input: AddGuardianInfoInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.guardian_info.findUnique({ where: { guardian_info_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    await prisma.guardian_info.update({
      where: { guardian_info_id: id },
      data: {
        name: input.name || null,
        relationship: input.relationship || null,
        gender: input.gender || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update Guardian Info." };
  }
}

export async function deleteGuardianInfo(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.guardian_info.findUnique({ where: { guardian_info_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    await prisma.guardian_info.delete({ where: { guardian_info_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete Guardian Info." };
  }
}

export interface UpdatePaymentInfoInput {
  paymentMethod: string;
  paymentFrequency: string;
  payDate: string;
  remark: string;
}

export async function updatePaymentInfo(userId: number, input: UpdatePaymentInfoInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const fields = {
      payment_method: input.paymentMethod || null,
      payment_frequency: input.paymentFrequency || null,
      pay_date: input.payDate ? new Date(`${input.payDate}T00:00:00Z`) : null,
      remark: input.remark || null,
    };
    await prisma.payment_info.upsert({ where: { user_id: userId }, update: fields, create: { user_id: userId, ...fields } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Payment Info." };
  }
}

export interface AddPerformanceReviewInput {
  period: string;
  reviewDate: string;
  reviewer: string;
  overallRating: string;
  comment: string;
  attachmentFile: File | null;
}

export async function addPerformanceReview(userId: number, input: AddPerformanceReviewInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    let attachmentFileId: string | null = null;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, {
        prefix: "performance-review",
        folderEnvVar: "GOOGLE_DRIVE_PERFORMANCE_REVIEW_ID",
      });
      attachmentFileId = uploaded.id;
    }
    await prisma.performance_review.create({
      data: {
        user_id: userId,
        period: input.period || null,
        review_date: input.reviewDate ? new Date(`${input.reviewDate}T00:00:00Z`) : null,
        reviewer: input.reviewer || null,
        overall_rating: input.overallRating || null,
        comment: input.comment || null,
        attachment_file_id: attachmentFileId,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Performance Review." };
  }
}

export async function deletePerformanceReview(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const row = await prisma.performance_review.findUnique({ where: { performance_review_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    if (row.attachment_file_id) await deleteFromDrive(row.attachment_file_id);
    await prisma.performance_review.delete({ where: { performance_review_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete Performance Review." };
  }
}

export interface UpdatePayslipInput {
  basicPay: string;
  type: string;
  attachmentFileId: string | null;
  attachmentFile: File | null;
}

export async function updatePayslip(userId: number, input: UpdatePayslipInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const existing = await prisma.payslip.findUnique({ where: { user_id: userId } });

    let attachmentFileId = input.attachmentFileId;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "payslip", folderEnvVar: "GOOGLE_DRIVE_PAYSLIP_ID" });
      attachmentFileId = uploaded.id;
    }
    if (existing?.attachment_file_id && existing.attachment_file_id !== attachmentFileId) {
      await deleteFromDrive(existing.attachment_file_id);
    }

    const fields = {
      basic_pay: input.basicPay ? Number.parseFloat(input.basicPay) : null,
      type: input.type || null,
      attachment_file_id: attachmentFileId,
    };
    await prisma.payslip.upsert({ where: { user_id: userId }, update: fields, create: { user_id: userId, ...fields } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save Payslip." };
  }
}

// ─── Add Pre-stage Employee — creates a real employee (users + user_profile +
// employment, all tied by the same user_id) rather than the old candidate-row
// behavior. Once created, this person is indistinguishable from any other
// real employee: listEmployeeOverviewRows() already classifies anyone with
// role_id 6/7/8 and a future employment.start_date as Pre stage (checked
// before status), so no read-side change was needed — they show up as a
// clickable row linking to the same profile template immediately. ───

export interface AddPreStageEmployeeInput {
  fullName: string;
  position: string;
  /** Exactly one of branchCode/departmentCode should be set — mutually
   *  exclusive on the form, same as every other branch/dept field pair. */
  branchCode: string;
  departmentCode: string;
  /** Becomes employment.start_date — must be a future date for this person
   *  to actually land in Pre stage (the whole point of this form). */
  startDate: string;
}

export async function addPreStageEmployee(input: AddPreStageEmployeeInput): Promise<ActionResult & { id?: number }> {
  const authError = await requireSession();
  if (authError) return authError;

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "Full Name is required." };
  if (!input.position) return { ok: false, error: "Position is required." };
  if (input.branchCode && input.departmentCode) return { ok: false, error: "Choose either Branch or Department, not both." };
  if (!input.branchCode && !input.departmentCode) return { ok: false, error: "Select a Branch or Department." };
  if (!input.startDate) return { ok: false, error: "Date is required." };
  const todayIso = new Date().toISOString().slice(0, 10);
  if (input.startDate <= todayIso) {
    return { ok: false, error: "Date must be in the future — otherwise this employee won't show up in Pre stage." };
  }

  // A department/branch-scoped account can only add into their own
  // department/branch — same rule enforced for every other write here,
  // just checked against the form's own selection instead of an existing row.
  const scope = await getCurrentEmployeeScope();
  if (!scope) return { ok: false, error: "Not signed in." };
  if (!scope.fullAccess) {
    // No real id yet (this employee doesn't exist until the insert below
    // succeeds) — -1 can never equal a real user_id, so an ownUserId-scoped
    // (individual staff) account correctly fails this check and can't
    // create new employee records at all, only department/branch-scoped
    // accounts (checked via departmentCode/branchCode, not id) can.
    const inScope = isRowInScope(scope, {
      id: -1,
      departmentCode: input.departmentCode || null,
      branchCode: input.branchCode || null,
    });
    if (!inScope) return { ok: false, error: "You can only add employees to your own department/branch." };
  }

  try {
    const [branch, department] = await Promise.all([
      input.branchCode ? prisma.branch.findUnique({ where: { branch_code: input.branchCode } }) : null,
      input.departmentCode ? prisma.department.findUnique({ where: { department_code: input.departmentCode } }) : null,
    ]);
    if (input.branchCode && !branch) return { ok: false, error: "Unknown branch." };
    if (input.departmentCode && !department) return { ok: false, error: "Unknown department." };

    // No login is being set up here (password stays null) — just placeholder
    // enough to satisfy users.email's UNIQUE NOT NULL constraint. HR replaces
    // this with the employee's real email once they actually onboard.
    const placeholderEmail = `pre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.ebright.my`;

    const user = await prisma.users.create({
      data: {
        email: placeholderEmail,
        role_id: STAFF_ROLE_ID,
        status: "active",
        user_profile: { create: { full_name: fullName } },
        employment: {
          create: {
            position: input.position,
            branch_id: branch?.branch_id ?? null,
            department_id: department?.department_id ?? null,
            start_date: new Date(`${input.startDate}T00:00:00Z`),
            // "pre" (not "active") — a distinct, literal marker so the
            // automatic Pre -> Onboarding/Probation sweep (stageTransition
            // Automation.ts) can find these rows by status alone once
            // start_date arrives, without a new column. stageForRow's own
            // Pre-branch never reads this field (start_date > today wins
            // unconditionally), so this has no effect on display until then.
            status: "pre",
          },
        },
      },
      select: { user_id: true },
    });

    return { ok: true, id: user.user_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add employee." };
  }
}

// ─── Pre stage's "Proceed" button — the only stage-transition button that's
// actually wired to a real employment update (the rest stay the pre-existing
// "not wired up" placeholder). Full-time positions go to Probation
// (probation=true); everything else (Part Time/Intern) goes to Onboarding
// (status="onboarding") — same 2-way split positionGroup() already uses.
// Also clears employment.start_date forward to today when it's still in the
// future: Pre-stage membership is checked ahead of status/probation
// (start_date in the future always wins), so without this the employee would
// stay stuck in Pre no matter what status/probation gets set to here — this
// button is an explicit "they're proceeding right now" override, not
// something that waits for the originally-planned date to actually arrive. ───

export async function proceedFromPreStage(userId: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const employment = await prisma.employment.findFirst({
      where: { user_id: userId },
      orderBy: { start_date: "desc" },
    });
    if (!employment) return { ok: false, error: "No employment record found for this employee." };

    const isFullTime = positionGroup(employment.position) === "Full Time";
    const todayIso = new Date().toISOString().slice(0, 10);
    const startIso = employment.start_date ? employment.start_date.toISOString().slice(0, 10) : null;
    const needsStartDateBump = !startIso || startIso > todayIso;

    await prisma.employment.update({
      where: { employment_id: employment.employment_id },
      data: {
        ...(needsStartDateBump ? { start_date: new Date(`${todayIso}T00:00:00Z`) } : {}),
        status: isFullTime ? "active" : "onboarding",
        probation: isFullTime,
      },
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to proceed." };
  }
}

// ─── Every stage list's row-menu Delete (Pre/Probation/Onboarding/Active/
// Exit/Employee Records — see RowActionMenu) — real hard delete, per
// explicit decision (see conversation): clicking Delete removes the
// employee record entirely, not an archive, regardless of what stage
// they're currently at. One action covering both row kinds:
// - Real employee (positive id, a genuine users row): deletes the users row
//   outright. Every one of its relations (employment, leave_request,
//   resignation, ...) is declared onDelete: Cascade in schema.prisma, so
//   this is a clean single delete, not a manual multi-table teardown.
// - Candidate (negative sentinel, -source_id — see getOnboardingCandidateDetail,
//   Pre-stage-only): deletes the onboarding_candidate row directly; there's
//   no users row to remove.
export async function deleteEmployeeRecord(id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scope = await getCurrentEmployeeScope();
  if (!scope) return { ok: false, error: "Not signed in." };

  if (id < 0) {
    const sourceId = -id;
    const candidate = await prisma.onboarding_candidate.findUnique({ where: { source_id: sourceId } });
    if (!candidate) return { ok: false, error: "This candidate no longer exists." };
    if (!scope.fullAccess) {
      const [departments, branches] = await Promise.all([listDepartments(), listBranches()]);
      const loc = resolveDepartmentBranch(candidate.department_branch, departments, branches);
      // No real user_id (this candidate has no portal account) — -1 can
      // never equal a real user_id, so an ownUserId-scoped (individual
      // staff) account correctly fails this check; only department/branch-
      // scoped accounts can delete a candidate in their own department/branch.
      if (!isRowInScope(scope, { id: -1, departmentCode: loc.departmentCode, branchCode: loc.branchCode })) {
        return { ok: false, error: "You do not have access to this candidate." };
      }
    }
    try {
      await prisma.onboarding_candidate.delete({ where: { source_id: sourceId } });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed to delete candidate." };
    }
  }

  const row = await getEmployeeOverviewRowById(id);
  if (!row) return { ok: false, error: "This employee doesn't exist or you don't have access to them." };

  const scopeError = await requireEmployeeInScope(id);
  if (scopeError) return scopeError;
  try {
    await prisma.users.delete({ where: { user_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete employee." };
  }
}

// ─── Probation stage's "Next" button — real employment update, gated on the
// probation table's own Probation Status being "Confirmed" (re-checked here
// server-side too, not just via the UI's disabled button, since a client
// could otherwise call this action directly). Target changed from
// "onboarding" to "active" per explicit decision (see conversation) — this
// used to send a Confirmed employee back to plain Onboarding (Probation and
// Onboarding ran concurrently, so "done with Probation" meant "now just
// Onboarding"); now Confirmed means straight to Active, removed from both
// Probation and Onboarding, matching decideProbationOutcome's own immediate
// effect above (the two are now equivalent for a real Probation-stage
// employee — this button is largely superseded by the Confirm button on the
// new decision UI, kept working rather than removed since nothing asked for
// it to be deleted). Full Time only, same as decideProbationOutcome — a
// non-Full-Time employee with a "Confirmed" status (shouldn't normally
// happen, since this flow is Full-Time-specific) gets a clear error instead
// of a silent no-op. ───

export async function proceedFromProbation(userId: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const probation = await prisma.probation.findUnique({ where: { user_id: userId } });
    if (probation?.probation_status !== "Confirmed") {
      return { ok: false, error: "Probation Status must be Confirmed before proceeding." };
    }

    const employment = await prisma.employment.findFirst({
      where: { user_id: userId },
      orderBy: { start_date: "desc" },
    });
    if (!employment) return { ok: false, error: "No employment record found for this employee." };
    if (positionGroup(employment.position) !== "Full Time") {
      return { ok: false, error: "This transition applies to Full Time employees only." };
    }

    await prisma.employment.update({
      where: { employment_id: employment.employment_id },
      data: { status: "active", probation: false },
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to proceed." };
  }
}

// ─── Onboarding stage's "Next" button — real employment update, no
// prerequisite gate (unlike Probation's Confirmed-status requirement, nothing
// was specified for Onboarding->Active, so the button stays always-enabled).
// nonExitStage() checks status==="onboarding" before the probation flag, so
// once status flips to "active" this employee is Active regardless of
// probation — cleared here too for data cleanliness now that it no longer
// applies, same as Probation's own transition. ───

export async function proceedFromOnboarding(userId: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const employment = await prisma.employment.findFirst({
      where: { user_id: userId },
      orderBy: { start_date: "desc" },
    });
    if (!employment) return { ok: false, error: "No employment record found for this employee." };

    await prisma.employment.update({
      where: { employment_id: employment.employment_id },
      data: { status: "active", probation: false },
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to proceed." };
  }
}

// ─── Active stage's "Exit" button — real employment update, no prerequisite
// gate (same as Onboarding->Active). Sets status="inactive" with end_date
// left null rather than setting end_date to today: the Exit-priority rule
// (see stageFromEmployment) only treats a set end_date as Exit once it's
// strictly BEFORE today, so an end_date of today would actually suppress the
// inactive shortcut and leave them classified as Active until tomorrow —
// null end_date + status="inactive" is the one combination that moves them
// to Exit immediately, matching "processing their exit right now" rather
// than waiting on a date boundary. Their Exit list "Last Date" naturally
// shows today via updated_at, since this write happens today. ───

export async function proceedFromActive(userId: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  const scopeError = await requireEmployeeInScope(userId);
  if (scopeError) return scopeError;
  try {
    const employment = await prisma.employment.findFirst({
      where: { user_id: userId },
      orderBy: { start_date: "desc" },
    });
    if (!employment) return { ok: false, error: "No employment record found for this employee." };

    await prisma.employment.update({
      where: { employment_id: employment.employment_id },
      data: { status: "inactive", end_date: null, probation: false },
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to proceed." };
  }
}
