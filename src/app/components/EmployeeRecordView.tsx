"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Home } from "lucide-react";
import { initialsFromName } from "@/lib/text";
import OverdueDot from "@/app/components/OverdueDot";
import { EMPLOYEE_RECORD_CATEGORIES, type RecordCategory } from "@/lib/employeeRecordConfig";
import { STAGE_LABELS, type EmployeeStage } from "@/lib/employeeStages";
import {
  PanelHeading,
  Subsection,
  RecordTable,
  EditableField,
  EditableSelectField,
  EmergencyContactPanel,
  PersonalInfoPanel,
  ResumePanel,
  ReferenceCheckPanel,
  MedicalCheckPanel,
  InterviewAssessmentPanel,
  DocumentsPanel,
  OnboardingPayrollPanel,
  AchievementPanel,
  PromotionPanel,
  TransferPanel,
  TrainingPanel,
  NdaNcPanel,
  OfferLetterPanel,
  ProbationPanel,
  DomesticInquiryPanel,
  SuspensionPanel,
  ShowcausePanel,
  PipPanel,
  ResignationPanel,
  ReferenceLetterPanel,
  ExitInterviewNotesPanel,
  KnowledgeTransferPanel,
  AssetRecoveryPanel,
  SystemRevocationPanel,
  FinancialSettlementPanel,
  RealAttachmentLink,
  RecordAddModal,
  LEAVE_DETAIL_FIELDS,
} from "@/app/components/ActiveProfilePanels";
import { EditableSection } from "@/app/components/EditMode";
import { PageEditProvider, PageEditToggleButton, PageEditMessageDialog, type ValidationResult } from "@/app/components/PageEditMode";
import { RAIL_PILL_PADDING_CLASS, RAIL_PILL_FONT_SIZE_CLASS, RAIL_GAP_PX } from "@/lib/stageProfileConfig";
import {
  EMPLOYEE_RECORD_STATIC_PANELS,
  PayrollPanel,
  GuardianInfoPanel,
  PerformanceReviewPanel,
  TaskPendingPanel,
  TaskOverduePanel,
} from "@/app/components/EmployeeRecordPanels";
import { updateBankDetails, updateEmergencyContact, updatePaymentInfo } from "@/lib/employeeRecordActions";
import type { ProbationDisplayInfo } from "@/lib/probationDecision";
import type {
  EmployeeDetailFull,
  BranchOpt,
  DepartmentOpt,
  LeaveHistoryRow,
  ResumeInfo,
  InterviewAssessmentInfo,
  ReferenceCheckInfo,
  MedicalCheckInfo,
  ProbationInfo,
  DocumentsInfo,
  PayrollInfo,
  AchievementEntry,
  SalaryRevisionEntry,
  PromotionEntry,
  TransferEntry,
  TrainingEntry,
  NdaInfo,
  NonCompeteInfo,
  DomesticInquiryEntry,
  SuspensionLetterEntry,
  ShowcauseWarningLetterEntry,
  PipEntry,
  GuardianInfoEntry,
  PaymentInfoData,
  PerformanceReviewEntry,
  PayslipInfo,
  PayslipHistoryEntry,
  EmployeeTasksSummary,
  ResignationInfo,
  ReferenceLetterInfo,
  ExitInterviewNoteInfo,
  ExitChecklistItem,
  FinancialSettlementInfo,
} from "@/lib/employeeQueries";

// Vertical sub-nav rail — green, from category_shared.css (shared by every
// Employee Record category, e.g. Personal Info / Guardian Info / Payment &
// Bank Info / Emergency Contact under "Personal Info"). Hidden entirely on
// touch devices ([@media(hover:none)]:hidden below) — width is a literal
// w-[210px] Tailwind class since it now only ever renders at its one fixed
// desktop size. That literal must stay equal to RAIL_WIDTH_PX (imported
// above) — every stage's own rail (StageProfileView.tsx) now reads
// RAIL_WIDTH_PX/RAIL_GAP_PX directly from stageProfileConfig.ts so they can
// never drift from this page's rail again (2026-08-25, see conversation);
// this page's grid column can't reference the constant directly since
// Tailwind arbitrary-value classes must be static strings, so keep both in
// sync by hand if either ever changes.
const RAIL_BASE = "bg-[#b0ffbfa8] dark:bg-slate-800 border-[#0a6e03] dark:border-emerald-700 text-[#4b4949d6] dark:text-slate-300";
const RAIL_CURRENT = "bg-[#0a6e03] border-[#063f02] text-white";
// Offboarding's "Clearance" group children (2026-08-27, see conversation) —
// exact same amber literals as stageProfileConfig.ts's own Exit
// navRail.clearanceBase/clearanceCurrent, so the nested group looks
// identical to what Exit's old StageProfileView UI already rendered, not a
// green-tinted reinterpretation.
const RAIL_CLEARANCE_BASE = "bg-[#ffe29aa8] border-[#e8a93c] text-[#4b4949d6] dark:bg-transparent dark:border-amber-700 dark:text-amber-300";
const RAIL_CLEARANCE_CURRENT = "bg-[#e8a93c] border-[#8a5a06] text-white dark:bg-amber-600 dark:border-amber-600";

// PageEditProvider rollout (2026-08-13, see conversation) — categories
// whose sub-sections switch via client-side state instead of route
// navigation, so a single page-level Edit/Save can span all of them. Grows
// one entry per rollout batch (Personal Info was the pilot, then HR Info,
// Finance, and Active Employment). This Set only ever controls the sub-tab
// nav mechanism (button+state vs real Link, see below) and which of
// clientSection/sectionKey currentSection derives from — it does NOT by
// itself wrap a category in PageEditProvider (each category's own render
// block below does that explicitly, or doesn't). Disciplinary is included
// (2026-08-26, see conversation) purely so its sub-tabs work at all under
// Active stage's embedded usage (categoryNavigationMode="client", single
// URL, no real .../disciplinary/[section] route to Link to there) — its 4
// sections stay un-wrapped, direct-return panels, same as before; only the
// nav mechanism changed, and on the real /employee-record/[id] page this is
// simply the same rollout every other category here already got (sub-tabs
// switch without a real navigation; the URL stays on the category's own
// first section, and /employee-record/[id]/disciplinary/[section]/page.tsx
// remains reachable directly, just no longer clicked into from here). Task
// is included for the identical reason (2026-08-27, see conversation) — its
// Pending/Overdue toggle has the same broken-link problem under Active
// stage's embedded usage; also un-wrapped, direct-return panels, unaffected
// otherwise. Offboarding is included both for the broken-link reason AND
// because it's individually EditableSection-wrapped like HR Info/Finance
// (its own render block below DOES wrap it in a PageEditProvider) — same
// reasoning either way, this Set doesn't distinguish.
const CLIENT_TAB_CATEGORIES = new Set([
  "personal-info",
  "hr-info",
  "finance",
  "active-employment",
  "disciplinary",
  "task",
  "offboarding",
]);

// Desktop cat-tabs sizing — ONE fixed size for every stage/tab count
// (2026-08-27, see conversation — replaces an earlier per-count shrink-to-fit
// table; the user wants the tabs to look identical everywhere, not scaled
// down as more tabs appear). These exact values (px-2.5 py-1.5, text-sm,
// gap-1) are the reference screenshot's own proportions — the Active stage's
// 6-tab bar (Personal Info/HR Info/Finance/Active Employment/Disciplinary/
// Task), confirmed comfortable and evenly spaced with no overflow.
//
// Exit's fit at this fixed size (7 tabs — Active's 6 plus Offboarding; NOT
// 8, see conversation) was flagged rather than assumed: rough character-
// width arithmetic at this padding/font puts the row at roughly 700-720px
// wide (longest label "Active Employment" ~140px, the other 6 combined
// ~580px, plus 6 gaps), which is within a typical desktop card width at
// this app's own max-w-5xl cap (~1024px minus the 210px rail minus outer
// padding, ~750-780px) but with only modest margin — no rendered-browser
// measurement backs this, so it should be visually confirmed at Exit before
// relying on it. If it turns out too tight, the options are the card's own
// internal p-4 sm:p-6 padding (reduce it specifically on this row) or a
// slightly smaller CAT_TAB_SIZE applied everywhere (keeping the "one size
// for every stage" rule) — not a return to per-count shrinking.
const CAT_TAB_SIZE = { pad: "px-2.5 py-1.5", text: "text-sm", gap: "gap-1" };

// Corner "not filled in yet" badge — TOP-LEVEL CAT-TABS ONLY (2026-08-27,
// see conversation — initially applied everywhere, then narrowed back to
// just the top-level tab bar; every sub-tab/rail dot — the mobile sub-tab
// row's leaf/group pills, and the desktop rail's leaf/group/group-children
// pills — stays inline next to its label, unchanged from before any of
// this). Replaces OverdueDot's default inline-with-the-label placement with
// a notification-badge look: absolutely positioned at the pill's own
// top-right corner, half overlapping the edge. The caller is responsible
// for making the pill itself `relative` (its own button/Link className) so
// this has the right positioning context, and for rendering this as a
// direct sibling of the pill's label text — not nested inside an inner
// flex/span wrapper, which would anchor the badge to that inner wrapper's
// corner instead of the whole pill's. Reuses OverdueDot unmodified (still
// rendered inline everywhere else — every sub-tab site here, plus namelist
// rows elsewhere) — only this wrapper is new.
function cornerDot(show: boolean) {
  if (!show) return null;
  return (
    <span className="absolute -top-1.5 -right-1.5">
      <OverdueDot count={1} label="Not filled in yet" />
    </span>
  );
}

interface Props {
  employeeId: number;
  employeeName: string;
  category: RecordCategory;
  sectionKey: string;
  /** Position/Branch/Department/current stage — from the same EmployeeOverviewRow
   *  already fetched unconditionally on every page load (for the notFound() check),
   *  so this profile summary shows on every category/section, not just Personal Info. */
  position?: string | null;
  branchName?: string | null;
  departmentName?: string | null;
  stage?: EmployeeStage;
  /** employment.employee_id — only assigned from Probation/Onboarding onward, so this is
   *  null (and hidden) for anyone still in Pre. */
  employeeCode?: string | null;
  /** Real user_profile/bank_details/emergency_contact data — only fetched for Personal Info's 3 data sections. */
  employeeDetail?: EmployeeDetailFull | null;
  /** Real leave_request rows — only fetched for Active Employment > Leave. */
  leaveHistory?: LeaveHistoryRow[];
  /** Real resume table data — only fetched for HR Info > Resume/CV. */
  resumeInfo?: ResumeInfo | null;
  /** Real interview_assessment table data — only fetched for HR Info >
   *  Hiring Notes (shares this table with Pre stage's own Interview
   *  Assessment tab — see InterviewAssessmentPanel's own comment). */
  interviewAssessment?: InterviewAssessmentInfo | null;
  /** Real reference_check table data — only fetched for HR Info > Reference. */
  referenceCheck?: ReferenceCheckInfo | null;
  /** Real medical_check table data — only fetched for HR Info > Medical Check. */
  medicalCheck?: MedicalCheckInfo | null;
  /** Real probation table data — only fetched for HR Info > Probation
   *  (2026-08-26, see conversation) — same ProbationPanel/data as the
   *  Probation stage-flow's own tab. */
  probationInfo?: ProbationInfo | null;
  /** BranchStaff/career_applications-derived Start Date/End Date/Feedback/
   *  display status (see probationDecision.ts) — undefined only when HR
   *  Info's Probation sub-tab isn't visible/fetched. */
  probationDisplay?: ProbationDisplayInfo;
  /** HR/Superadmin only, per explicit decision (see conversation) — gates
   *  the Confirm/Extend/Stop buttons; decideProbationOutcome re-checks this
   *  server-side regardless. */
  canDecideProbation?: boolean;
  /** Real documents table data — only fetched for HR Info > Handbook. */
  documentsInfo?: DocumentsInfo | null;
  /** Real payroll table data — only fetched for Finance > Tax Info. */
  payrollInfo?: PayrollInfo | null;
  /** Real achievement rows — only fetched for Active Employment > Cert./Achievement. */
  achievements?: AchievementEntry[];
  /** Real salary_revision rows — only fetched for Finance > Payroll/Payslip. */
  salaryRevisions?: SalaryRevisionEntry[];
  /** Real promotion rows — only fetched for Active Employment > Promotion. */
  promotions?: PromotionEntry[];
  /** Real transfer rows — only fetched for Active Employment > Transfer. */
  transfers?: TransferEntry[];
  /** Real training rows — only fetched for Active Employment > Training. */
  trainings?: TrainingEntry[];
  /** Real nda/non_compete table data — only fetched for HR Info > NDA/NC. */
  ndaInfo?: NdaInfo | null;
  nonCompeteInfo?: NonCompeteInfo | null;
  /** Real disciplinary sub-table rows — only fetched for their own Disciplinary sub-tabs. */
  domesticInquiries?: DomesticInquiryEntry[];
  suspensionLetters?: SuspensionLetterEntry[];
  showcauseWarningLetters?: ShowcauseWarningLetterEntry[];
  pips?: PipEntry[];
  /** Real guardian_info rows — only fetched for Personal Info > Guardian Info. */
  guardianInfo?: GuardianInfoEntry[];
  /** Real payment_info data — only fetched for Personal Info > Payment. */
  paymentInfo?: PaymentInfoData | null;
  /** Real performance_review data — only fetched for Active Employment > Performance Review. */
  performanceReview?: PerformanceReviewEntry[];
  /** Real payslip data — only fetched for Finance > Payroll/Payslip. */
  payslip?: PayslipInfo | null;
  /** Real payslip_history data — only fetched for Finance > Payroll/Payslip. */
  payslipHistory?: PayslipHistoryEntry[];
  /** Combined Branch/Department option lists for Transfer's From/To dropdowns. */
  branches?: BranchOpt[];
  departments?: DepartmentOpt[];
  /** Real Task Manager data (separate database) — only fetched for the Task category. */
  tasks?: EmployeeTasksSummary;
  /** Exit's own 7 tabs (2026-08-27, see conversation) — only fetched for the
   *  Offboarding category. Knowledge Transfer/Asset Recovery/System
   *  Revocation are the 3 checklists nested under Offboarding's "Clearance"
   *  group (see employeeRecordConfig.ts's own RecordSection.group). */
  resignationInfo?: ResignationInfo | null;
  referenceLetterInfo?: ReferenceLetterInfo | null;
  exitInterviewNoteInfo?: ExitInterviewNoteInfo | null;
  knowledgeTransferChecklist?: ExitChecklistItem[];
  assetRecoveryChecklist?: ExitChecklistItem[];
  systemRevocationChecklist?: ExitChecklistItem[];
  financialSettlement?: FinancialSettlementInfo | null;
  /** HR/Superadmin only — gates the "+ Add Item" affordance on Offboarding's
   *  3 Clearance checklists, same role check as canDecideProbation above. */
  canAddChecklistItem?: boolean;
  /** false hides every panel's Edit/Save toggle (view-only) — e.g. a CEO viewing
   *  someone else's record, where the server-side guard already blocks the save.
   *  Defaults true so this stays a no-op unless a caller opts in. */
  canEdit?: boolean;
  /** Restricts which categories/sections render (2026-08-26, see
   *  conversation) — e.g. Pre stage's embedded usage, which only shows
   *  Personal Info (Personal Info + Guardian Info) and HR Info (Resume/
   *  Offer Letter/Hiring Notes/Reference/Medical Check, no NDA-NC/Handbook).
   *  Keyed by category key: a category key present here is visible, filtered
   *  down to just the section keys listed (empty array = every section of
   *  that category stays visible); a category key absent entirely is hidden.
   *  undefined (default) shows every category/section unfiltered — the real
   *  /employee-record/[id] page's exact current behavior, unaffected. */
  visibleSectionKeys?: Record<string, string[]>;
  /** "route" (default) — current behavior: category tabs are real
   *  navigation Links to `${basePath}/${cat.key}`. "client" — for embedded
   *  usage on a single URL (Pre stage, 2026-08-26): category switching
   *  becomes local state instead, the same mechanism CLIENT_TAB_CATEGORIES'
   *  own sub-tabs already use. */
  categoryNavigationMode?: "route" | "client";
  /** Base path for category/section `<Link>`s when categoryNavigationMode
   *  is "route" (defaults to `/employee-record/${employeeId}`, today's exact
   *  literal) — unused in "client" mode. */
  basePath?: string;
  /** Final breadcrumb crumb's text (defaults to "Employee Record", today's
   *  exact copy) — e.g. "Pre" for the embedded Pre-stage usage, since
   *  someone in Pre isn't a confirmed "Employee Record" yet. */
  breadcrumbLabel?: string;
  /** Section keys to show a small red dot next to (2026-08-26, see
   *  conversation) — the caller's own "newly introduced at this stage AND
   *  still empty" computation; this component stays agnostic to what
   *  "empty" means for any given section. A category tab shows the same dot
   *  whenever any of its own sections is in this set. undefined (default)
   *  shows no dots — the real /employee-record/[id] page's exact current
   *  behavior, unaffected. */
  dotSectionKeys?: Set<string>;
  /** Category keys where the red dot shows ONLY on the top-level tab, never
   *  repeated on any of that category's individual sub-tabs (2026-08-27, see
   *  conversation) — for a category that's entirely new at this stage
   *  (e.g. Active Employment/Disciplinary at Active), as opposed to an
   *  existing category that merely gained one new sub-tab (HR Info's
   *  "nda-nc"), where the sub-tab-level dot should still show. The top-level
   *  tab's own dot is unaffected either way — still derived from
   *  dotSectionKeys the same way regardless of this prop. undefined
   *  (default) suppresses nothing — real /employee-record/[id] page's exact
   *  current behavior, unaffected. */
  dotCategoryOnlyKeys?: Set<string>;
}

export default function EmployeeRecordView({
  employeeId,
  employeeName,
  category,
  sectionKey,
  position,
  branchName,
  departmentName,
  stage,
  employeeCode,
  employeeDetail,
  leaveHistory,
  resumeInfo,
  interviewAssessment,
  referenceCheck,
  medicalCheck,
  probationInfo,
  probationDisplay,
  canDecideProbation,
  documentsInfo,
  payrollInfo,
  achievements,
  salaryRevisions,
  promotions,
  transfers,
  trainings,
  ndaInfo,
  nonCompeteInfo,
  domesticInquiries,
  suspensionLetters,
  showcauseWarningLetters,
  pips,
  guardianInfo,
  paymentInfo,
  performanceReview,
  payslip,
  payslipHistory,
  branches,
  departments,
  tasks,
  resignationInfo,
  referenceLetterInfo,
  exitInterviewNoteInfo,
  knowledgeTransferChecklist,
  assetRecoveryChecklist,
  systemRevocationChecklist,
  financialSettlement,
  canAddChecklistItem,
  canEdit = true,
  visibleSectionKeys,
  categoryNavigationMode = "route",
  basePath = `/employee-record/${employeeId}`,
  breadcrumbLabel = "Employee Record",
  dotSectionKeys,
  dotCategoryOnlyKeys,
}: Props) {
  // Rollout categories (2026-08-13, see conversation) — each one's
  // sub-sections switch via this client-side state instead of navigating,
  // so an edit in progress on one survives visiting the others. Seeded from
  // the URL's own section param so a direct link/bookmark to e.g.
  // .../hr-info/reference still opens on that one; from there, the section
  // buttons below just update this state instead of the URL. Personal Info
  // was the pilot batch; HR Info is Batch 2 (Finance/Onboarding/Exit follow
  // in later batches — see conversation for the confirmed order). Every
  // OTHER category is unaffected — still real route navigation between
  // sections, one panel mounted at a time, same as before this rollout.
  //
  // visibleSectionKeys/categoryNavigationMode (2026-08-26, see conversation)
  // — visibleCategories filters both which top-tabs show and each one's own
  // sections; undefined visibleSectionKeys reproduces EMPLOYEE_RECORD_CATEGORIES
  // unfiltered, so /employee-record/[id]'s own real usage is byte-for-byte
  // unchanged. activeCategoryKey only matters in "client" mode (Pre) — in
  // "route" mode currentCategory is always derived from the category prop
  // instead, exactly as before this existed.
  const visibleCategories = visibleSectionKeys
    ? EMPLOYEE_RECORD_CATEGORIES.filter((c) => c.key in visibleSectionKeys).map((c) => {
        const allowed = visibleSectionKeys[c.key];
        return allowed.length > 0 ? { ...c, sections: c.sections.filter((s) => allowed.includes(s.key)) } : c;
      })
    : EMPLOYEE_RECORD_CATEGORIES;
  const tabSize = CAT_TAB_SIZE;
  const [activeCategoryKey, setActiveCategoryKey] = useState(category.key);
  const currentCategory =
    categoryNavigationMode === "client"
      ? (visibleCategories.find((c) => c.key === activeCategoryKey) ?? visibleCategories[0])
      : (visibleCategories.find((c) => c.key === category.key) ?? category);
  const isClientTabCategory = CLIENT_TAB_CATEGORIES.has(currentCategory.key);
  const [clientSection, setClientSection] = useState(sectionKey);
  const currentSection = isClientTabCategory
    ? (currentCategory.sections.find((s) => s.key === clientSection) ?? currentCategory.sections[0])
    : (currentCategory.sections.find((s) => s.key === sectionKey) ?? currentCategory.sections[0]);

  // Nested groups (2026-08-27, see conversation) — same concept as
  // StageProfileView.tsx's own topLevel/groups split (ported from there,
  // see RecordSection.group's own comment in employeeRecordConfig.ts). Only
  // Offboarding's "Clearance" uses this today; every other category has no
  // grouped sections, so topLevelSections === currentCategory.sections and
  // sectionGroups is empty — byte-for-byte the same nav as before this
  // existed. Recomputed every render off currentCategory (not memoized,
  // same as currentSection above) since it's cheap and currentCategory
  // itself already changes on every category switch.
  const topLevelSections = currentCategory.sections.filter((s) => !s.group);
  const sectionGroups = Array.from(new Set(currentCategory.sections.filter((s) => s.group).map((s) => s.group as string)));
  // Lazy initializer only, same as StageProfileView.tsx's own openGroup —
  // seeded from the initial sectionKey prop so a caller that opens straight
  // on a grouped section (e.g. firstNewSection landing on "knowledge-transfer")
  // starts with that section's own group already expanded, not collapsed.
  const [openGroup, setOpenGroup] = useState<string | null>(
    () => sectionGroups.find((g) => currentCategory.sections.some((s) => s.group === g && s.key === sectionKey)) ?? null,
  );

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      {/* No longer needs a --rail-width custom property: the vertical rail
          is either hidden outright (touch devices, replaced by the mobile
          sub-tab row) or rendered at its one fixed w-[210px] (mouse/
          trackpad-driven browsers) — neither consumer needs a shared fluid
          value anymore. */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/employee-folder" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            Employee Overview
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">{breadcrumbLabel}</span>
        </nav>

        <div className="flex items-start gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300 font-semibold text-lg flex items-center justify-center shrink-0">
            {initialsFromName(employeeName)}
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{employeeName}</h1>
            {stage && stage !== "pre" && employeeCode && (
              <span className="block text-xs text-slate-500 dark:text-slate-400">ID: {employeeCode}</span>
            )}
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {departmentName ?? branchName ?? "--"} · {position || "--"}
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{stage ? STAGE_LABELS[stage] : "--"}</span>
          </div>
        </div>

        {/* cat-tabs — horizontal, one entry per record category, independent
            of any stage. Switched from a width breakpoint (lg:) to the
            [@media(hover:none)] arbitrary variant — same technique already
            used in src/task-manager/ui/bits.tsx for the identical "real
            touch device, not just a narrow window" distinction. A width
            breakpoint can't tell an iPad Pro in landscape (1366px CSS width,
            wider than a resized desktop browser would ever need to trigger
            "mobile" at) from an actual small desktop window — hover:none
            only matches when the PRIMARY input has no hover capability
            (touch), true for phones/tablets of any size/orientation and
            false for anything mouse/trackpad-driven, which is the actual
            "not a desktop browser" distinction requested. (Caveat: iPadOS
            reports hover:hover if an external trackpad/mouse is actively
            paired — an intentional platform behavior, not a bug in this
            query — so that specific combination would still get the
            desktop layout below.) Base classes are now the desktop
            (folder-tab) look; [@media(hover:none)]: overrides restore the
            pill-capsule look for touch devices — same bg-[#eef3fb] rounded
            capsule + bg-[#a9d3f7bd] text-[#004386c9] active state as
            EmployeeNamelistView's List/Grid toggle and the Task panel's
            Source filter pills, for visual consistency across the module.
            w-full on touch (not the old calc(100% - rail width) cap, which
            was truncating labels like "Finance" by reserving space for a
            sidebar that's hidden on touch anyway). Tabs that still don't
            fit are simply not visible until scrolled to (nowrap +
            overflow-x-auto on touch), never wrapped to a second row, either
            way. On desktop specifically, NO scroll (2026-08-27, see
            conversation — the user wants every tab the same fixed size
            everywhere, CAT_TAB_SIZE above, not scaled by tab count); see
            CAT_TAB_SIZE's own comment for the fit check at Exit's 7-tab
            count, the largest this app has today.

            No overflow-hidden here anymore (2026-08-27, see conversation —
            corner-badge fix) — it was added as a defensive clip against a
            row that doesn't fit, but `overflow: hidden` clips BOTH axes,
            and cornerDot's badges poke a few px above each pill's top edge
            by design; with overflow-hidden still set, every one of those
            badges would render fully or partially cut off, the moment the
            nav's own box (not just an individual pill) starts right at the
            tab row's top edge with no padding to spare. Left as the CSS
            default (visible) instead — if the row genuinely doesn't fit at
            some tab count, the tabs now visibly overflow rather than
            silently clip, which is what was actually wanted in the first
            place (see CAT_TAB_SIZE's own comment: "flag me... rather than
            silently shrinking"). This also fixes a touch-specific version
            of the same clipping bug that would otherwise still exist:
            [@media(hover:none)]:overflow-x-auto only ever overrode
            overflow-x, so with the base overflow-hidden still setting
            overflow-y, touch's own badges would have stayed clipped too
            even after this fix's own [@media(hover:none)]:overflow-x-auto
            override — removing overflow-hidden entirely fixes both at once.

            No more ml-4 sm:ml-6 (2026-08-27, see conversation — the user
            wanted the first tab nudged closer to the card's left edge) —
            every sibling at this level (the breadcrumb above, the avatar
            row above that, and this grid's own left edge) already starts
            flush at the container's own left padding with no extra margin;
            this nav's old ml-4/ml-6 was the one exception, indenting
            "Personal Info" further right than everything around it for no
            documented reason. Removing it makes the tabs consistent with
            every other element on this page, not just "a bit to the left."

            Wrapped in the SAME grid-cols-[minmax(0,1fr)_210px] template the
            card+rail row below uses (2026-08-27, see conversation — bug fix)
            — without this, the nav (a plain block sibling of that grid, not
            itself grid-constrained) was free to grow to its own content's
            width, which happened to stay under the white card's width with
            6 or fewer tabs but visibly overran it once Offboarding became
            the 7th, spilling into the rail's own column space above the
            rail. Reusing the identical template string (not a separately-
            computed width) means the tabs row can never drift out of sync
            with the card's real width again, however many tabs get added
            later. The nav is the grid's only child — auto-placement puts it
            in column 1 (the card's own column), leaving column 2 (the
            rail's width) as blank space, exactly where the rail already
            sits in the row below. */}
        <div className="grid grid-cols-[minmax(0,1fr)_210px] [@media(hover:none)]:grid-cols-1">
          <nav
            aria-label="Employee record categories"
            className={`flex flex-nowrap items-center ${tabSize.gap} mb-0 [@media(hover:none)]:overflow-x-auto min-w-0 w-auto [@media(hover:none)]:w-full bg-transparent rounded-none p-0 [@media(hover:none)]:bg-[#eef3fb] dark:[@media(hover:none)]:bg-slate-800 [@media(hover:none)]:rounded-full [@media(hover:none)]:p-1`}
          >
            {visibleCategories.map((cat) => {
            const isActive = cat.key === currentCategory.key;
            const className = `relative shrink-0 flex items-center gap-1.5 ${tabSize.pad} ${tabSize.text} font-medium transition-colors rounded-t-[10px] border-2 border-b-0 [@media(hover:none)]:rounded-full [@media(hover:none)]:border-0 ${
              isActive
                ? "bg-[#22b8d1] border-[#0e6577] text-white [@media(hover:none)]:bg-[#a9d3f7bd] dark:[@media(hover:none)]:bg-slate-600 [@media(hover:none)]:text-[#004386c9] dark:[@media(hover:none)]:text-slate-100"
                : "bg-[#68d4ffa8] dark:bg-slate-800 border-[#49a2c6] dark:border-slate-600 text-black dark:text-slate-200 hover:bg-[#68d4ff] dark:hover:bg-slate-700 [@media(hover:none)]:bg-transparent [@media(hover:none)]:text-black/65 dark:[@media(hover:none)]:text-slate-400 [@media(hover:none)]:hover:bg-[#dde8f7] dark:[@media(hover:none)]:hover:bg-slate-700"
            }`;
            // A category-level dot (2026-08-26, see conversation) whenever
            // any of its own sections is in dotSectionKeys — no separate
            // per-category prop, derived straight from the same set the
            // rail/sub-tabs below already check. Corner badge, not inline
            // (2026-08-27, see conversation — see cornerDot's own comment).
            const hasDot = Boolean(dotSectionKeys && cat.sections.some((s) => dotSectionKeys.has(s.key)));
            // "client" mode (Pre, 2026-08-26, see conversation) — no real
            // navigation, this page's only URL. Resets clientSection to the
            // new category's own first (visible) section, same as a real
            // navigation's fresh sectionKey would — otherwise a stale
            // sub-tab key from the PREVIOUS category (e.g. "guardian-info")
            // would silently mismatch every section in the new one.
            if (categoryNavigationMode === "client") {
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setActiveCategoryKey(cat.key);
                    setClientSection(cat.sections[0]?.key ?? "");
                    setOpenGroup(null);
                  }}
                  className={className}
                >
                  {cat.label}
                  {cornerDot(hasDot)}
                </button>
              );
            }
            return (
              <Link key={cat.key} href={`${basePath}/${cat.key}`} className={className}>
                {cat.label}
                {cornerDot(hasDot)}
              </Link>
            );
          })}
          </nav>
        </div>

        {/* Touch-only sub-tab row ([@media(hover:none)] — see the cat-tabs
            bar's own comment above for why hover:none rather than a lg:
            width breakpoint; desktop, and any mouse/trackpad-driven browser
            regardless of window width, keeps the vertical rail below
            instead, unchanged). hidden by default (desktop doesn't need
            this row at all — display:none, so every other class here is
            inert until the media query matches); [@media(hover:none)]:flex
            shows it on touch. Same pill vocabulary as the cat-tabs bar
            above; scrolls horizontally rather than wrapping when a category
            has more sections than fit (HR Info's 7, in particular). Own
            mt-2/mb-3 for spacing rather than touching the cat-tabs bar's own
            margin, so desktop's mb-0 (folder tabs flush against the card)
            stays untouched. Guarded on sections.length > 1 per spec ("shown
            only when the selected main tab has sub-sections") — always true
            today (every category has 2+), kept as a real check rather than
            assumed. */}
        {currentCategory.sections.length > 1 &&
          (() => {
            // Renders one leaf pill — shared by the flat top-level sections
            // below AND a group's own children once expanded, so both use
            // identical markup/behavior (2026-08-27, see conversation —
            // ported from StageProfileView.tsx's own mobileRowTwoTopLevel,
            // adapted to this page's dot/clientSection mechanics).
            function leafPill(section: (typeof currentCategory.sections)[number], amber: boolean) {
              const isActive = section.key === currentSection.key;
              const className = `shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                amber
                  ? isActive
                    ? "bg-[#e8a93c] text-white dark:bg-amber-600"
                    : "bg-[#ffe29aa8] text-[#4b4949d6] dark:bg-transparent dark:text-amber-300 hover:brightness-95"
                  : isActive
                    ? "bg-[#a9d3f7bd] dark:bg-slate-600 text-[#004386c9] dark:text-slate-100"
                    : "text-black/65 dark:text-slate-400 hover:bg-[#dde8f7] dark:hover:bg-slate-700"
              }`;
              // dotCategoryOnlyKeys (2026-08-27, see conversation) — an
              // entirely-new-this-stage category's dot stays on its
              // top-level tab only, not repeated on every sub-tab beneath it.
              // Inline, not a corner badge (2026-08-27, see conversation —
              // the corner-badge style is top-level-tabs only; every
              // sub-tab/rail dot, this one included, stays inline next to
              // its label, same as before that change).
              const dot =
                dotSectionKeys?.has(section.key) &&
                !dotCategoryOnlyKeys?.has(currentCategory.key) && <OverdueDot count={1} label="Not filled in yet" />;
              // Rollout categories — client-side tab state, not navigation
              // (see clientSection above); every other category keeps the
              // original route-Link behavior unchanged.
              if (isClientTabCategory) {
                return (
                  <button key={section.key} type="button" onClick={() => setClientSection(section.key)} className={className}>
                    {section.label}
                    {dot}
                  </button>
                );
              }
              return (
                <Link key={section.key} href={`${basePath}/${currentCategory.key}/${section.key}`} className={className}>
                  {section.label}
                  {dot}
                </Link>
              );
            }

            const pills: ReactNode[] = topLevelSections.map((section) => leafPill(section, false));
            for (const group of sectionGroups) {
              const groupSections = currentCategory.sections.filter((s) => s.group === group);
              const isGroupActive = groupSections.some((s) => s.key === currentSection.key);
              const isOpen = openGroup === group;
              const groupDot =
                dotSectionKeys &&
                groupSections.some((s) => dotSectionKeys.has(s.key)) &&
                !dotCategoryOnlyKeys?.has(currentCategory.key) && <OverdueDot count={1} label="Not filled in yet" />;
              pills.push(
                <button
                  key={group}
                  type="button"
                  onClick={() => setOpenGroup((g) => (g === group ? null : group))}
                  aria-expanded={isOpen}
                  className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                    isGroupActive
                      ? "bg-[#a9d3f7bd] dark:bg-slate-600 text-[#004386c9] dark:text-slate-100"
                      : "text-black/65 dark:text-slate-400 hover:bg-[#dde8f7] dark:hover:bg-slate-700"
                  }`}
                >
                  {group}
                  {groupDot}
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>,
              );
              // Splice this group's own children in right here — immediately
              // after its toggle pill, in the same flat row — only while open.
              if (isOpen) {
                for (const section of groupSections) pills.push(leafPill(section, true));
              }
            }

            return (
              <nav
                aria-label={`${currentCategory.label} sections`}
                className="hidden [@media(hover:none)]:flex flex-nowrap items-center gap-1 mt-2 mb-3 overflow-x-auto bg-[#eef3fb] dark:bg-slate-800 rounded-full p-1"
              >
                {pills}
              </nav>
            );
          })()}

        {/* Card + vertical sub-nav rail as grid siblings, docked under the
            cat-tabs bar — same side-by-side structure as desktop at every
            breakpoint (never stacks). Card column is minmax(0, 1fr) — it
            fills the rest of the row beside the fixed 210px rail, not a
            separate/independent width (2026-08-22, see conversation — width
            is settled, do not change it further). Grid (not flex) so
            that's a hard cap regardless of content, unlike flex-basis,
            which let a wide table push the card past its intended share.
            No `items-start` (2026-08-22) — default grid stretch instead,
            so on a short tab like Leave the card's white background grows
            to match the taller rail's height rather than the rail's lower
            pills hanging past the card's bottom edge into the page
            background. No gap between them — the rail sits flush against
            the card's right edge; same layout shape used in
            StageProfileView.tsx's own separate copy. Single column on
            touch devices, matching the rail's own [@media(hover:none)]:hidden
            below (mobile has no rail to reserve space for). */}
        <div className="grid grid-cols-[minmax(0,1fr)_210px] [@media(hover:none)]:grid-cols-1">
          <div
            className="min-w-0 bg-white dark:bg-slate-900 rounded-b-[12px] rounded-tr-[12px] shadow-[0_2px_6px_rgba(0,0,0,0.12),0_8px_20px_rgba(0,0,0,0.10)] p-4 sm:p-6"
            style={{ border: "0.5px solid var(--border-neutral)" }}
          >
            {(() => {
              const lookupKey = `${currentCategory.key}/${sectionKey}`;
              const StaticPanel = EMPLOYEE_RECORD_STATIC_PANELS[lookupKey];
              // Personal Info pilot — all 4 sub-panels render together (only
              // the ones currentCategory.sections actually lists, 2026-08-26,
              // see conversation — visibleSectionKeys already filtered this
              // for embedded usage like Pre), wrapped in one PageEditProvider
              // (see PageEditMode.tsx), each hidden via CSS rather than
              // unmounted so an edit in progress on one survives switching to
              // another (clientSection above). Guardian Info has no
              // equivalent on the stage-profile flow, but
              // PersonalInfoPanel/EmergencyContactPanel are shared with it
              // (e.g. Pre stage's own Personal Info tab) — those render
              // standalone there, with no PageEditProvider above them, so
              // this pilot doesn't affect that usage at all.
              if (currentCategory.key === "personal-info" && employeeDetail) {
                const piSections = new Set(currentCategory.sections.map((s) => s.key));
                if (
                  (!piSections.has("guardian-info") || guardianInfo !== undefined) &&
                  (!piSections.has("payment") || paymentInfo !== undefined)
                ) {
                  return (
                    <PageEditProvider>
                      <PageEditMessageDialog />
                      <div className="mb-4 flex justify-end">
                        <PageEditToggleButton />
                      </div>
                      {piSections.has("personal-info") && (
                        <div className={currentSection.key === "personal-info" ? "" : "hidden"}>
                          <PersonalInfoPanel employee={employeeDetail} employeeId={employeeId} canEdit={canEdit} />
                        </div>
                      )}
                      {piSections.has("guardian-info") && guardianInfo !== undefined && (
                        <div className={currentSection.key === "guardian-info" ? "" : "hidden"}>
                          <GuardianInfoPanel userId={employeeId} data={guardianInfo} canEdit={canEdit} />
                        </div>
                      )}
                      {piSections.has("payment") && paymentInfo !== undefined && (
                        <div className={currentSection.key === "payment" ? "" : "hidden"}>
                          <PaymentInfoPanel employee={employeeDetail} employeeId={employeeId} data={paymentInfo} canEdit={canEdit} />
                        </div>
                      )}
                      {piSections.has("emergency-contact") && (
                        <div className={currentSection.key === "emergency-contact" ? "" : "hidden"}>
                          <EmergencyContactPanel
                            employee={employeeDetail}
                            onSave={(data) => updateEmergencyContact(employeeId, data)}
                            canEdit={canEdit}
                          />
                        </div>
                      )}
                    </PageEditProvider>
                  );
                }
              }
              // HR Info rollout Batch 2 (2026-08-13, see conversation) — same
              // shape as Personal Info above: only the sub-panels
              // currentCategory.sections actually lists render together
              // (2026-08-26, see conversation — full 7 for the real
              // /employee-record/[id] page, a narrower set for embedded usage
              // like Pre's HR Info), under one PageEditProvider, hidden via
              // CSS. Offer Letter (OfferLetterPanel) is real now too
              // (2026-08-26, see conversation — previously
              // hasRealBacking={false}, mock fields only) — same
              // employment.offer_letter_file_id/RealFileField convention as
              // Resume/CV, own sectionLabel="Offer Letter", registers and
              // saves like every other real panel here now. Hiring Notes
              // shares InterviewAssessmentPanel with Pre stage's own
              // Interview Assessment tab (fixed 2026-08-13, see conversation
              // — was a disconnected mock with no real backing at all, so
              // Pre-stage-entered data never showed up here) — real
              // sectionLabel="Hiring Notes", registers and saves like any
              // other real panel now. Resume/CV, Reference, Medical Check are
              // shared with the Pre stage flow (see ActiveProfilePanels.tsx)
              // and already got sectionLabel there in Batch 1 — reused as-is
              // here.
              if (currentCategory.key === "hr-info" && employeeDetail) {
                const hrSections = new Set(currentCategory.sections.map((s) => s.key));
                if (
                  (!hrSections.has("resume") || resumeInfo !== undefined) &&
                  (!hrSections.has("hiring-notes") || interviewAssessment !== undefined) &&
                  (!hrSections.has("reference") || referenceCheck !== undefined) &&
                  (!hrSections.has("medical-check") || medicalCheck !== undefined) &&
                  (!hrSections.has("probation") || (probationInfo !== undefined && probationDisplay)) &&
                  (!hrSections.has("nda-nc") || (ndaInfo !== undefined && nonCompeteInfo !== undefined)) &&
                  (!hrSections.has("handbook") || documentsInfo !== undefined)
                ) {
                  return (
                  <PageEditProvider>
                    <PageEditMessageDialog />
                    <div className="mb-4 flex justify-end">
                      <PageEditToggleButton />
                    </div>
                    {hrSections.has("resume") && (
                      <div className={currentSection.key === "resume" ? "" : "hidden"}>
                        <ResumePanel
                          userId={employeeId}
                          resumeFileId={resumeInfo?.resumeFileId ?? null}
                          cvFileId={resumeInfo?.cvFileId ?? null}
                          canEdit={canEdit}
                        />
                      </div>
                    )}
                    {hrSections.has("offer-letter") && (
                      <div className={currentSection.key === "offer-letter" ? "" : "hidden"}>
                        <OfferLetterPanel employeeId={employeeId} offerLetterFileId={employeeDetail.offerLetterFileId} canEdit={canEdit} />
                      </div>
                    )}
                    {hrSections.has("hiring-notes") && interviewAssessment !== undefined && (
                      <div className={currentSection.key === "hiring-notes" ? "" : "hidden"}>
                        <InterviewAssessmentPanel
                          userId={employeeId}
                          data={interviewAssessment}
                          heading="Hiring Notes"
                          canEdit={canEdit}
                        />
                      </div>
                    )}
                    {hrSections.has("reference") && referenceCheck !== undefined && (
                      <div className={currentSection.key === "reference" ? "" : "hidden"}>
                        <ReferenceCheckPanel userId={employeeId} data={referenceCheck} canEdit={canEdit} />
                      </div>
                    )}
                    {hrSections.has("medical-check") && medicalCheck !== undefined && (
                      <div className={currentSection.key === "medical-check" ? "" : "hidden"}>
                        <MedicalCheckPanel userId={employeeId} data={medicalCheck} canEdit={canEdit} />
                      </div>
                    )}
                    {hrSections.has("probation") && probationInfo !== undefined && probationDisplay && (
                      <div className={currentSection.key === "probation" ? "" : "hidden"}>
                        <ProbationPanel
                          userId={employeeId}
                          data={probationInfo}
                          display={probationDisplay}
                          canDecide={canDecideProbation ?? false}
                          canEdit={canEdit}
                        />
                      </div>
                    )}
                    {hrSections.has("nda-nc") && ndaInfo !== undefined && nonCompeteInfo !== undefined && (
                      <div className={currentSection.key === "nda-nc" ? "" : "hidden"}>
                        <NdaNcPanel userId={employeeId} ndaData={ndaInfo} nonCompeteData={nonCompeteInfo} canEdit={canEdit} />
                      </div>
                    )}
                    {hrSections.has("handbook") && documentsInfo !== undefined && (
                      <div className={currentSection.key === "handbook" ? "" : "hidden"}>
                        {/* showEmploymentContract omitted (defaults true,
                            2026-08-26, see conversation) — this tab now shows
                            both Employment Contract and Employee Handbook
                            Acknowledge, same as Onboarding's own "Documents"
                            tab already does (StageProfileView.tsx never
                            passed showEmploymentContract=false), under the
                            "Documents" heading DocumentsPanel already shows
                            whenever this prop is true. */}
                        <DocumentsPanel
                          userId={employeeId}
                          data={documentsInfo}
                          canEdit={canEdit}
                        />
                      </div>
                    )}
                  </PageEditProvider>
                  );
                }
              }
              // Finance rollout Batch 3 (2026-08-13, see conversation) — same
              // shape as Personal Info/HR Info above: only the sub-panels
              // currentCategory.sections actually lists render together
              // (2026-08-26, see conversation — full 2 for the real
              // /employee-record/[id] page, just Tax Info for Onboarding's
              // embedded usage, which has no salary_revision/payslip data
              // yet), under one PageEditProvider, hidden via CSS.
              if (currentCategory.key === "finance" && employeeDetail) {
                const financeSections = new Set(currentCategory.sections.map((s) => s.key));
                if (
                  (!financeSections.has("payroll") ||
                    (salaryRevisions !== undefined && payslip !== undefined && payslipHistory !== undefined)) &&
                  (!financeSections.has("tax-info") || payrollInfo !== undefined)
                ) {
                  return (
                    <PageEditProvider>
                      <PageEditMessageDialog />
                      <div className="mb-4 flex justify-end">
                        <PageEditToggleButton />
                      </div>
                      {financeSections.has("payroll") &&
                        salaryRevisions !== undefined &&
                        payslip !== undefined &&
                        payslipHistory !== undefined && (
                          <div className={currentSection.key === "payroll" ? "" : "hidden"}>
                            <PayrollPanel
                              employeeId={employeeId}
                              salaryRevisions={salaryRevisions}
                              payslip={payslip}
                              payslipHistory={payslipHistory}
                              canEdit={canEdit}
                            />
                          </div>
                        )}
                      {financeSections.has("tax-info") && payrollInfo !== undefined && (
                        <div className={currentSection.key === "tax-info" ? "" : "hidden"}>
                          <OnboardingPayrollPanel
                            userId={employeeId}
                            data={payrollInfo}
                            employeeDetail={employeeDetail}
                            heading="Tax Info"
                            showBankDetails={false}
                            canEdit={canEdit}
                          />
                        </div>
                      )}
                    </PageEditProvider>
                  );
                }
              }
              // Active Employment rollout Batch 7 (2026-08-13, see
              // conversation) — same shape as Finance above, but only
              // Performance Review is actually EditableSection-backed and
              // registers with the provider (sectionLabel="Performance
              // Review"). Leave is read-only (no Edit/Save concept at all);
              // Training/Promotion/Transfer/Cert are the same
              // RepeatableRecordSection panels excluded from this whole
              // rollout (their outer EditableSection has no onSave — real
              // saves already happen atomically per-row via their own
              // "+ Add" modal). They still render here, CSS-hidden like every
              // other tab, so switching to/from them no longer loses an
              // in-progress "+ Add" draft, but they don't participate in the
              // page-level Save since there's nothing pending for it to
              // commit. Disciplinary is deliberately NOT wrapped this way —
              // see CLIENT_TAB_CATEGORIES' own comment.
              if (
                currentCategory.key === "active-employment" &&
                leaveHistory !== undefined &&
                performanceReview !== undefined &&
                trainings !== undefined &&
                promotions !== undefined &&
                transfers !== undefined &&
                achievements !== undefined
              ) {
                return (
                  <PageEditProvider>
                    <PageEditMessageDialog />
                    {/* Leave has no Edit/Save concept at all (see conversation)
                        -- hide the shared toggle while that sub-tab is showing,
                        even though the other tabs in this batch still use it. */}
                    {clientSection !== "leave" && (
                      <div className="mb-4 flex justify-end">
                        <PageEditToggleButton />
                      </div>
                    )}
                    <div className={currentSection.key === "leave" ? "" : "hidden"}>
                      <LeavePanel rows={leaveHistory} />
                    </div>
                    <div className={currentSection.key === "performance-review" ? "" : "hidden"}>
                      <PerformanceReviewPanel userId={employeeId} data={performanceReview} canEdit={canEdit} />
                    </div>
                    <div className={currentSection.key === "training" ? "" : "hidden"}>
                      <TrainingPanel userId={employeeId} data={trainings} canEdit={canEdit} />
                    </div>
                    <div className={currentSection.key === "promotion" ? "" : "hidden"}>
                      <PromotionPanel userId={employeeId} data={promotions} currentPosition={position} canEdit={canEdit} />
                    </div>
                    <div className={currentSection.key === "transfer" ? "" : "hidden"}>
                      <TransferPanel
                        userId={employeeId}
                        data={transfers}
                        branches={branches ?? []}
                        departments={departments ?? []}
                        currentLocation={departmentName ?? branchName}
                        canEdit={canEdit}
                      />
                    </div>
                    <div className={currentSection.key === "cert" ? "" : "hidden"}>
                      <AchievementPanel userId={employeeId} data={achievements} canEdit={canEdit} />
                    </div>
                  </PageEditProvider>
                );
              }
              // Offboarding (2026-08-27, see conversation) — Exit's own 7
              // tabs, same shape as HR Info/Finance/Active Employment above:
              // all 7 render together under one PageEditProvider (every one
              // of Resignation/Reference Letter/Exit Interview Notes/the 3
              // Clearance checklists/Financial Settlement is individually
              // EditableSection-wrapped in ActiveProfilePanels.tsx, unlike
              // Disciplinary/Task's un-wrapped panels below), hidden via CSS.
              // No employeeDetail gate needed — none of these 7 panels read it.
              if (
                currentCategory.key === "offboarding" &&
                resignationInfo !== undefined &&
                referenceLetterInfo !== undefined &&
                exitInterviewNoteInfo !== undefined &&
                knowledgeTransferChecklist !== undefined &&
                assetRecoveryChecklist !== undefined &&
                systemRevocationChecklist !== undefined &&
                financialSettlement !== undefined
              ) {
                return (
                  <PageEditProvider>
                    <PageEditMessageDialog />
                    <div className="mb-4 flex justify-end">
                      <PageEditToggleButton />
                    </div>
                    <div className={currentSection.key === "resignation" ? "" : "hidden"}>
                      <ResignationPanel userId={employeeId} data={resignationInfo} canEdit={canEdit} />
                    </div>
                    <div className={currentSection.key === "reference-letter" ? "" : "hidden"}>
                      <ReferenceLetterPanel userId={employeeId} data={referenceLetterInfo} canEdit={canEdit} />
                    </div>
                    <div className={currentSection.key === "exit-interview-notes" ? "" : "hidden"}>
                      <ExitInterviewNotesPanel userId={employeeId} data={exitInterviewNoteInfo} canEdit={canEdit} />
                    </div>
                    <div className={currentSection.key === "knowledge-transfer" ? "" : "hidden"}>
                      <KnowledgeTransferPanel
                        userId={employeeId}
                        items={knowledgeTransferChecklist}
                        canAddItem={canAddChecklistItem ?? false}
                        canEdit={canEdit}
                      />
                    </div>
                    <div className={currentSection.key === "asset-recovery" ? "" : "hidden"}>
                      <AssetRecoveryPanel
                        userId={employeeId}
                        items={assetRecoveryChecklist}
                        canAddItem={canAddChecklistItem ?? false}
                        canEdit={canEdit}
                      />
                    </div>
                    <div className={currentSection.key === "system-revocation" ? "" : "hidden"}>
                      <SystemRevocationPanel
                        userId={employeeId}
                        items={systemRevocationChecklist}
                        canAddItem={canAddChecklistItem ?? false}
                        canEdit={canEdit}
                      />
                    </div>
                    <div className={currentSection.key === "financial-settlement" ? "" : "hidden"}>
                      <FinancialSettlementPanel userId={employeeId} data={financialSettlement} canEdit={canEdit} />
                    </div>
                  </PageEditProvider>
                );
              }
              // currentSection.key, not the raw sectionKey prop — disciplinary
              // is now a CLIENT_TAB_CATEGORIES member (2026-08-26, see
              // conversation), so its current sub-tab is tracked by
              // clientSection state, not a fresh sectionKey per navigation;
              // currentSection.key already resolves to whichever of the two
              // applies (see its own derivation above).
              if (currentCategory.key === "disciplinary" && currentSection.key === "domestic-inquiry" && domesticInquiries !== undefined)
                return <DomesticInquiryPanel userId={employeeId} data={domesticInquiries} canEdit={canEdit} />;
              if (currentCategory.key === "disciplinary" && currentSection.key === "suspension" && suspensionLetters !== undefined)
                return <SuspensionPanel userId={employeeId} data={suspensionLetters} canEdit={canEdit} />;
              if (currentCategory.key === "disciplinary" && currentSection.key === "showcause" && showcauseWarningLetters !== undefined)
                return <ShowcausePanel userId={employeeId} data={showcauseWarningLetters} canEdit={canEdit} />;
              if (currentCategory.key === "disciplinary" && currentSection.key === "pip" && pips !== undefined)
                return <PipPanel userId={employeeId} data={pips} canEdit={canEdit} />;
              // currentSection.key, not the raw sectionKey prop — same
              // reasoning as Disciplinary's own identical fix above (Task is
              // now a CLIENT_TAB_CATEGORIES member too).
              if (currentCategory.key === "task" && currentSection.key === "pending" && tasks !== undefined)
                return <TaskPendingPanel tasks={tasks.pending} />;
              if (currentCategory.key === "task" && currentSection.key === "overdue" && tasks !== undefined)
                return <TaskOverduePanel tasks={tasks.overdue} />;
              if (StaticPanel) return <StaticPanel canEdit={canEdit} />;
              return (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-6 py-10 text-center">
                  <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
                    {currentCategory.label} — {currentSection.label}
                  </p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    This section&apos;s fields aren&apos;t wired up yet. Navigation and layout match the reference; the form content
                    is pending a scoping decision.
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Desktop/mouse-driven-browser-only — [@media(hover:none)]:hidden
              (see the cat-tabs bar's own comment for why hover:none rather
              than a lg: width breakpoint). On any real touch device
              (phone/tablet, any size/orientation, including iPad Pro
              landscape) the mobile sub-tab row above replaces this
              entirely, per explicit request — the vertical rail shouldn't
              exist in that position there at all, not just visually adapt.
              Width itself now comes from the grid column (see the row div
              above) rather than an explicit w-[210px] here, so the two stay
              tied to the same single value instead of drifting apart.
              min-w-0 (2026-08-25, see conversation) — as a grid item, this
              nav's default min-width:auto let a long wrapped label
              ("Showcause / Warning Letter", "Performance Improvement Plan")
              force the fixed-210px column wider than intended; min-w-0 caps
              it back to the column's actual size so every pill wraps within
              a consistent width instead of stretching the rail. */}
          <nav
            aria-label={`${currentCategory.label} sections`}
            className="flex flex-col min-w-0 mt-4 sm:mt-6 [@media(hover:none)]:hidden"
            style={{ gap: RAIL_GAP_PX }}
          >
            {topLevelSections.map((section) => {
              const isActive = section.key === currentSection.key;
              // Same size as StageProfileView.tsx's own rail pills (shared
              // RAIL_PILL_PADDING_CLASS/RAIL_PILL_FONT_SIZE_CLASS constants,
              // see stageProfileConfig.ts) — only the colors differ here.
              const className = `w-full text-left box-border rounded-r-[20px] border-2 font-semibold leading-tight transition-colors ${RAIL_PILL_PADDING_CLASS} ${RAIL_PILL_FONT_SIZE_CLASS} ${
                isActive ? RAIL_CURRENT : `${RAIL_BASE} hover:brightness-95`
              }`;
              // Inline, not a corner badge (2026-08-27, see conversation —
              // the corner-badge style is top-level-tabs only; this rail's
              // dot stays inline next to its label, same as before).
              const label = (
                <span className="inline-flex items-center gap-1.5">
                  {section.label}
                  {dotSectionKeys?.has(section.key) &&
                    !dotCategoryOnlyKeys?.has(currentCategory.key) && <OverdueDot count={1} label="Not filled in yet" />}
                </span>
              );
              // Rollout categories — see the mobile nav's own comment above.
              if (isClientTabCategory) {
                return (
                  <button key={section.key} type="button" onClick={() => setClientSection(section.key)} className={className}>
                    {label}
                  </button>
                );
              }
              return (
                <Link key={section.key} href={`${basePath}/${currentCategory.key}/${section.key}`} className={className}>
                  {label}
                </Link>
              );
            })}

            {/* Nested groups (2026-08-27, see conversation) — ported from
                StageProfileView.tsx's own navSections group-toggle-pill
                renderer (same one-toggle-pill-per-group shape, RAIL_CLEARANCE_
                BASE/CURRENT matching its exact Exit navRail.clearanceBase/
                clearanceCurrent literals). Only Offboarding's "Clearance"
                uses this today; sectionGroups is empty for every other
                category, so this renders nothing there. */}
            {sectionGroups.map((group) => {
              const groupSections = currentCategory.sections.filter((s) => s.group === group);
              const isGroupActive = groupSections.some((s) => s.key === currentSection.key);
              const isOpen = openGroup === group || isGroupActive;
              // Inline, not a corner badge (2026-08-27, see conversation —
              // corner badges are top-level-tabs only).
              const groupDot =
                dotSectionKeys &&
                groupSections.some((s) => dotSectionKeys.has(s.key)) &&
                !dotCategoryOnlyKeys?.has(currentCategory.key) && <OverdueDot count={1} label="Not filled in yet" />;
              return (
                <div key={group} className="flex flex-col" style={{ gap: RAIL_GAP_PX }}>
                  <button
                    type="button"
                    onClick={() => setOpenGroup((g) => (g === group ? null : group))}
                    aria-expanded={isOpen}
                    className={`w-full flex items-center justify-between box-border rounded-r-[20px] border-2 font-semibold leading-tight transition-colors ${RAIL_PILL_PADDING_CLASS} ${RAIL_PILL_FONT_SIZE_CLASS} ${
                      isGroupActive ? RAIL_CURRENT : `${RAIL_BASE} hover:brightness-95`
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {group}
                      {groupDot}
                    </span>
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <div className="flex flex-col" style={{ gap: RAIL_GAP_PX }}>
                      {groupSections.map((section) => {
                        const isCurrent = section.key === currentSection.key;
                        const className = `w-full box-border rounded-r-[20px] border-2 font-semibold leading-tight transition-colors ${RAIL_PILL_PADDING_CLASS} ${RAIL_PILL_FONT_SIZE_CLASS} ${
                          isCurrent ? RAIL_CLEARANCE_CURRENT : `${RAIL_CLEARANCE_BASE} hover:brightness-95`
                        }`;
                        const label = (
                          <span className="inline-flex items-center gap-1.5">
                            {section.label}
                            {dotSectionKeys?.has(section.key) &&
                              !dotCategoryOnlyKeys?.has(currentCategory.key) && <OverdueDot count={1} label="Not filled in yet" />}
                          </span>
                        );
                        if (isClientTabCategory) {
                          return (
                            <button key={section.key} type="button" onClick={() => setClientSection(section.key)} className={className}>
                              {label}
                            </button>
                          );
                        }
                        return (
                          <Link key={section.key} href={`${basePath}/${currentCategory.key}/${section.key}`} className={className}>
                            {label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}

const PAYMENT_METHOD_OPTIONS = [
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cheque", label: "Cheque" },
  { value: "Cash", label: "Cash" },
];
const PAYMENT_FREQUENCY_OPTIONS = [
  { value: "Monthly", label: "Monthly" },
  { value: "Bi-weekly", label: "Bi-weekly" },
  { value: "Weekly", label: "Weekly" },
];

// Matches pinfo_payment.html's exact layout: "Bank Details" subsection (Bank
// Name, Account Holder, Account Number — real bank_details columns) +
// "Payment" subsection (Payment Method, Payment Frequency, Pay Date,
// Remarks — real payment_info columns now, deliberately separate from
// bank_details). One Edit/Save button for the whole tab, same as
// PayrollPanel — both real tables saved together.
function PaymentInfoPanel({
  employee,
  employeeId,
  data,
  canEdit = true,
}: {
  employee: EmployeeDetailFull;
  employeeId: number;
  data: PaymentInfoData | null;
  canEdit?: boolean;
}) {
  const [bankName, setBankName] = useState(employee.bankName ?? "");
  const [accountName, setAccountName] = useState(employee.accountName ?? "");
  const [bankAccount, setBankAccount] = useState(employee.bankAccount ?? "");
  const [paymentMethod, setPaymentMethod] = useState(data?.paymentMethod ?? "");
  const [paymentFrequency, setPaymentFrequency] = useState(data?.paymentFrequency ?? "");
  const [payDate, setPayDate] = useState(data?.payDate ?? "");
  const [remark, setRemark] = useState(data?.remark ?? "");

  // Catches a pre-existing saved value that contains non-digit characters
  // (entered before this restriction existed) and was never retyped this
  // session — the live keystroke filter below only strips characters as the
  // user types, so it can't fix a stale value nobody touched.
  function validate(): ValidationResult {
    if (bankAccount && !/^\d+$/.test(bankAccount)) {
      return { valid: false, error: "Account Number must contain digits only." };
    }
    return { valid: true };
  }

  async function handleSave() {
    const [bankResult, paymentResult] = await Promise.all([
      updateBankDetails(employeeId, { bankName, accountName, bankAccount }),
      updatePaymentInfo(employeeId, { paymentMethod, paymentFrequency, payDate, remark }),
    ]);
    if (bankResult && bankResult.ok === false) return bankResult;
    if (paymentResult && paymentResult.ok === false) return paymentResult;
    return { ok: true };
  }

  return (
    <EditableSection onSave={handleSave} validate={validate} canEdit={canEdit} sectionLabel="Payment & Bank Info">
      <PanelHeading>Payment &amp; Bank Info</PanelHeading>
      <Subsection heading="Bank Details">
        <EditableField label="Bank Name" value={bankName} onChange={setBankName} />
        <EditableField label="Account Holder" value={accountName} onChange={setAccountName} />
        {/* Digits only, filtered live as typed — same pattern PhoneField
            already uses for phone digits (see ActiveProfilePanels.tsx).
            validate() above still catches a pre-existing non-digit value
            that was never retyped. */}
        <EditableField
          label="Account Number"
          value={bankAccount}
          onChange={(v) => setBankAccount(v.replace(/\D/g, ""))}
          full
        />
      </Subsection>
      <Subsection heading="Payment">
        <EditableSelectField label="Payment Method" value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHOD_OPTIONS} />
        <EditableSelectField
          label="Payment Frequency"
          value={paymentFrequency}
          onChange={setPaymentFrequency}
          options={PAYMENT_FREQUENCY_OPTIONS}
        />
        <EditableField label="Pay Date" value={payDate} onChange={setPayDate} type="date" />
        <EditableField label="Remarks" value={remark} onChange={setRemark} full />
      </Subsection>
    </EditableSection>
  );
}

function LeavePanel({ rows }: { rows: LeaveHistoryRow[] }) {
  // View-only tab (see conversation) -- no Edit button, no add/delete; a
  // clicked row just opens LEAVE_DETAIL_FIELDS in RecordAddModal's
  // startReadOnly + canEdit={false} mode for a clean read-only detail view.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selected = selectedIndex !== null ? rows[selectedIndex] : null;

  return (
    <div>
      <PanelHeading>Leave</PanelHeading>
      <RecordTable
        columns={[
          { key: "type", label: "Leave Type" },
          { key: "dates", label: "Date" },
          { key: "days", label: "Duration" },
          { key: "reason", label: "Reason" },
          { key: "status", label: "Status" },
          { key: "attachment", label: "Attachment" },
        ]}
        rows={rows.map((r) => ({
          type: r.leaveTypeName,
          dates: r.startDate === r.endDate ? r.startDate : `${r.startDate} – ${r.endDate}`,
          days: `${r.totalDays} Day${r.totalDays === "1" ? "" : "s"}`,
          reason: r.reason ?? "—",
          status: <span className="capitalize">{r.status}</span>,
          attachment: <RealAttachmentLink fileId={r.attachment} />,
        }))}
        onRowClick={(index) => setSelectedIndex(index)}
      />
      {selected && (
        <RecordAddModal
          title="Leave Record"
          fields={LEAVE_DETAIL_FIELDS}
          saving={false}
          error={null}
          initialValues={{
            type: selected.leaveTypeName,
            dates: selected.startDate === selected.endDate ? selected.startDate : `${selected.startDate} – ${selected.endDate}`,
            days: `${selected.totalDays} Day${selected.totalDays === "1" ? "" : "s"}`,
            reason: selected.reason ?? "",
            status: selected.status.charAt(0).toUpperCase() + selected.status.slice(1),
          }}
          initialFileIds={{ attachment: selected.attachment }}
          startReadOnly
          canEdit={false}
          showFooter={false}
          onClose={() => setSelectedIndex(null)}
          onSave={() => {}}
        />
      )}
    </div>
  );
}
