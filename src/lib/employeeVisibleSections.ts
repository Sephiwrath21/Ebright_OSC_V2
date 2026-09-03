import { EMPLOYEE_RECORD_CATEGORIES, findRecordCategory } from "@/lib/employeeRecordConfig";
import type {
  DocumentsInfo,
  PayrollInfo,
  ProbationInfo,
  NdaInfo,
  NonCompeteInfo,
  SalaryRevisionEntry,
  PayslipInfo,
  PayslipHistoryEntry,
  LeaveHistoryRow,
  PerformanceReviewEntry,
  TrainingEntry,
  PromotionEntry,
  TransferEntry,
  AchievementEntry,
  DomesticInquiryEntry,
  SuspensionLetterEntry,
  ShowcauseWarningLetterEntry,
  PipEntry,
  ResignationInfo,
  ReferenceLetterInfo,
  ExitInterviewNoteInfo,
  ExitChecklistItem,
  FinancialSettlementInfo,
} from "@/lib/employeeQueries";

// Extracted from src/app/employee-folder/[stage]/employee/[id]/page.tsx
// (2026-08-27, see conversation) — shared now by that stage-folder page AND
// the real /employee-record/[id] page, which reuses this exact same
// cumulative-by-stage section structure for its own visibleSectionKeys/
// dotSectionKeys instead of showing everything unfiltered. Pure move, no
// logic changes — kept out of either page.tsx file since Next.js route
// modules shouldn't be imported from each other for their own internal
// helpers.

// Personal Info is complete from Pre onward (2026-08-26, see conversation —
// corrected from an earlier "builds up gradually" assumption) — all 4 of
// Employee Record's own sub-tabs, unconditionally, for every stage using
// this page. Only HR Info (and, from Onboarding, Finance) actually build up
// cumulatively.
export const FULL_PERSONAL_INFO_SECTIONS = ["personal-info", "guardian-info", "payment", "emergency-contact"];
// HR Info's own base, shared by Pre/Probation/Onboarding alike — each later
// stage's function below adds to this rather than restating it.
export const HR_INFO_BASE_SECTIONS = ["resume", "offer-letter", "hiring-notes", "reference", "medical-check"];

// Pre stage's visible tabs (2026-08-26, see conversation) — reuses Employee
// Record's own real category/section keys directly (not a separate Pre-only
// key namespace), so EmployeeRecordView's existing render logic (which
// switches on these exact keys — "hiring-notes", "medical-check", etc.)
// needs no Pre-specific branching at all. NDA/Non-Compete and Handbook are
// deliberately absent from HR Info — later-stage panels, not part of Pre.
export const PRE_VISIBLE_SECTIONS: Record<string, string[]> = {
  "personal-info": FULL_PERSONAL_INFO_SECTIONS,
  "hr-info": HR_INFO_BASE_SECTIONS,
};

// Probation stage's visible tabs — HR Info gains "Probation" itself, gated
// Full Time only (2026-08-26, see conversation — Part Time/Intern never go
// through Probation in the first place, so this is a defensive match to the
// same isFullTime gate Onboarding's own history view of Probation already
// uses, rather than an assumption Probation-stage rows are always Full Time).
export function probationVisibleSections(isFullTime: boolean): Record<string, string[]> {
  return {
    "personal-info": FULL_PERSONAL_INFO_SECTIONS,
    "hr-info": [...HR_INFO_BASE_SECTIONS, ...(isFullTime ? ["probation"] : [])],
  };
}

// Onboarding stage's visible tabs — HR Info additionally gains "Doc" (the
// existing Employment Contract + Employee Handbook tab), and Finance appears
// for the first time, scoped to just Tax Info — Onboarding has no
// salary_revision/payslip data yet, so "Payroll/Payslip" stays hidden (same
// reasoning EmployeeRecordView.tsx's own Finance guard now checks per-section
// for, 2026-08-26, see conversation). "Probation" here is a read-only history
// glance at a decision already made at the Probation stage (Full Time only —
// Part Time/Intern skip Probation and never see this tab).
export function onboardingVisibleSections(isFullTime: boolean): Record<string, string[]> {
  return {
    "personal-info": FULL_PERSONAL_INFO_SECTIONS,
    "hr-info": [...HR_INFO_BASE_SECTIONS, ...(isFullTime ? ["probation"] : []), "handbook"],
    finance: ["tax-info"],
  };
}

// Active stage's visible tabs — cumulative on top of Onboarding: HR Info
// gains "NDA / NC" (the only HR Info addition here), Finance gains "payroll"
// (Salary Revision + Payslip + Payslip History, PayrollPanel's one combined
// panel — not separable, per explicit decision, see conversation), and three
// entirely new top-level categories appear for the first time: Active
// Employment (all 6 of its real sub-tabs), Disciplinary (all 4), and Task
// (Pending/Overdue — same listEmployeeTasks() data/panels as the real
// Employee Record page's own Task tab, 2026-08-27, see conversation;
// deliberately excluded from activeNewSections() below — never dots, see
// its own comment).
export function activeVisibleSections(isFullTime: boolean): Record<string, string[]> {
  return {
    "personal-info": FULL_PERSONAL_INFO_SECTIONS,
    "hr-info": [...HR_INFO_BASE_SECTIONS, ...(isFullTime ? ["probation"] : []), "handbook", "nda-nc"],
    finance: ["tax-info", "payroll"],
    "active-employment": ["leave", "performance-review", "training", "promotion", "transfer", "cert"],
    disciplinary: ["domestic-inquiry", "suspension", "showcause", "pip"],
    task: ["pending", "overdue"],
  };
}

// Exit stage's visible tabs — cumulative on top of Active exactly as
// specified (2026-08-27, see conversation): every category through Task
// stays unchanged, plus one entirely new top-level category, Offboarding
// (all 7 of its real sub-tabs, Knowledge Transfer/Asset Recovery/System
// Revocation nested under "Clearance" — see employeeRecordConfig.ts's own
// RecordSection.group).
export function exitVisibleSections(isFullTime: boolean): Record<string, string[]> {
  return {
    ...activeVisibleSections(isFullTime),
    offboarding: [
      "resignation",
      "reference-letter",
      "exit-interview-notes",
      "knowledge-transfer",
      "asset-recovery",
      "system-revocation",
      "financial-settlement",
    ],
  };
}

// Red dot + default-tab source of truth (2026-08-26, see conversation) —
// which section keys are newly INTRODUCED at each stage, relative to the
// previous one. Deliberately separate from the *visible* section lists
// above: Onboarding's HR Info also shows "probation" (for Full Time), but
// that was already introduced back at the Probation stage, so it's not
// "new" here even though it can still be genuinely empty. Pre has nothing
// new (it's the starting point).
export const PRE_NEW_SECTIONS: string[] = [];
export function probationNewSections(isFullTime: boolean): string[] {
  return isFullTime ? ["probation"] : [];
}
export function onboardingNewSections(): string[] {
  return ["handbook", "tax-info"];
}

// Active stage's new sections — "probation"/"handbook" are cumulative
// carry-overs from earlier stages, not new here, same reasoning as
// onboardingNewSections' own comment. Order matches EMPLOYEE_RECORD_CATEGORIES'
// own category/section order, so firstNewSection resolves to "nda-nc" (HR
// Info, the earliest category with anything new) — confirmed, see conversation.
// "pending"/"overdue" (Task) are deliberately NEVER included here
// (2026-08-27, see conversation) even though Task itself is a genuinely new
// top-level tab at this stage — every other section here tracks "has the
// employee filled this in yet," but Task's data is assigned TO the employee
// by others, not something they fill in themselves; zero pending/overdue
// tasks is a perfectly normal state, not an incomplete-onboarding signal.
// Omitting them from this list means dotSectionKeys/dotCategoryOnlyKeys
// (both derived from it) never flag Task at all — no dot on the top-level
// tab, no dot on either sub-tab, by construction, no special-casing needed
// in EmployeeRecordView.tsx itself.
export function activeNewSections(): string[] {
  return [
    "nda-nc",
    "payroll",
    "leave",
    "performance-review",
    "training",
    "promotion",
    "transfer",
    "cert",
    "domestic-inquiry",
    "suspension",
    "showcause",
    "pip",
  ];
}

// Exit stage's new sections — every one of Active's own new sections
// ("nda-nc"/"payroll"/etc) is a carry-over here, not new, same reasoning as
// every earlier *NewSections' own comment; only Offboarding's 7 are new, and
// since ALL 7 of Offboarding's visible sections are in this list,
// entirelyNewCategories() below classifies "offboarding" as entirely new —
// dot only on its own top-level tab, never repeated on its 7 sub-tabs (see
// dotCategoryOnlyKeys), same rule Active Employment/Disciplinary already
// established. "resignation" listed first (2026-08-27, see conversation) so
// firstNewSection resolves to it — Exit's default landing tab is Offboarding
// > Resignation, matching the reference screenshot.
export function exitNewSections(): string[] {
  return [
    "resignation",
    "reference-letter",
    "exit-interview-notes",
    "knowledge-transfer",
    "asset-recovery",
    "system-revocation",
    "financial-settlement",
  ];
}

/** Per-section "is this genuinely empty" check (2026-08-26, see
 *  conversation) — deliberately narrow: only section keys that can ever
 *  appear in *NewSections above are handled; anything else returns false
 *  (never dots), since only those are ever passed in. Reuses data this page
 *  already fetches for other reasons — no new queries. */
export function isSectionEmpty(
  key: string,
  data: {
    probationInfo: ProbationInfo | null;
    documentsInfo?: DocumentsInfo | null;
    payrollInfo?: PayrollInfo | null;
    ndaInfo?: NdaInfo | null;
    nonCompeteInfo?: NonCompeteInfo | null;
    salaryRevisions?: SalaryRevisionEntry[];
    payslip?: PayslipInfo | null;
    payslipHistory?: PayslipHistoryEntry[];
    leaveHistory?: LeaveHistoryRow[];
    performanceReview?: PerformanceReviewEntry[];
    trainings?: TrainingEntry[];
    promotions?: PromotionEntry[];
    transfers?: TransferEntry[];
    achievements?: AchievementEntry[];
    domesticInquiries?: DomesticInquiryEntry[];
    suspensionLetters?: SuspensionLetterEntry[];
    showcauseWarningLetters?: ShowcauseWarningLetterEntry[];
    pips?: PipEntry[];
    resignationInfo?: ResignationInfo | null;
    referenceLetterInfo?: ReferenceLetterInfo | null;
    exitInterviewNoteInfo?: ExitInterviewNoteInfo | null;
    knowledgeTransferChecklist?: ExitChecklistItem[];
    assetRecoveryChecklist?: ExitChecklistItem[];
    systemRevocationChecklist?: ExitChecklistItem[];
    financialSettlement?: FinancialSettlementInfo | null;
  },
): boolean {
  if (key === "probation") return data.probationInfo === null;
  if (key === "handbook") return !data.documentsInfo?.employmentContractFileId && !data.documentsInfo?.employeeHandbookFileId;
  if (key === "tax-info") {
    return (
      !data.payrollInfo?.epfNumber && !data.payrollInfo?.socsoNumber && !data.payrollInfo?.eisNumber && !data.payrollInfo?.taxNumber
    );
  }
  if (key === "nda-nc") return data.ndaInfo === null && data.nonCompeteInfo === null;
  if (key === "payroll") {
    return (data.salaryRevisions?.length ?? 0) === 0 && !data.payslip && (data.payslipHistory?.length ?? 0) === 0;
  }
  if (key === "leave") return (data.leaveHistory?.length ?? 0) === 0;
  if (key === "performance-review") return (data.performanceReview?.length ?? 0) === 0;
  if (key === "training") return (data.trainings?.length ?? 0) === 0;
  if (key === "promotion") return (data.promotions?.length ?? 0) === 0;
  if (key === "transfer") return (data.transfers?.length ?? 0) === 0;
  if (key === "cert") return (data.achievements?.length ?? 0) === 0;
  if (key === "domestic-inquiry") return (data.domesticInquiries?.length ?? 0) === 0;
  if (key === "suspension") return (data.suspensionLetters?.length ?? 0) === 0;
  if (key === "showcause") return (data.showcauseWarningLetters?.length ?? 0) === 0;
  if (key === "pip") return (data.pips?.length ?? 0) === 0;
  if (key === "resignation") return data.resignationInfo === null;
  if (key === "reference-letter") return data.referenceLetterInfo === null;
  if (key === "exit-interview-notes") return data.exitInterviewNoteInfo === null;
  if (key === "knowledge-transfer") return (data.knowledgeTransferChecklist?.length ?? 0) === 0;
  if (key === "asset-recovery") return (data.assetRecoveryChecklist?.length ?? 0) === 0;
  if (key === "system-revocation") return (data.systemRevocationChecklist?.length ?? 0) === 0;
  if (key === "financial-settlement") return data.financialSettlement === null;
  return false;
}

/** Which category a given "first new section" key belongs to, so the
 *  default category/sectionKey EmployeeRecordView opens on can be computed
 *  generically rather than hand-mapping each key to its category (2026-08-26,
 *  see conversation) — e.g. "handbook" resolves to the real "hr-info"
 *  category via EMPLOYEE_RECORD_CATEGORIES, the same config this page's own
 *  visibleSectionKeys already reuse. null when there's nothing new (Pre, or
 *  a non-Full-Time Probation/Onboarding row) — callers fall back to Personal
 *  Info in that case. */
export function firstNewSection(newSectionKeys: string[]): { categoryKey: string; sectionKey: string } | null {
  const sectionKey = newSectionKeys[0];
  if (!sectionKey) return null;
  const category = EMPLOYEE_RECORD_CATEGORIES.find((c) => c.sections.some((s) => s.key === sectionKey));
  if (!category) return null;
  return { categoryKey: category.key, sectionKey };
}

/** Category keys where EVERY visible section is newly introduced at this
 *  stage (2026-08-27, see conversation) — an entirely new top-level tab
 *  (Active Employment/Disciplinary at Active; Finance at Onboarding, since
 *  its only visible section there, "tax-info", is itself new), as opposed to
 *  an existing category that merely gained one additional new sub-tab (HR
 *  Info's "nda-nc", Finance's "payroll" once Active also carries "tax-info"
 *  forward as a non-new section). For a category in this set, the red dot
 *  should show ONLY on the top-level tab, not repeated on every one of its
 *  individual sub-tabs — EmployeeRecordView suppresses sub-tab dots for any
 *  category key here (see its own dotCategoryOnlyKeys prop); the top-level
 *  tab's own dot is unaffected, computed the same way regardless. A category
 *  with zero visible sections is excluded rather than counted as "entirely
 *  new" by vacuous truth (shouldn't happen in practice). */
export function entirelyNewCategories(visibleSectionKeys: Record<string, string[]>, newSectionKeys: string[]): Set<string> {
  const newSet = new Set(newSectionKeys);
  const result = new Set<string>();
  for (const catKey of Object.keys(visibleSectionKeys)) {
    const allowed = visibleSectionKeys[catKey];
    const sectionKeys = allowed.length > 0 ? allowed : (findRecordCategory(catKey)?.sections.map((s) => s.key) ?? []);
    if (sectionKeys.length > 0 && sectionKeys.every((k) => newSet.has(k))) {
      result.add(catKey);
    }
  }
  return result;
}
