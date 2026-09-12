import { EMPLOYEE_RECORD_CATEGORIES, findRecordCategory } from "@/lib/employeeRecordConfig";
import type { EmployeeStage } from "@/lib/employeeStages";
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
//
// UNUSED as of 2026-09-08 (see conversation) — [stage]/employee/[id]/page.tsx
// switched its stage==="probation" branch to onboardingVisibleSections
// instead, since Confirm on the Probation profile jumps straight to Active
// with no separate Onboarding step, so Onboarding's own content (Doc tab,
// Finance > Tax Info) needs to already be visible/fillable during Probation,
// not just from Onboarding onward. Left in place rather than deleted, in
// case something else still references it — grep the repo for
// `probationVisibleSections` before removing.
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
// UNUSED as of 2026-09-08 (see conversation) — same reason as
// probationVisibleSections' own comment above: [stage]/employee/[id]/page.tsx
// now uses probationStageNewSections() for stage==="probation" (below), not
// this. Left in place rather than deleted — grep the repo for
// `probationNewSections` before removing.
export function probationNewSections(isFullTime: boolean): string[] {
  return isFullTime ? ["probation"] : [];
}
export function onboardingNewSections(): string[] {
  return ["handbook", "tax-info"];
}
// Probation stage's own new-sections list (2026-09-08, see conversation) —
// deliberately NOT folded into onboardingNewSections() itself, since that
// function is also used by the real Onboarding-stage page, which must NOT
// dot "probation" (a decision already made back at the Probation stage is
// not "new" once you've reached Onboarding — see onboardingVisibleSections'
// own comment). "probation" listed first: firstNewSection() (below) picks
// newSectionKeys[0] as the profile's default-landing tab, so a Probation-
// stage employee now defaults to HR Info > Probation instead of Doc
// (intentional — see conversation, Probation is the most relevant tab for
// someone actually in that stage). Onboarding's own two (handbook/tax-info)
// come after, unchanged and still spread from the shared function rather
// than re-listed, so there's exactly one place that defines their content.
export function probationStageNewSections(): string[] {
  return ["probation", ...onboardingNewSections()];
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

// Extracted from src/app/employee-record/[id]/[category]/[section]/page.tsx
// (2026-08-28, see conversation) — shared now by that page AND the
// /employee-record/[id] redirect shim, which needs the exact same
// "what's new for this person" computation to land them on their first new
// section by default, matching the stage-folder pages' own firstNewSection-
// based default landing instead of always Personal Info.
//
// A Probation-effective employee (override.stage === "probation", which per
// getRealAccountLifecycleOverride's own source always pairs with
// extraStages: ["onboarding"] — Probation is inherently an Onboarding
// sub-state, never reached any other way) is deliberately mapped to
// ONBOARDING's own new-section function, not a Probation-specific one —
// Onboarding's set is already the superset (its HR Info list already
// includes "probation" as a sub-tab), so showing the narrower Probation-only
// set here would be a regression relative to what Onboarding already shows.
// This mapping intentionally ignores extraStages — checking stage ===
// "probation" alone is sufficient (confirmed via the override's own source).
export function normalizeStageForVisibility(stage: EmployeeStage): "pre" | "onboarding" | "active" | "exit" {
  if (stage === "probation") return "onboarding";
  if (stage === "pre" || stage === "onboarding" || stage === "active" || stage === "exit") return stage;
  return "pre";
}

// Kept in sync with normalizeStageForVisibility above rather than a separate
// rule, since "what's new" only makes sense relative to whatever set of
// sections is actually visible (a Probation-effective employee seeing
// Onboarding's fuller set should also get Onboarding's own "what's new"
// tracking, e.g. Doc/Tax Info, not just Probation's narrower one).
export function newSectionsForStage(stage: EmployeeStage): string[] {
  const normalized = normalizeStageForVisibility(stage);
  if (normalized === "pre") return PRE_NEW_SECTIONS;
  if (normalized === "onboarding") return onboardingNewSections();
  if (normalized === "active") return activeNewSections();
  return exitNewSections();
}

// Moved here from [category]/[section]/page.tsx's own local helper
// (2026-09-08, see conversation — bug fix) — the /employee-record/[id]
// redirect shim needs this exact same stage-based visible-section map to
// compute a role-aware default landing target, not just newSectionsForStage
// above (which only lists what's NEW, not everything visible — not enough
// to fall back into when nothing "new" survives a role restriction). Kept
// out of either page.tsx file for the same reason newSectionsForStage
// already was: Next.js route modules importing each other for internal
// helpers is fragile.
export function visibleSectionsForStage(stage: EmployeeStage, isFullTime: boolean): Record<string, string[]> {
  const normalized = normalizeStageForVisibility(stage);
  if (normalized === "pre") return PRE_VISIBLE_SECTIONS;
  if (normalized === "onboarding") return onboardingVisibleSections(isFullTime);
  if (normalized === "active") return activeVisibleSections(isFullTime);
  return exitVisibleSections(isFullTime);
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

// Whether a given category/section is actually visible under a computed
// visibleSectionKeys map — same "empty array = every section of that
// category stays visible" convention EmployeeRecordView's own filtering
// already uses (RecordSection's own doc comment). Callers gating page
// access (notFound() before ever rendering) should use this, not just check
// `category in visibleSectionKeys` — a category can be present with a
// non-empty array that doesn't include this specific section.
export function isSectionVisible(
  visibleSectionKeys: Record<string, string[]>,
  categoryKey: string,
  sectionKey: string,
): boolean {
  if (!(categoryKey in visibleSectionKeys)) return false;
  const allowed = visibleSectionKeys[categoryKey];
  return allowed.length === 0 || allowed.includes(sectionKey);
}

// Every section key visible anywhere in a computed visibleSectionKeys map,
// flattened across categories — same "empty array = every section of that
// category" expansion isSectionVisible/entirelyNewCategories already use.
// Used to filter a flat "what's new" list (newSectionsForStage) down to
// only what a role-restricted view actually allows, before picking a
// default landing section (see firstVisibleSection below and the
// /employee-record/[id] redirect shim, 2026-09-08 — bug fix).
export function allVisibleSectionKeysFlat(visibleSectionKeys: Record<string, string[]>): Set<string> {
  const flat = new Set<string>();
  for (const [categoryKey, allowed] of Object.entries(visibleSectionKeys)) {
    const keys = allowed.length > 0 ? allowed : (findRecordCategory(categoryKey)?.sections.map((s) => s.key) ?? []);
    for (const key of keys) flat.add(key);
  }
  return flat;
}

// The first genuinely visible category/section under a computed
// visibleSectionKeys map, in EMPLOYEE_RECORD_CATEGORIES' own canonical
// order (2026-09-08, see conversation — bug fix) — the fallback the
// /employee-record/[id] redirect shim uses when nothing in the stage's own
// "what's new" list survives a role restriction (e.g. Finance: nothing in
// Active's newSectionKeys is Finance-visible, so this picks
// finance/payroll — the first section of the first category Finance's own
// restricted map actually has anything in, per EMPLOYEE_RECORD_CATEGORIES'
// fixed personal-info/hr-info/finance/... order). Returns null only if the
// map is empty (nothing visible at all) — callers fall back further from
// there themselves.
export function firstVisibleSection(visibleSectionKeys: Record<string, string[]>): { categoryKey: string; sectionKey: string } | null {
  for (const category of EMPLOYEE_RECORD_CATEGORIES) {
    if (!(category.key in visibleSectionKeys)) continue;
    const allowed = visibleSectionKeys[category.key];
    const first = category.sections.find((s) => allowed.length === 0 || allowed.includes(s.key));
    if (first) return { categoryKey: category.key, sectionKey: first.key };
  }
  return null;
}

// ─── Role-based section restriction (2026-09-08, see conversation) ───
//
// Layered ON TOP of the stage-based visibility above, never replacing it —
// each function here takes an already stage-filtered map and narrows it
// further for a specific viewer/relationship. A category whose section list
// becomes empty is dropped entirely (not kept as `[]`), since
// visibleCategories' own `c.key in visibleSectionKeys` check only tests key
// presence — an empty array would still render an empty, broken tab.
// Composes with the stage functions above via plain narrowing (this can
// only ever remove keys the stage map already had, never add any it
// didn't) — the async resolver in employeeSectionAccess.ts decides WHICH of
// these to call for a given viewer/subject pair; these stay pure and
// synchronous so they're cheap to unit test directly.
function filterVisibleSections(
  stageMap: Record<string, string[]>,
  shouldHide: (categoryKey: string, sectionKey: string) => boolean,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [categoryKey, sectionKeys] of Object.entries(stageMap)) {
    const kept = sectionKeys.filter((key) => !shouldHide(categoryKey, key));
    if (kept.length > 0) result[categoryKey] = kept;
  }
  return result;
}

// Universal self-view rule — applies whenever viewer === subject, for EVERY
// role including HR/CEO, and REPLACES the role-specific rules below entirely
// rather than stacking with them (an HR person viewing their own profile
// still loses Hiring Notes/Reference, but keeps Payroll/Tax Info/Disciplinary/
// Medical Check, none of which self-view touches). Hiring Notes/Reference
// are the interviewer's/referee's own private evaluation of the person —
// showing them back to the subject discourages honest evaluation.
export function applySelfViewRestriction(stageMap: Record<string, string[]>): Record<string, string[]> {
  const HIDDEN_HR_INFO = new Set(["hiring-notes", "reference"]);
  return filterVisibleSections(stageMap, (cat, key) => cat === "hr-info" && HIDDEN_HR_INFO.has(key));
}

// HR/Superadmin/is_full_access viewing someone ELSE (not self — see above).
// Payroll/Tax Info moved to Finance's own domain, out of HR's. subjectIsHr
// additionally hides Medical Check and all 4 Disciplinary sub-tabs — HR-on-HR
// protection, so one HR colleague can't browse another's own sensitive file;
// does not apply when the subject isn't HR, or when HR views their own
// profile (handled entirely by applySelfViewRestriction instead).
export function applyHrViewingOtherRestriction(
  stageMap: Record<string, string[]>,
  subjectIsHr: boolean,
): Record<string, string[]> {
  const HIDDEN_FINANCE = new Set(["payroll", "tax-info"]);
  const HIDDEN_HR_INFO_IF_SUBJECT_HR = new Set(["medical-check"]);
  const HIDDEN_DISCIPLINARY_IF_SUBJECT_HR = new Set(["domestic-inquiry", "suspension", "showcause", "pip"]);
  return filterVisibleSections(stageMap, (cat, key) => {
    if (cat === "finance" && HIDDEN_FINANCE.has(key)) return true;
    if (subjectIsHr && cat === "hr-info" && HIDDEN_HR_INFO_IF_SUBJECT_HR.has(key)) return true;
    if (subjectIsHr && cat === "disciplinary" && HIDDEN_DISCIPLINARY_IF_SUBJECT_HR.has(key)) return true;
    return false;
  });
}

// Finance (finance@ebright.my specifically — resolved by the caller, not
// role_type, since Finance has no distinct role_type in this system) viewing
// anyone else. ONLY Payroll/Tax Info and Offboarding's Financial Settlement
// survive — every other category is hidden entirely, and Offboarding's other
// 6 sub-tabs (Resignation/Reference Letter/Exit Interview Notes/Clearance's
// 3) are hidden too, keeping only Financial Settlement from that category.
export function applyFinanceRestriction(stageMap: Record<string, string[]>): Record<string, string[]> {
  return filterVisibleSections(stageMap, (cat, key) => {
    if (cat === "finance") return false; // keep both payroll + tax-info
    if (cat === "offboarding") return key !== "financial-settlement"; // keep ONLY this one
    return true; // every other category hidden entirely
  });
}

// HOD (own department) / a real Branch Manager (own branch, role_type
// "staff", position "BM") / role_type "od" (a generic department-or-branch
// account, same tier per explicit correction, see conversation) / any other
// role_type not named elsewhere in employeeSectionAccess.ts's resolver — all
// share this one restriction. Payroll/Tax Info (not their function), Medical
// Check (no operational need), and Reference/Hiring Notes (hiring-process
// artifacts, not needed for ongoing team management) are hidden. Offboarding
// is now hidden entirely too (2026-09-09, see conversation — reversed the
// earlier "stays fully visible" decision above; superseded, not deleted, so
// the history of why it was originally kept visible stays legible) — paired
// with requireNotHodTierViewingSomeoneElse in employeeRecordActions.ts,
// which makes HOD/BM fully view-only for anyone but themselves, so there's
// no longer an "editing an exiting team member" use case this visibility
// was serving.
export function applyHodTierRestriction(stageMap: Record<string, string[]>): Record<string, string[]> {
  const HIDDEN_FINANCE = new Set(["payroll", "tax-info"]);
  const HIDDEN_HR_INFO = new Set(["medical-check", "reference", "hiring-notes"]);
  return filterVisibleSections(stageMap, (cat, key) => {
    if (cat === "finance" && HIDDEN_FINANCE.has(key)) return true;
    if (cat === "hr-info" && HIDDEN_HR_INFO.has(key)) return true;
    if (cat === "offboarding") return true;
    return false;
  });
}

// CEO viewing someone else. Coarse, all-or-nothing per explicit decision
// (see conversation) — the current data model doesn't separate disciplinary
// outcome from investigation detail, or fit-for-duty status from a full
// medical report, so a more nuanced redaction isn't meaningful without new
// fields; this hides both sections entirely rather than showing a
// half-redacted version.
export function applyCeoRestriction(stageMap: Record<string, string[]>): Record<string, string[]> {
  return filterVisibleSections(stageMap, (cat, key) => {
    if (cat === "disciplinary") return true;
    if (cat === "hr-info" && key === "medical-check") return true;
    return false;
  });
}
