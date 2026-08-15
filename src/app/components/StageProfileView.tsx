"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Home } from "lucide-react";
import { initialsFromName } from "@/lib/text";
import { parsePhoneValue, composePhoneValue } from "@/lib/phoneEmail";
import { STAGE_LABELS, STAGE_PILL_CLASSES, positionGroup, type EmployeeStage } from "@/lib/employeeStages";
import {
  STAGE_PROFILE_CONFIG,
  STAGE_HISTORY_GROUPS,
  STAGE_PROCEED_BUTTON,
  STAGE_HISTORY_TAB_STYLE,
  HISTORY_TAB_LABEL,
  profileUrlForStage,
  type ProfileSection,
} from "@/lib/stageProfileConfig";
import type {
  LeaveHistoryRow,
  EmployeeDetailFull,
  BranchOpt,
  DepartmentOpt,
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
  DisciplinarySummaryRow,
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
import type { ProbationDisplayInfo } from "@/lib/probationDecision";
import {
  PanelHeading,
  RecordTable,
  SidebarField,
  EmergencyContactPanel,
  PersonalInfoPanel,
  ResumePanel,
  InterviewAssessmentPanel,
  ReferenceCheckPanel,
  MedicalCheckPanel,
  ProbationPanel,
  DocumentsPanel,
  OnboardingPayrollPanel,
  AchievementPanel,
  SalaryRevisionPanel,
  PromotionPanel,
  TransferPanel,
  TrainingPanel,
  NdaPanel,
  NonCompetePanel,
  DisciplinarySummaryPanel,
  RealAttachmentLink,
  ResignationPanel,
  ReferenceLetterPanel,
  ExitInterviewNotesPanel,
  KnowledgeTransferPanel,
  AssetRecoveryPanel,
  SystemRevocationPanel,
  FinancialSettlementPanel,
} from "@/app/components/ActiveProfilePanels";
import { PageEditProvider, PageEditToggleButton, PageEditMessageDialog } from "@/app/components/PageEditMode";
import { STAGE_CONTENT_PANELS } from "@/app/components/StageHistoryPanels";
import {
  updateEmergencyContact,
  proceedFromPreStage,
  proceedFromOnboarding,
  proceedFromActive,
} from "@/lib/employeeRecordActions";
import ConfirmDialog from "@/app/components/ConfirmDialog";

interface Props {
  stage: EmployeeStage;
  employeeId: number;
  employeeName: string;
  /** null for in-page-tabs stages (Pre/Probation) — those default to the first section client-side. */
  activeSection: string | null;
  /** Real data for the sections with schema backing so far — undefined everywhere else. */
  leaveHistory?: LeaveHistoryRow[];
  employeeDetail?: EmployeeDetailFull | null;
  resumeInfo?: ResumeInfo | null;
  interviewAssessment?: InterviewAssessmentInfo | null;
  referenceCheck?: ReferenceCheckInfo | null;
  medicalCheck?: MedicalCheckInfo | null;
  probationInfo?: ProbationInfo | null;
  /** BranchStaff/career_applications-derived Start Date/End Date/Feedback/
   *  display status (see probationDecision.ts) — undefined only when this
   *  isn't the Probation section (mirrors probationInfo's own gating). */
  probationDisplay?: ProbationDisplayInfo;
  /** HR/Superadmin only, per explicit decision (see conversation) — gates
   *  the Confirm/Extend/Stop buttons; decideProbationOutcome re-checks this
   *  server-side regardless. */
  canDecideProbation?: boolean;
  /** false when the viewer is a CEO looking at someone else's profile —
   *  hides every panel's Edit/Save toggle (server-side already blocks the
   *  write regardless, via requireNotCeoUnlessOwnProfile in
   *  employeeRecordActions.ts; this just avoids a dead button). Defaults
   *  true so every other caller keeps its current behavior unchanged. */
  canEdit?: boolean;
  documentsInfo?: DocumentsInfo | null;
  payrollInfo?: PayrollInfo | null;
  achievements?: AchievementEntry[];
  salaryRevisions?: SalaryRevisionEntry[];
  promotions?: PromotionEntry[];
  transfers?: TransferEntry[];
  trainings?: TrainingEntry[];
  ndaInfo?: NdaInfo | null;
  nonCompeteInfo?: NonCompeteInfo | null;
  disciplinarySummary?: DisciplinarySummaryRow[];
  /** Raw per-type rows behind disciplinarySummary — only fetched alongside
   *  it (2026-08-13, see conversation) so clicking a summary row can open
   *  that record's own real edit modal (DisciplinarySummaryPanel). */
  domesticInquiries?: DomesticInquiryEntry[];
  suspensionLetters?: SuspensionLetterEntry[];
  showcauseWarningLetters?: ShowcauseWarningLetterEntry[];
  pips?: PipEntry[];
  resignationInfo?: ResignationInfo | null;
  referenceLetterInfo?: ReferenceLetterInfo | null;
  exitInterviewNoteInfo?: ExitInterviewNoteInfo | null;
  /** Exit's 4 Clearance sub-tabs — undefined outside Exit, same gating as
   *  resignationInfo/etc above. canAddChecklistItem is resolved server-side
   *  from the session role (HR/Superadmin only), same pattern as
   *  canDecideProbation. */
  knowledgeTransferChecklist?: ExitChecklistItem[];
  assetRecoveryChecklist?: ExitChecklistItem[];
  systemRevocationChecklist?: ExitChecklistItem[];
  financialSettlement?: FinancialSettlementInfo | null;
  canAddChecklistItem?: boolean;
  /** Combined Branch/Department option lists for Transfer's From/To dropdowns. */
  branches?: BranchOpt[];
  departments?: DepartmentOpt[];
  /** Which branch/dept-scoped namelist this employee was opened from — null
   *  for Pre/Probation (no location layer) or when opened without that
   *  context. Drives the breadcrumb's dynamic branch/dept segment, mirroring
   *  js/profile-breadcrumb.js's own "Employee Overview > Stage > Branch/Dept
   *  > Profile" pattern. */
  locationGroup?: "branch" | "department" | null;
  locationCode?: string | null;
  locationName?: string | null;
}

// Which prior-stage section (if any) is currently being viewed instead of the
// current stage's own section — cleared whenever the current stage's own nav
// changes (its own Link navigation/tab click always means "leave history mode").
interface HistorySelection {
  stage: EmployeeStage;
  section: ProfileSection;
}

export default function StageProfileView({
  stage,
  employeeId,
  employeeName,
  activeSection,
  leaveHistory,
  employeeDetail,
  resumeInfo,
  interviewAssessment,
  referenceCheck,
  medicalCheck,
  probationInfo,
  probationDisplay,
  canDecideProbation,
  canEdit,
  documentsInfo,
  payrollInfo,
  achievements,
  salaryRevisions,
  promotions,
  transfers,
  trainings,
  ndaInfo,
  nonCompeteInfo,
  disciplinarySummary,
  domesticInquiries,
  suspensionLetters,
  showcauseWarningLetters,
  pips,
  resignationInfo,
  referenceLetterInfo,
  exitInterviewNoteInfo,
  knowledgeTransferChecklist,
  assetRecoveryChecklist,
  systemRevocationChecklist,
  financialSettlement,
  canAddChecklistItem,
  branches,
  departments,
  locationGroup,
  locationCode,
  locationName,
}: Props) {
  const config = STAGE_PROFILE_CONFIG[stage];
  // PageEditProvider rollout (2026-08-13, see conversation) — Onboarding's
  // own top-level tabs switch via this same client-side state as Pre/
  // Probation's in-page-tabs, despite their profileMode staying
  // "separate-pages" (Active, which shares that profileMode, is explicitly
  // NOT converted yet — held per the confirmed batch order). Seeded from
  // activeSection (the URL's own section param) rather than always
  // defaulting to the first section, so landing directly on e.g.
  // .../onboarding/employee/5/payroll still opens on Payroll —
  // activeSection is always null for genuine in-page-tabs stages
  // (Pre/Probation have no section segment in their URL at all, see
  // [id]/page.tsx), so this seed is a no-op there, unchanged from before.
  const usesClientTabs =
    config.profileMode === "in-page-tabs" || stage === "onboarding" || stage === "exit" || stage === "active";
  const [inPageActive, setInPageActive] = useState(activeSection ?? config.sections[0].key);
  const currentKey = usesClientTabs ? inPageActive : activeSection ?? config.sections[0].key;
  const currentSection = config.sections.find((s) => s.key === currentKey) ?? config.sections[0];

  const [history, setHistory] = useState<HistorySelection | null>(null);
  const displayStage = history?.stage ?? stage;
  const displaySection = history?.section ?? currentSection;

  const topLevel = config.sections.filter((s) => !s.group);
  const groups = Array.from(new Set(config.sections.filter((s) => s.group).map((s) => s.group as string)));
  const [openGroup, setOpenGroup] = useState<string | null>(
    groups.find((g) => config.sections.some((s) => s.group === g && s.key === currentKey)) ?? null,
  );

  // Only Full Time employees go through Probation (js/pre-proceed.js sends
  // Part Time/Protege/Intern straight from Pre to Onboarding, and
  // js/onboarding-profile-nav.js hides .top-tab--probation entirely for
  // them) — classified off `position` via the same positionGroup() used for
  // the Block-view Full Time/Part Time/Intern buckets, per the earlier
  // confirmed real-data mapping (no separate "employment type" field needed).
  const isFullTime = positionGroup(employeeDetail?.position ?? null) === "Full Time";
  const historyGroups = STAGE_HISTORY_GROUPS[stage].filter((g) => g.stage !== "probation" || isFullTime);

  const router = useRouter();
  const proceedButton = STAGE_PROCEED_BUTTON[stage];
  // Pre's own "Proceed" target depends on the employee's position (see
  // isFullTime above) rather than the static nextStage every other stage's
  // button uses — Full Time goes to Probation, everything else skips
  // straight to Onboarding, same split js/pre-proceed.js already encodes.
  const proceedTargetStage = stage === "pre" ? (isFullTime ? "probation" : "onboarding") : proceedButton?.nextStage;
  // Onboarding's own "Next" (proceedFromOnboarding) is Part Time/Intern
  // only — a Full Time person dual-listed here can only reach Active via
  // Probation's Confirm decision (see decideProbationOutcome), same rule
  // proceedFromOnboarding already rejects server-side. Per explicit
  // decision (see conversation), the button itself is now hidden for that
  // case too, not just server-rejected on click — the rejection alone left
  // a clickable button that always errors, confusing rather than informative.
  const showProceedButton = proceedButton && !(stage === "onboarding" && isFullTime);
  const [confirmingProceed, setConfirmingProceed] = useState(false);
  const [proceeding, setProceeding] = useState(false);
  const [proceedNotice, setProceedNotice] = useState<string | null>(null);

  const locationQuery = locationGroup && locationCode ? `?locGroup=${locationGroup}&locCode=${encodeURIComponent(locationCode)}` : "";

  function sectionHref(key: string) {
    return `/employee-folder/${stage}/employee/${employeeId}/${key}${locationQuery}`;
  }

  function goToCurrentSection(key: string) {
    setHistory(null);
    setInPageActive(key);
  }

  // The section pills for the right-hand nav rail — pulled out to its own
  // variable mainly so the rail's wrapping <nav> (further below) stays
  // readable next to its width/style logic.
  const navSections = (
    <>
      {topLevel.map((section) => {
        const isActive = !history && section.key === currentKey;
        const className = `w-full text-left box-border rounded-r-[20px] border-2 font-semibold leading-tight transition-colors ${config.navRail.paddingClass} ${config.navRail.fontSizeClass} ${
          isActive ? config.navRail.current : `${config.navRail.base} hover:brightness-95`
        }`;
        if (usesClientTabs) {
          return (
            <button key={section.key} type="button" onClick={() => goToCurrentSection(section.key)} className={className}>
              {section.label}
            </button>
          );
        }
        return (
          <Link key={section.key} href={sectionHref(section.key)} className={className}>
            {section.label}
          </Link>
        );
      })}

      {groups.map((group) => {
        const groupSections = config.sections.filter((s) => s.group === group);
        const isGroupActive = !history && groupSections.some((s) => s.key === currentKey);
        const isOpen = openGroup === group || isGroupActive;
        return (
          <div key={group} className="flex flex-col" style={{ gap: config.navRail.gapPx }}>
            <button
              type="button"
              onClick={() => setOpenGroup((g) => (g === group ? null : group))}
              aria-expanded={isOpen}
              className={`w-full flex items-center justify-between box-border rounded-r-[20px] border-2 font-semibold leading-tight transition-colors ${config.navRail.paddingClass} ${config.navRail.fontSizeClass} ${
                isGroupActive ? config.navRail.current : `${config.navRail.base} hover:brightness-95`
              }`}
            >
              {group}
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {isOpen && (
              <div className="flex flex-col ml-4" style={{ gap: config.navRail.gapPx }}>
                {groupSections.map((s) => {
                  const isCurrent = !history && s.key === currentKey;
                  const className = `w-full box-border rounded-r-[20px] border-2 font-semibold leading-tight transition-colors ${config.navRail.paddingClass} ${config.navRail.fontSizeClass} ${
                    isCurrent
                      ? config.navRail.clearanceCurrent ?? config.navRail.current
                      : `${config.navRail.clearanceBase ?? config.navRail.base} hover:brightness-95`
                  }`;
                  if (usesClientTabs) {
                    return (
                      <button key={s.key} type="button" onClick={() => goToCurrentSection(s.key)} className={className}>
                        {s.label}
                      </button>
                    );
                  }
                  return (
                    <Link key={s.key} href={sectionHref(s.key)} className={className}>
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  // ─── Touch-only two-row nav (replaces both the vertical rail AND the
  // History Tab Strip below on touch devices — see EmployeeRecordView.tsx's
  // own comments for why [@media(hover:none)] rather than a lg: width
  // breakpoint drives "touch vs desktop" here). Row 1 = a stage stepper
  // (Pre/Probation/Onboarding/Active/Exit, progressively revealed up to
  // this employee's current stage); Row 2 = whichever stage is selected in
  // Row 1's own sections. Both rows reuse the exact same `history` state
  // the desktop History Tab Strip already uses — Row 1's own current-stage
  // tab clears it, a historical stage tab sets it to that stage's first
  // section — so switching between the two navs (e.g. resizing across the
  // touch/desktop boundary) never desyncs which section is actually shown. ───

  // Row 1: historyGroups (already filtered to skip Probation for non-Full-
  // Time employees — same rule the desktop History Tab Strip/Exit tiles
  // already enforce) plus this employee's own current stage appended last,
  // in chronological order (Pre -> ... -> current).
  const mobileStageTabs = [...historyGroups.map((g) => g.stage), stage];
  const mobileStageTabsRow = mobileStageTabs.map((s) => {
    const isSelected = displayStage === s;
    // STAGE_HISTORY_TAB_STYLE is the existing "this pill represents stage
    // X, shown on a LATER stage's page" color table (distinct from that
    // stage's OWN navRail colors, which are for its own page's UI) — reused
    // here for the same reason the desktop History Tab Strip already uses
    // it. It has no "exit" entry (nothing ever comes after Exit), so the
    // fallback is that stage's own navRail.base — only ever exercised for
    // Exit's own tab if a user browses back to an earlier stage from it.
    const historyStyle = STAGE_HISTORY_TAB_STYLE[s];
    const baseClass = historyStyle ? `${historyStyle.base} text-black` : STAGE_PROFILE_CONFIG[s].navRail.base;
    const pillClassName = `shrink-0 rounded-full border-2 font-normal whitespace-nowrap transition-colors px-3.5 py-1.5 text-xs sm:text-sm ${
      isSelected ? STAGE_PROFILE_CONFIG[s].navRail.current : `${baseClass} hover:brightness-95`
    }`;
    return (
      <button
        key={s}
        type="button"
        onClick={() => {
          if (s === stage) {
            setHistory(null);
          } else {
            const group = historyGroups.find((g) => g.stage === s);
            if (group && group.sections.length > 0) setHistory({ stage: s, section: group.sections[0] });
          }
        }}
        className={pillClassName}
      >
        {STAGE_LABELS[s]}
      </button>
    );
  });

  // Row 2, case A: Row 1's OWN current-stage tab is selected (history is
  // null) — mirrors the desktop rail's own topLevel/groups split (ungrouped
  // leaves first, then each group), but INLINE within this one row rather
  // than a separate row below: an open group's own children are spliced in
  // immediately after that group's own toggle pill, in the same flex-nowrap
  // + overflow-x-auto row every other pill row in this app uses (an
  // earlier separate-Row-3 version was tried and explicitly reverted per
  // product decision). Clicking a leaf pill navigates/selects directly and
  // also closes any open group (desktop's own topLevel leaf clicks don't
  // do that — its accordion stays open independent of which tab is active
  // — so this is deliberately mobile-only, not shared with navSections/
  // goToCurrentSection above, which desktop's own rail also calls).
  const mobileLeafSections = topLevel.map((section) => {
    const isActive = !history && section.key === currentKey;
    const pillClassName = `shrink-0 rounded-full border-2 font-normal whitespace-nowrap transition-colors px-3 py-1.5 text-xs sm:text-sm ${
      isActive ? config.navRail.current : `${config.navRail.base} hover:brightness-95`
    }`;
    if (usesClientTabs) {
      return (
        <button
          key={section.key}
          type="button"
          onClick={() => {
            goToCurrentSection(section.key);
            setOpenGroup(null);
          }}
          className={pillClassName}
        >
          {section.label}
        </button>
      );
    }
    return (
      <Link key={section.key} href={sectionHref(section.key)} onClick={() => setOpenGroup(null)} className={pillClassName}>
        {section.label}
      </Link>
    );
  });

  const mobileRowTwoTopLevel: ReactNode[] = [...mobileLeafSections];
  for (const group of groups) {
    const groupSections = config.sections.filter((s) => s.group === group);
    const isGroupActive = !history && groupSections.some((s) => s.key === currentKey);
    const isOpen = openGroup === group;
    mobileRowTwoTopLevel.push(
      <button
        key={group}
        type="button"
        onClick={() => setOpenGroup((g) => (g === group ? null : group))}
        aria-expanded={isOpen}
        className={`shrink-0 flex items-center gap-1 rounded-full border-2 font-normal whitespace-nowrap transition-colors px-3 py-1.5 text-xs sm:text-sm ${
          isGroupActive ? config.navRail.current : `${config.navRail.base} hover:brightness-95`
        }`}
      >
        {group}
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>,
    );
    // Splice this group's own children in right here — immediately after
    // its toggle pill, in the SAME row — only while it's open.
    if (isOpen) {
      for (const section of groupSections) {
        const isCurrent = !history && section.key === currentKey;
        const pillClassName = `shrink-0 rounded-full border-2 font-normal whitespace-nowrap transition-colors px-3 py-1.5 text-xs sm:text-sm ${
          isCurrent
            ? (config.navRail.clearanceCurrent ?? config.navRail.current)
            : `${config.navRail.clearanceBase ?? config.navRail.base} hover:brightness-95`
        }`;
        mobileRowTwoTopLevel.push(
          usesClientTabs ? (
            <button key={section.key} type="button" onClick={() => goToCurrentSection(section.key)} className={pillClassName}>
              {section.label}
            </button>
          ) : (
            <Link key={section.key} href={sectionHref(section.key)} className={pillClassName}>
              {section.label}
            </Link>
          ),
        );
      }
    }
  }

  // Row 2, case B: a HISTORICAL stage is selected in Row 1 — that stage's
  // own sections (from historyGroups), each click resolving through the
  // same setHistory(...) the desktop History Tab Strip already uses.
  // Abbreviated HISTORY_TAB_LABEL (matching the desktop strip's own
  // convention for historical sections specifically — see its doc comment
  // in stageProfileConfig.ts) rather than the full section.label case A
  // uses, since case A's labels are this employee's OWN current-stage
  // sections (always shown at full length everywhere else in the app),
  // while these are someone else's-page-style historical markers.
  const selectedHistoryGroup = historyGroups.find((g) => g.stage === displayStage);
  const historicalSubTabSections = (selectedHistoryGroup?.sections ?? []).map((section) => {
    const isActive = history?.stage === displayStage && history.section.key === section.key;
    const style = STAGE_HISTORY_TAB_STYLE[displayStage] ?? STAGE_HISTORY_TAB_STYLE.pre!;
    return (
      <button
        key={section.key}
        type="button"
        onClick={() => setHistory({ stage: displayStage, section })}
        className={`shrink-0 rounded-full border-2 font-normal whitespace-nowrap transition-colors px-3 py-1.5 text-xs sm:text-sm ${
          isActive ? config.navRail.current : `${style.base} text-black hover:brightness-95`
        }`}
      >
        {HISTORY_TAB_LABEL[section.key] ?? section.label}
      </button>
    );
  });

  const mobileRowTwoSections = displayStage === stage ? mobileRowTwoTopLevel : historicalSubTabSections;

  return (
    <div className="min-h-full bg-[#f9fbff]">
      {/* --rail-width (fluid, below lg) and --rail-width-lg (the exact
          original per-stage pixel value, pinned at lg+ via the className's
          own lg:w-[var(--rail-width-lg)]) are both declared once here so the
          history strip, the rail, and the aside all size consistently.
          Two separate properties — not one clamp() meant to "converge" to
          the desktop value on its own — because relying on a single fluid
          formula to land on exactly the right pixel width at arbitrary
          desktop viewport sizes is exactly what produced the truncated rail
          labels this fixes: at lg+ these should be governed by a literal,
          unconditional value, not a calc() that merely happens to usually
          work out. */}
      <div
        className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-16"
        style={
          {
            "--rail-width": `clamp(100px, 26vw, ${config.navRail.widthPx}px)`,
            "--rail-width-lg": `${config.navRail.widthPx}px`,
          } as React.CSSProperties
        }
      >
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-4">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/employee-folder" className="hover:text-slate-900 transition-colors">
            Employee Overview
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href={`/employee-folder/${stage}`} className="hover:text-slate-900 transition-colors">
            {STAGE_LABELS[stage]}
          </Link>
          {locationName && locationGroup && locationCode && (
            <>
              <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <Link href={`/employee-folder/${stage}/${locationGroup}/${locationCode}`} className="hover:text-slate-900 transition-colors">
                {locationName}
              </Link>
            </>
          )}
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">{employeeName}</span>
        </nav>

        <h1 className="text-2xl font-semibold text-[#4b4949d6] mb-4">{STAGE_LABELS[stage]}</h1>

        {/* Desktop/mouse-driven-browser-only ([@media(hover:none)]:hidden —
            see EmployeeRecordView.tsx's own comments for why hover:none
            rather than a lg: width breakpoint drives this). Width-capped to
            match the white content card below (100% minus the rail and its
            gap — the same split the card/rail flex row computes for
            itself), not the full device width. Each strip itself is nowrap
            + overflow-x-auto (see their own definitions) so tabs that don't
            fit stay reachable by swipe instead of wrapping to a second row.
            lg:w-auto removes that cap entirely at desktop — original,
            unconstrained flex-wrap flow, exactly as before any of this
            responsive work. On touch devices the two-row nav below (stage
            stepper + that stage's own sections) replaces this entirely —
            same browsing capability (current AND historical stages/
            sections), just restructured into two distinct rows instead of
            one combined strip, since that's what doesn't fit on a phone. */}
        {historyGroups.length > 0 && (
          <div className="[@media(hover:none)]:hidden w-[calc(100%-var(--rail-width)-16px)] lg:w-auto">
            {stage === "exit" ? (
              <ExitHistoryTiles
                stage={stage}
                groups={historyGroups}
                selected={history}
                currentStyle={config.navRail.current}
                onSelect={(sel) => setHistory(sel)}
                className="mb-0 ml-4 sm:ml-6"
              />
            ) : (
              <HistoryTabStrip
                variant={stage === "probation" ? "bookmark" : "top"}
                groups={historyGroups}
                selected={history}
                currentStyle={config.navRail.current}
                onSelect={(sel) => setHistory(sel)}
                className="mb-0 ml-4 sm:ml-6"
              />
            )}
          </div>
        )}

        {/* Touch-only nav (hidden by default — desktop keeps the History
            Tab Strip above and the vertical rail below instead, both
            unchanged; [@media(hover:none)]:flex shows these on touch).
            Row 1: stage stepper (mobileStageTabsRow). Row 2: whichever
            stage is selected in Row 1's own sections — leaf sections plus
            one toggle pill per group (only Exit's "Clearance" today),
            mirroring the desktop rail's own topLevel/groups split. An open
            group's own children are spliced inline into this SAME row,
            immediately after its own toggle pill (mobileRowTwoTopLevel
            above already interleaves them in the right order) — per
            explicit product decision, NOT a separate row below (an earlier
            version tried that and was reverted). Sits above the white
            content card, same position Employee Record's own mobile
            sub-tab row occupies. */}
        <nav
          aria-label="Stage"
          className="hidden [@media(hover:none)]:flex flex-nowrap items-center gap-1.5 mb-1.5 overflow-x-auto"
        >
          {mobileStageTabsRow}
        </nav>
        {mobileRowTwoSections.length > 1 && (
          <nav
            aria-label={`${STAGE_LABELS[displayStage]} sections`}
            className="hidden [@media(hover:none)]:flex flex-nowrap items-center gap-1.5 mb-3 overflow-x-auto"
          >
            {mobileRowTwoSections}
          </nav>
        )}

        {/* Card + vertical nav-pill rail as flex siblings — same side-by-side
            structure as desktop at every breakpoint (never stacks below).
            No gap between them (fixed 2026-08-13, see conversation) — the
            rail sits flush against the card's right edge; same fix applied
            to EmployeeRecordView.tsx's own separate copy of this layout.
            Below lg, the aside and rail fluidly narrow on small viewports
            (see their own width styles) instead of wrapping under the
            content, and content keeps a real minimum width so its fields
            never get crushed illegibly; if those floors add up to more than
            a given phone's width, overflow-x-auto lets this row scroll
            horizontally as a unit. lg:overflow-visible turns that scroll
            escape hatch off entirely at desktop — the aside/rail are pinned
            to their exact original pixel widths there (see their own
            lg:w-[...] overrides), so there is nothing left for it to ever
            need to catch. */}
        <div className="flex items-start overflow-x-auto lg:overflow-visible">
          <div
            className="relative flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-[12px] shadow-[0_2px_6px_rgba(0,0,0,0.12),0_8px_20px_rgba(0,0,0,0.10)] p-3 sm:p-7 lg:p-10 flex gap-3 sm:gap-6 lg:gap-10"
            style={{ border: "0.5px solid var(--border-neutral)" }}
          >
            {/* Left column: avatar/name/status/Branch-Dept/Position/Phone/Email + proceed button */}
            <aside
              aria-label="Employee profile summary"
              className="flex-none w-[var(--aside-width)] lg:w-[220px] flex flex-col items-start gap-2.5"
              style={{ "--aside-width": "clamp(108px, 30vw, 220px)" } as React.CSSProperties}
            >
              <div
                className={`w-[min(122px,100%)] aspect-square rounded-full flex items-center justify-center text-3xl font-semibold shrink-0 ${STAGE_PILL_CLASSES[stage]}`}
              >
                {initialsFromName(employeeName)}
              </div>
              <h2 className="mt-1 w-full break-words text-2xl text-black">{employeeName}</h2>
              {stage !== "pre" && employeeDetail?.employeeId && (
                <span className="text-xs text-slate-500">ID: {employeeDetail.employeeId}</span>
              )}
              <span className={`inline-block px-3.5 py-0.5 rounded-full text-sm font-medium ${STAGE_PILL_CLASSES[stage]}`}>
                {STAGE_LABELS[stage]}
              </span>

              <SidebarField label="Branch/Dept">
                {employeeDetail?.departmentName ?? employeeDetail?.branchName ?? "--"}
              </SidebarField>
              <SidebarField label="Position">{employeeDetail?.position || "--"}</SidebarField>
              <SidebarField label="Phone Number">{formatDisplayPhone(employeeDetail?.phone)}</SidebarField>
              <SidebarField label="Email">{employeeDetail?.email || "--"}</SidebarField>

              {showProceedButton && (
                <div className="relative mt-1 w-full">
                  <button
                    type="button"
                    disabled={proceeding}
                    onClick={() => setConfirmingProceed(true)}
                    className="w-full min-h-11 rounded-[10px] bg-[#63f4aea8] text-[15px] font-bold text-[#17643c] hover:bg-[#63f4ae] transition-colors disabled:opacity-60"
                  >
                    {proceeding ? "Proceeding…" : proceedButton.label}
                  </button>
                  {proceedNotice && (
                    <div role="status" className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                      {proceedNotice}
                    </div>
                  )}
                </div>
              )}
            </aside>

            <div className="w-0.5 self-stretch bg-[#d9d9d9] shrink-0" aria-hidden="true" />

            {/* Middle column: tab content */}
            <div className="flex-1 min-w-[130px]">
              {stage === "pre" && employeeDetail ? (
                // Pre stage rollout batch 1 (2026-08-13, see conversation) —
                // all 5 of Pre's own tabs render together, wrapped in one
                // PageEditProvider, each hidden via CSS instead of switched
                // via resolvePanel() below, so an edit in progress on one
                // survives clicking to another. No route/Link conversion
                // needed here — Pre's tab-switching (inPageActive/currentKey
                // above) was already client-side state, never a real
                // navigation, unlike Employee Record's route-based
                // sub-nav. history is always null for Pre (STAGE_HISTORY_GROUPS.pre
                // is empty — there's no earlier stage to view history of),
                // so displayStage/displaySection always equal stage/
                // currentSection here — safe to key visibility off
                // currentKey directly rather than displaySection.key.
                <PageEditProvider>
                  <PageEditMessageDialog />
                  <div className="mb-4 flex justify-end">
                    <PageEditToggleButton />
                  </div>
                  <div className={currentKey === "personal-info" ? "" : "hidden"}>
                    <PersonalInfoPanel employee={employeeDetail} employeeId={employeeId} showOfferLetter canEdit={canEdit} />
                  </div>
                  {resumeInfo && (
                    <div className={currentKey === "resume" ? "" : "hidden"}>
                      <ResumePanel
                        userId={employeeId}
                        resumeFileId={resumeInfo.resumeFileId}
                        cvFileId={resumeInfo.cvFileId}
                        canEdit={canEdit}
                      />
                    </div>
                  )}
                  {interviewAssessment !== undefined && (
                    <div className={currentKey === "interview" ? "" : "hidden"}>
                      <InterviewAssessmentPanel userId={employeeId} data={interviewAssessment} canEdit={canEdit} />
                    </div>
                  )}
                  {referenceCheck !== undefined && (
                    <div className={currentKey === "reference" ? "" : "hidden"}>
                      <ReferenceCheckPanel userId={employeeId} data={referenceCheck} canEdit={canEdit} />
                    </div>
                  )}
                  {medicalCheck !== undefined && (
                    <div className={currentKey === "medical" ? "" : "hidden"}>
                      <MedicalCheckPanel userId={employeeId} data={medicalCheck} canEdit={canEdit} />
                    </div>
                  )}
                </PageEditProvider>
              ) : stage === "onboarding" && !history && employeeDetail ? (
                // Onboarding rollout Batch 4 (2026-08-13, see conversation) —
                // same shape as Pre above: all 3 of Onboarding's own tabs
                // render together under one PageEditProvider, each hidden via
                // CSS. Unlike Pre, Onboarding's tabs were previously real
                // routes (profileMode "separate-pages", shared with the
                // still-held Active) — usesClientTabs/inPageActive above
                // special-case Onboarding specifically so its own top-level
                // pills switch via client state without touching Active's
                // still-route-based ones. Guarded on !history — this
                // block is only Onboarding's OWN current tabs; a Pre/
                // Probation history tab selected from this same page still
                // falls through to resolvePanel below, unaffected.
                <PageEditProvider>
                  <PageEditMessageDialog />
                  <div className="mb-4 flex justify-end">
                    <PageEditToggleButton />
                  </div>
                  <div className={currentKey === "documents" ? "" : "hidden"}>
                    <DocumentsPanel userId={employeeId} data={documentsInfo ?? null} canEdit={canEdit} />
                  </div>
                  <div className={currentKey === "payroll" ? "" : "hidden"}>
                    <OnboardingPayrollPanel
                      userId={employeeId}
                      data={payrollInfo ?? null}
                      employeeDetail={employeeDetail}
                      canEdit={canEdit}
                    />
                  </div>
                  <div className={currentKey === "emergency-contact" ? "" : "hidden"}>
                    <EmergencyContactPanel
                      employee={employeeDetail}
                      onSave={(data) => updateEmergencyContact(employeeId, data)}
                      canEdit={canEdit}
                    />
                  </div>
                </PageEditProvider>
              ) : stage === "exit" &&
                !history &&
                resignationInfo !== undefined &&
                referenceLetterInfo !== undefined &&
                exitInterviewNoteInfo !== undefined &&
                knowledgeTransferChecklist !== undefined &&
                assetRecoveryChecklist !== undefined &&
                systemRevocationChecklist !== undefined &&
                financialSettlement !== undefined ? (
                // Exit rollout Batch 5 (2026-08-13, see conversation) — same
                // shape as Onboarding above: all 7 of Exit's own tabs
                // (Resignation/Reference Letter/Exit Interview Notes plus the
                // 4-item Clearance group) render together under one
                // PageEditProvider, each hidden via CSS. usesClientTabs also
                // covers Exit's group-toggle/group-children rendering (see
                // navSections/mobileRowTwoTopLevel above) so the Clearance
                // group's own 4 pills switch via client state too, not just
                // Exit's 3 ungrouped top-level tabs. Guarded on !history —
                // this block is only Exit's OWN current tabs; a Pre/
                // Probation/Onboarding/Active history tile selected from this
                // same page still falls through to resolvePanel below,
                // unaffected.
                <PageEditProvider>
                  <PageEditMessageDialog />
                  <div className="mb-4 flex justify-end">
                    <PageEditToggleButton />
                  </div>
                  <div className={currentKey === "resignation" ? "" : "hidden"}>
                    <ResignationPanel userId={employeeId} data={resignationInfo} canEdit={canEdit} />
                  </div>
                  <div className={currentKey === "knowledge-transfer" ? "" : "hidden"}>
                    <KnowledgeTransferPanel
                      userId={employeeId}
                      items={knowledgeTransferChecklist}
                      canAddItem={canAddChecklistItem ?? false}
                      canEdit={canEdit}
                    />
                  </div>
                  <div className={currentKey === "asset-recovery" ? "" : "hidden"}>
                    <AssetRecoveryPanel
                      userId={employeeId}
                      items={assetRecoveryChecklist}
                      canAddItem={canAddChecklistItem ?? false}
                      canEdit={canEdit}
                    />
                  </div>
                  <div className={currentKey === "system-revocation" ? "" : "hidden"}>
                    <SystemRevocationPanel
                      userId={employeeId}
                      items={systemRevocationChecklist}
                      canAddItem={canAddChecklistItem ?? false}
                      canEdit={canEdit}
                    />
                  </div>
                  <div className={currentKey === "financial-settlement" ? "" : "hidden"}>
                    <FinancialSettlementPanel userId={employeeId} data={financialSettlement} canEdit={canEdit} />
                  </div>
                  <div className={currentKey === "reference-letter" ? "" : "hidden"}>
                    <ReferenceLetterPanel userId={employeeId} data={referenceLetterInfo} canEdit={canEdit} />
                  </div>
                  <div className={currentKey === "exit-interview-notes" ? "" : "hidden"}>
                    <ExitInterviewNotesPanel userId={employeeId} data={exitInterviewNoteInfo} canEdit={canEdit} />
                  </div>
                </PageEditProvider>
              ) : stage === "active" &&
                !history &&
                leaveHistory !== undefined &&
                achievements !== undefined &&
                salaryRevisions !== undefined &&
                promotions !== undefined &&
                transfers !== undefined &&
                trainings !== undefined &&
                ndaInfo !== undefined &&
                nonCompeteInfo !== undefined &&
                disciplinarySummary !== undefined &&
                domesticInquiries !== undefined &&
                suspensionLetters !== undefined &&
                showcauseWarningLetters !== undefined &&
                pips !== undefined ? (
                // Active rollout Batch 6 (2026-08-13, see conversation) — same
                // shape as Exit above, but only 3 of Active's 9 tabs (Salary
                // Revision/NDA/Non-Compete) are actually EditableSection-
                // backed and register with the provider. MC/Leave is a
                // read-only summary with no Edit/Save concept at all;
                // Disciplinary is ALSO a read-only summary at the page level
                // (no Add/bulk-Save here either — that stays exclusive to
                // Employee Record's Disciplinary category, per explicit
                // decision) but its own rows are individually clickable to
                // edit that one record in place (2026-08-13, see
                // conversation — DisciplinarySummaryPanel's own click-to-edit,
                // gated on the SAME page-level Edit toggle via
                // usePageEditContext(), not a registered section of its own).
                // Achievement/Promotion/Transfer/Training are the same
                // RepeatableRecordSection panels excluded from this whole
                // rollout (their outer EditableSection has no onSave —
                // real saves already happen atomically per-row via their own
                // "+ Add" modal, independent of any Edit toggle) — they still
                // render here, CSS-hidden like every other tab, so switching
                // to/from them no longer loses an in-progress "+ Add" draft,
                // but they don't participate in the page-level Save (no
                // sectionLabel passed) since there's nothing pending for it
                // to commit. Guarded on !history — this block is only
                // Active's OWN current tabs; a Pre/Probation/Onboarding
                // history tile selected from this same page still falls
                // through to resolvePanel below, unaffected.
                <PageEditProvider>
                  <PageEditMessageDialog />
                  <div className="mb-4 flex justify-end">
                    <PageEditToggleButton />
                  </div>
                  <div className={currentKey === "salary-revision" ? "" : "hidden"}>
                    <SalaryRevisionPanel userId={employeeId} data={salaryRevisions} canEdit={canEdit} />
                  </div>
                  <div className={currentKey === "mc-leave" ? "" : "hidden"}>
                    <LeaveHistoryPanel rows={leaveHistory} />
                  </div>
                  <div className={currentKey === "achievement" ? "" : "hidden"}>
                    <AchievementPanel userId={employeeId} data={achievements} canEdit={canEdit} />
                  </div>
                  <div className={currentKey === "promotion" ? "" : "hidden"}>
                    <PromotionPanel userId={employeeId} data={promotions} currentPosition={employeeDetail?.position} canEdit={canEdit} />
                  </div>
                  <div className={currentKey === "transfer" ? "" : "hidden"}>
                    <TransferPanel
                      userId={employeeId}
                      data={transfers}
                      branches={branches ?? []}
                      departments={departments ?? []}
                      currentLocation={employeeDetail?.departmentName ?? employeeDetail?.branchName}
                      canEdit={canEdit}
                    />
                  </div>
                  <div className={currentKey === "training" ? "" : "hidden"}>
                    <TrainingPanel userId={employeeId} data={trainings} canEdit={canEdit} />
                  </div>
                  <div className={currentKey === "nda" ? "" : "hidden"}>
                    <NdaPanel userId={employeeId} data={ndaInfo} canEdit={canEdit} />
                  </div>
                  <div className={currentKey === "non-compete" ? "" : "hidden"}>
                    <NonCompetePanel userId={employeeId} data={nonCompeteInfo} canEdit={canEdit} />
                  </div>
                  <div className={currentKey === "disciplinary" ? "" : "hidden"}>
                    <DisciplinarySummaryPanel
                      userId={employeeId}
                      data={disciplinarySummary}
                      domesticInquiries={domesticInquiries}
                      suspensionLetters={suspensionLetters}
                      showcauseWarningLetters={showcauseWarningLetters}
                      pips={pips}
                      canEdit={canEdit}
                    />
                  </div>
                </PageEditProvider>
              ) : (
                resolvePanel({
                  originStage: displayStage,
                  section: displaySection,
                  leaveHistory,
                  employeeDetail,
                  resumeInfo,
                  interviewAssessment,
                  referenceCheck,
                  medicalCheck,
                  probationInfo,
                  probationDisplay,
                  canDecideProbation,
                  canEdit,
                  documentsInfo,
                  payrollInfo,
                  achievements,
                  salaryRevisions,
                  promotions,
                  transfers,
                  trainings,
                  ndaInfo,
                  nonCompeteInfo,
                  disciplinarySummary,
                  domesticInquiries,
                  suspensionLetters,
                  showcauseWarningLetters,
                  pips,
                  resignationInfo,
                  referenceLetterInfo,
                  exitInterviewNoteInfo,
                  knowledgeTransferChecklist,
                  assetRecoveryChecklist,
                  systemRevocationChecklist,
                  financialSettlement,
                  canAddChecklistItem,
                  branches,
                  departments,
                  employeeId,
                })
              )}
            </div>
          </div>

          {/* Right column: vertical stage/action nav rail — docked beside
              the card on any mouse/trackpad-driven browser, regardless of
              window width. Below lg, width fluidly narrows on small
              (desktop) viewports (min 96px, via --rail-width). At lg+,
              lg:w-[var(--rail-width-lg)] pins it to the exact original
              per-stage pixel width unconditionally — not relying on the
              clamp() to land there on its own, which is what let "Salary
              Revision"/"Non-Compete" truncate at ordinary desktop widths.
              [@media(hover:none)]:hidden removes it entirely on touch
              devices (any size/orientation, including iPad Pro landscape)
              — see EmployeeRecordView.tsx's own comments for why hover:none
              rather than a lg: width breakpoint drives that distinction;
              the mobile sub-tab row above replaces this there instead. */}
          <nav
            aria-label={`${STAGE_LABELS[stage]} sections`}
            className="flex-none flex flex-col mt-4 sm:mt-6 w-[var(--rail-width)] lg:w-[var(--rail-width-lg)] [@media(hover:none)]:hidden"
            style={{ gap: config.navRail.gapPx }}
          >
            {navSections}
          </nav>
        </div>
      </div>

      {confirmingProceed && showProceedButton && proceedTargetStage && (
        <ConfirmDialog
          message={`Proceed ${employeeName || "this employee"} to ${STAGE_LABELS[proceedTargetStage]}?`}
          onCancel={() => setConfirmingProceed(false)}
          onConfirm={async () => {
            // Every stage with a Proceed/Next button is now wired to a real
            // employment update — Exit is terminal (no button), and
            // Probation's own "Next" was removed as redundant (see
            // STAGE_PROCEED_BUTTON's own comment), so neither has a branch
            // here anymore.
            setProceeding(true);
            const result =
              stage === "pre"
                ? await proceedFromPreStage(employeeId)
                : stage === "onboarding"
                  ? await proceedFromOnboarding(employeeId)
                  : await proceedFromActive(employeeId);
            setProceeding(false);
            setConfirmingProceed(false);
            if (!result.ok) {
              setProceedNotice(result.error ?? "Failed to proceed.");
              setTimeout(() => setProceedNotice(null), 5000);
              return;
            }
            // Deliberately no router.refresh() here — this navigates to a
            // DIFFERENT route (the employee's new stage), which already
            // fetches fresh server data on its own. Calling refresh() right
            // after push() races with that pending navigation: it re-runs the
            // OLD route's own data fetch, which now 404s (the employee no
            // longer matches the old stage) and can swallow the navigation
            // entirely — exactly the "stuck on the old page" bug this fixes.
            router.push(profileUrlForStage(proceedTargetStage, employeeId));
          }}
        />
      )}
    </div>
  );
}

// Normalizes the sidebar's read-only phone display through the same
// parse/compose pair PhoneField uses, so it always shows the standard
// "+60 12-4680 797" style regardless of exactly how the stored string is
// spaced/punctuated.
function formatDisplayPhone(value: string | null | undefined): string {
  if (!value) return "--";
  const { countryCode, digits } = parsePhoneValue(value);
  return composePhoneValue(countryCode, digits) || "--";
}


// Shared by both the current stage's own section and every history-tab
// selection — a history click on Active's "Salary Revision"/"MC/ Leave"/
// achievement-etc. sections (reachable from Exit's stage-tiles) must resolve
// the exact same way the current-stage view would, real data included.
function resolvePanel({
  originStage,
  section,
  leaveHistory,
  employeeDetail,
  resumeInfo,
  interviewAssessment,
  referenceCheck,
  medicalCheck,
  probationInfo,
  probationDisplay,
  canDecideProbation,
  canEdit,
  documentsInfo,
  payrollInfo,
  achievements,
  salaryRevisions,
  promotions,
  transfers,
  trainings,
  ndaInfo,
  nonCompeteInfo,
  disciplinarySummary,
  domesticInquiries,
  suspensionLetters,
  showcauseWarningLetters,
  pips,
  resignationInfo,
  referenceLetterInfo,
  exitInterviewNoteInfo,
  knowledgeTransferChecklist,
  assetRecoveryChecklist,
  systemRevocationChecklist,
  financialSettlement,
  canAddChecklistItem,
  branches,
  departments,
  employeeId,
}: {
  originStage: EmployeeStage;
  section: ProfileSection;
  leaveHistory?: LeaveHistoryRow[];
  employeeDetail?: EmployeeDetailFull | null;
  resumeInfo?: ResumeInfo | null;
  interviewAssessment?: InterviewAssessmentInfo | null;
  referenceCheck?: ReferenceCheckInfo | null;
  medicalCheck?: MedicalCheckInfo | null;
  probationInfo?: ProbationInfo | null;
  probationDisplay?: ProbationDisplayInfo;
  canDecideProbation?: boolean;
  canEdit?: boolean;
  documentsInfo?: DocumentsInfo | null;
  payrollInfo?: PayrollInfo | null;
  achievements?: AchievementEntry[];
  salaryRevisions?: SalaryRevisionEntry[];
  promotions?: PromotionEntry[];
  transfers?: TransferEntry[];
  trainings?: TrainingEntry[];
  ndaInfo?: NdaInfo | null;
  nonCompeteInfo?: NonCompeteInfo | null;
  disciplinarySummary?: DisciplinarySummaryRow[];
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
  canAddChecklistItem?: boolean;
  branches?: BranchOpt[];
  departments?: DepartmentOpt[];
  employeeId: number;
}) {
  if (originStage === "active" && section.key === "mc-leave" && leaveHistory) {
    return <LeaveHistoryPanel rows={leaveHistory} />;
  }
  if (originStage === "onboarding" && section.key === "emergency-contact" && employeeDetail) {
    return (
      <EmergencyContactPanel
        employee={employeeDetail}
        onSave={(data) => updateEmergencyContact(employeeId, data)}
        canEdit={canEdit}
      />
    );
  }
  // Real user_profile-backed fields — same source and same component
  // Employee Record's own Personal Info tab uses, so a full-timer's Pre-stage
  // "Personal Info" (and every later stage's "P. Info" history tab) shows the
  // same populated data instead of a placeholder "-". Wrapped in its own
  // PageEditProvider (2026-08-15, see conversation) so an invalid phone/
  // email on a history tab shows the same centered PageEditMessageDialog as
  // every other Personal Info view, instead of EditableSection's smaller
  // standalone corner popover — same pattern as the 4 already-wrapped
  // current-tab blocks above, canEdit threaded through unchanged so
  // read/write permission is identical to before this wrapping.
  if (section.key === "personal-info" && employeeDetail) {
    return (
      <PageEditProvider>
        <PageEditMessageDialog />
        <div className="mb-4 flex justify-end">
          <PageEditToggleButton />
        </div>
        <PersonalInfoPanel employee={employeeDetail} employeeId={employeeId} showOfferLetter canEdit={canEdit} />
      </PageEditProvider>
    );
  }
  // Real resume table — same as above, shared with Employee Record's HR Info
  // > Resume/CV tab.
  if (section.key === "resume" && resumeInfo) {
    return (
      <ResumePanel
        userId={employeeId}
        resumeFileId={resumeInfo.resumeFileId}
        cvFileId={resumeInfo.cvFileId}
        canEdit={canEdit}
      />
    );
  }
  // Real interview_assessment table — Pre stage's own Interview Assessment
  // tab. interviewAssessment can validly be null (no row saved yet), so this
  // must gate on !== undefined rather than truthiness — an empty real panel
  // still beats falling through to a placeholder.
  if (section.key === "interview" && interviewAssessment !== undefined) {
    return <InterviewAssessmentPanel userId={employeeId} data={interviewAssessment} canEdit={canEdit} />;
  }
  // Real reference_check/medical_check/probation tables — same !== undefined
  // gating as interview_assessment above (a valid "no row saved yet" null
  // still renders the real empty panel, not a placeholder).
  if (section.key === "reference" && referenceCheck !== undefined) {
    return <ReferenceCheckPanel userId={employeeId} data={referenceCheck} canEdit={canEdit} />;
  }
  if (section.key === "medical" && medicalCheck !== undefined) {
    return <MedicalCheckPanel userId={employeeId} data={medicalCheck} canEdit={canEdit} />;
  }
  if (section.key === "probation" && probationInfo !== undefined && probationDisplay) {
    return (
      <ProbationPanel
        userId={employeeId}
        data={probationInfo}
        display={probationDisplay}
        canDecide={canDecideProbation ?? false}
        canEdit={canEdit}
      />
    );
  }
  // Real documents table — shared with Employee Record's HR Info > Handbook tab.
  if (section.key === "documents" && documentsInfo !== undefined) {
    return <DocumentsPanel userId={employeeId} data={documentsInfo} canEdit={canEdit} />;
  }
  // Real payroll table (+ reused bank_details for the Bank Details
  // subsection) — shared with Employee Record's Finance > Tax Info tab.
  if (section.key === "payroll" && payrollInfo !== undefined && employeeDetail) {
    return <OnboardingPayrollPanel userId={employeeId} data={payrollInfo} employeeDetail={employeeDetail} canEdit={canEdit} />;
  }
  // Active stage's 7 remaining real tabs — achievement/salary_revision/
  // promotion/transfer/training are repeatable (list + "add new" modal, via
  // ActiveProfilePanels.RepeatableRecordSection); nda/non_compete are
  // singleton; disciplinary is a read-only combined summary of the 4
  // Employee Record Disciplinary sub-tables.
  if (section.key === "achievement" && achievements !== undefined) {
    return <AchievementPanel userId={employeeId} data={achievements} canEdit={canEdit} />;
  }
  if (section.key === "salary-revision" && salaryRevisions !== undefined) {
    return <SalaryRevisionPanel userId={employeeId} data={salaryRevisions} canEdit={canEdit} />;
  }
  if (section.key === "promotion" && promotions !== undefined) {
    return <PromotionPanel userId={employeeId} data={promotions} currentPosition={employeeDetail?.position} canEdit={canEdit} />;
  }
  if (section.key === "transfer" && transfers !== undefined) {
    return (
      <TransferPanel
        userId={employeeId}
        data={transfers}
        branches={branches ?? []}
        departments={departments ?? []}
        currentLocation={employeeDetail?.departmentName ?? employeeDetail?.branchName}
        canEdit={canEdit}
      />
    );
  }
  if (section.key === "training" && trainings !== undefined) {
    return <TrainingPanel userId={employeeId} data={trainings} canEdit={canEdit} />;
  }
  if (section.key === "nda" && ndaInfo !== undefined) {
    return <NdaPanel userId={employeeId} data={ndaInfo} canEdit={canEdit} />;
  }
  if (section.key === "non-compete" && nonCompeteInfo !== undefined) {
    return <NonCompetePanel userId={employeeId} data={nonCompeteInfo} canEdit={canEdit} />;
  }
  if (
    section.key === "disciplinary" &&
    disciplinarySummary !== undefined &&
    domesticInquiries !== undefined &&
    suspensionLetters !== undefined &&
    showcauseWarningLetters !== undefined &&
    pips !== undefined
  ) {
    return (
      <DisciplinarySummaryPanel
        userId={employeeId}
        data={disciplinarySummary}
        domesticInquiries={domesticInquiries}
        suspensionLetters={suspensionLetters}
        showcauseWarningLetters={showcauseWarningLetters}
        pips={pips}
        canEdit={canEdit}
      />
    );
  }
  // Exit stage's own tabs — Resignation/Reference Letter/Exit Interview
  // Notes, plus its 4 Clearance sub-tabs (real now — see
  // ActiveProfilePanels.KnowledgeTransferPanel/AssetRecoveryPanel/
  // SystemRevocationPanel/FinancialSettlementPanel).
  if (section.key === "resignation" && resignationInfo !== undefined) {
    return <ResignationPanel userId={employeeId} data={resignationInfo} canEdit={canEdit} />;
  }
  if (section.key === "reference-letter" && referenceLetterInfo !== undefined) {
    return <ReferenceLetterPanel userId={employeeId} data={referenceLetterInfo} canEdit={canEdit} />;
  }
  if (section.key === "exit-interview-notes" && exitInterviewNoteInfo !== undefined) {
    return <ExitInterviewNotesPanel userId={employeeId} data={exitInterviewNoteInfo} canEdit={canEdit} />;
  }
  if (section.key === "knowledge-transfer" && knowledgeTransferChecklist !== undefined) {
    return (
      <KnowledgeTransferPanel
        userId={employeeId}
        items={knowledgeTransferChecklist}
        canAddItem={canAddChecklistItem ?? false}
        canEdit={canEdit}
      />
    );
  }
  if (section.key === "asset-recovery" && assetRecoveryChecklist !== undefined) {
    return (
      <AssetRecoveryPanel
        userId={employeeId}
        items={assetRecoveryChecklist}
        canAddItem={canAddChecklistItem ?? false}
        canEdit={canEdit}
      />
    );
  }
  if (section.key === "system-revocation" && systemRevocationChecklist !== undefined) {
    return (
      <SystemRevocationPanel
        userId={employeeId}
        items={systemRevocationChecklist}
        canAddItem={canAddChecklistItem ?? false}
        canEdit={canEdit}
      />
    );
  }
  if (section.key === "financial-settlement" && financialSettlement !== undefined) {
    return <FinancialSettlementPanel userId={employeeId} data={financialSettlement} canEdit={canEdit} />;
  }
  if (STAGE_CONTENT_PANELS[section.key]) {
    const ContentPanel = STAGE_CONTENT_PANELS[section.key];
    return <ContentPanel />;
  }
  return <UnwiredPanel label={section.label} stageLabel={STAGE_LABELS[originStage]} />;
}

function UnwiredPanel({ label, stageLabel }: { label: string; stageLabel: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="text-base font-semibold text-slate-800">{label}</p>
      <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
        This section&apos;s fields aren&apos;t wired up yet — most of the {stageLabel} profile&apos;s data (e.g. history logs,
        document uploads) has no matching column in the current database schema. Navigation and layout match the
        reference; the form content is pending a scoping decision.
      </p>
    </div>
  );
}

// ─── Cumulative history — bookmark-tabs (Probation) / top-tabs (Onboarding, Active) ───
// Emp_Folder renders these as a flat row of small pill tabs above the card, one
// per section from every prior stage. Each originating stage keeps its own
// fixed category color (STAGE_HISTORY_TAB_STYLE) regardless of selection —
// only the currently-open tab (if any) switches to the CURRENT page's own
// accent color, exactly like Emp_Folder's own per-page CSS override.

function HistoryTabStrip({
  variant,
  groups,
  selected,
  currentStyle,
  onSelect,
  className = "",
}: {
  variant: "bookmark" | "top";
  groups: { stage: EmployeeStage; sections: ProfileSection[] }[];
  selected: HistorySelection | null;
  currentStyle: string;
  onSelect: (sel: HistorySelection) => void;
  className?: string;
}) {
  const shape = variant === "bookmark" ? "rounded-t-[10px] rounded-b-none border-b-0" : "rounded-t-[10px] rounded-b-none border-b-0";

  return (
    <nav aria-label="Previous stage sections" className={`flex flex-nowrap overflow-x-auto gap-1 ${className}`}>
      {groups.flatMap((group) =>
        group.sections.map((section) => {
          const isActive = selected?.stage === group.stage && selected.section.key === section.key;
          const style = STAGE_HISTORY_TAB_STYLE[group.stage] ?? STAGE_HISTORY_TAB_STYLE.pre!;
          return (
            <button
              key={`${group.stage}-${section.key}`}
              type="button"
              onClick={() => onSelect({ stage: group.stage, section })}
              className={`shrink-0 px-3.5 py-2 border-2 text-[13px] font-medium whitespace-nowrap transition-colors ${shape} ${
                isActive ? currentStyle : `${style.base} text-black hover:brightness-95`
              }`}
            >
              {HISTORY_TAB_LABEL[section.key] ?? section.label}
            </button>
          );
        }),
      )}
    </nav>
  );
}

// ─── Cumulative history — stage-tiles (Exit) ───
// Emp_Folder groups Exit's (much longer) history by originating stage, shown
// as a collapsed row of dot "tiles" per stage (colored per that stage's own
// category) that expands into that stage's own tab-strip on click. Mirrors
// .stage-tabs/.stage-cell/.stage-tabs-expanded from exit_resignation.css
// exactly: .stage-tabs is one flex-wrap row across every group, and each
// .stage-cell is ITSELF a row (its tile button and, once expanded, that
// group's tabs sit side by side inline) — not a column. Stacking the tile
// button above its expanded tabs (flex-col) was the actual bug: it made the
// expanded group's own wrapper much taller than its collapsed siblings,
// which broke the whole row's wrapping and pushed the progress tiles onto
// their own line underneath instead of sitting beside the tabs.
//
// js/exit-stage-tabs.js confirms the expand toggle is a REPLACE, not an
// add-alongside: opening a group adds .is-hidden to that group's own tile
// button (hiding the collapsed dots) while its .stage-tabs-expanded gets
// .is-expanded — the collapsed pill and the expanded tabs are never both
// visible for the same group at once. Only the other, still-collapsed
// groups keep showing their dots (also confirmed: the click handler resets
// every OTHER trigger closed first, so at most one group is ever expanded).
function ExitHistoryTiles({
  groups,
  selected,
  currentStyle,
  onSelect,
  className = "",
}: {
  stage: EmployeeStage;
  groups: { stage: EmployeeStage; sections: ProfileSection[] }[];
  selected: HistorySelection | null;
  currentStyle: string;
  onSelect: (sel: HistorySelection) => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState<EmployeeStage | null>(
    groups.find((g) => g.stage === selected?.stage)?.stage ?? null,
  );

  return (
    <div aria-label="Previous stages" className={`flex flex-nowrap overflow-x-auto items-center gap-1.5 ${className}`}>
      {groups.map((group) => {
        const isOpen = expanded === group.stage;
        const style = STAGE_HISTORY_TAB_STYLE[group.stage] ?? STAGE_HISTORY_TAB_STYLE.pre!;
        return (
          <div key={group.stage} className="flex items-center gap-1 shrink-0">
            {!isOpen && (
              <button
                type="button"
                onClick={() => setExpanded(group.stage)}
                aria-expanded={false}
                aria-label={`Show ${STAGE_LABELS[group.stage]} stage tabs`}
                className="flex items-stretch h-[22px] rounded-[11px] overflow-hidden shrink-0 hover:brightness-95 transition"
              >
                {group.sections.map((s, i) => (
                  <span
                    key={s.key}
                    className={`w-3.5 ${i > 0 ? "border-l-2 border-[#f9fbff]" : ""}`}
                    style={{ backgroundColor: style.hoverBg }}
                    aria-hidden="true"
                  />
                ))}
              </button>
            )}
            {isOpen && (
              <div className="flex flex-nowrap items-center gap-1">
                {group.sections.map((section) => {
                  const isActive = selected?.stage === group.stage && selected.section.key === section.key;
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => onSelect({ stage: group.stage, section })}
                      className={`shrink-0 px-3.5 py-2 rounded-t-[10px] border-2 border-b-0 text-[13px] font-medium whitespace-nowrap transition-colors ${
                        isActive ? currentStyle : `${style.base} text-black hover:brightness-95`
                      }`}
                    >
                      {HISTORY_TAB_LABEL[section.key] ?? section.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Real leave_request rows (the canonical, consolidated source — see
// listLeaveHistory). The mock's own MC/Leave columns are Leave Type/Date/
// Duration/Attachment; Status and Reason are kept since they're real and
// useful, beyond what the mock happened to show.
// Start/end date stacked on their own line within the Date cell (rather than
// squeezed onto one "start – end" line, which wraps messily) — each line is
// its own whitespace-nowrap span so a single date never breaks mid-string.
// Same-day leave shows just the one date, no second line.
function LeaveDateCell({ startDate, endDate }: { startDate: string; endDate: string }) {
  if (startDate === endDate) return <span className="whitespace-nowrap">{startDate}</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="whitespace-nowrap">{startDate}</span>
      <span className="whitespace-nowrap">{endDate}</span>
    </div>
  );
}

function LeaveHistoryPanel({ rows }: { rows: LeaveHistoryRow[] }) {
  return (
    <div>
      <PanelHeading>MC/ Leave</PanelHeading>
      <RecordTable
        columns={[
          { key: "type", label: "Leave Type" },
          { key: "dates", label: "Date" },
          { key: "days", label: "Duration" },
          { key: "status", label: "Status" },
          { key: "reason", label: "Reason" },
          { key: "attachment", label: "Attachment" },
        ]}
        rows={rows.map((r) => ({
          type: r.leaveTypeName,
          dates: <LeaveDateCell startDate={r.startDate} endDate={r.endDate} />,
          days: <span className="whitespace-nowrap">{`${r.totalDays} Day${r.totalDays === "1" ? "" : "s"}`}</span>,
          status: <span className="capitalize whitespace-nowrap">{r.status}</span>,
          reason: r.reason ?? "—",
          attachment: <RealAttachmentLink fileId={r.attachment} />,
        }))}
        addLabel="+ Add leave record"
      />
    </div>
  );
}
