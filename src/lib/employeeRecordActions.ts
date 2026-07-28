"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadToDrive, deleteFromDrive } from "@/lib/drive";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireSession(): Promise<ActionResult | null> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Not signed in." };
  return null;
}

// Matches pinfo_personalInfo.html's exact field set (Full Name/Email excluded
// — kept non-editable here since they affect login; see EmployeeRecordView).
export interface PersonalInfoInput {
  dob: string; // yyyy-mm-dd, "" = unset
  phone: string;
  gender: string;
  nric: string;
  homeAddress: string;
}

export async function updatePersonalInfo(userId: number, data: PersonalInfoInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
  try {
    await prisma.user_profile.update({
      where: { user_id: userId },
      data: {
        dob: data.dob ? new Date(`${data.dob}T00:00:00Z`) : null,
        phone: data.phone || null,
        gender: data.gender || null,
        nric: data.nric || null,
        home_address: data.homeAddress || null,
      },
    });
    return { ok: true };
  } catch (e) {
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
// Drive-file fields, each replaced/cleared the same way).
export interface UpdateProbationInput {
  probationStatus: string;
  startDate: string; // yyyy-mm-dd, "" = unset
  endDate: string;
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
      probation_status: input.probationStatus || null,
      start_date: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null,
      end_date: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
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
  reason: string;
  attachmentFile: File | null;
}

export async function addTransfer(userId: number, input: AddTransferInput): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
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
      },
    });
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
  try {
    let attachmentFileId: string | null = null;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "suspension-letter", folderEnvVar: "GOOGLE_DRIVE_DISCIPLINARY_ID" });
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
  try {
    let attachmentFileId: string | null = null;
    if (input.attachmentFile) {
      const uploaded = await uploadToDrive(input.attachmentFile, { prefix: "showcause-warning-letter", folderEnvVar: "GOOGLE_DRIVE_DISCIPLINARY_ID" });
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

// ─── Delete — explicit exception to the "append only" convention above,
// requested for all 8 repeatable tables (not just Salary Revision) to keep
// the UX consistent. Each checks the row's own user_id matches the caller's
// employeeId before deleting (defense in depth against an id belonging to a
// different employee), best-effort cleans up any Drive attachment first. ───

export async function deleteAchievement(userId: number, id: number): Promise<ActionResult> {
  const authError = await requireSession();
  if (authError) return authError;
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
  try {
    const row = await prisma.pip.findUnique({ where: { pip_id: id } });
    if (!row || row.user_id !== userId) return { ok: false, error: "Record not found." };
    await prisma.pip.delete({ where: { pip_id: id } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete PIP." };
  }
}
