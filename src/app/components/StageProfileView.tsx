"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  ResignationInfo,
  ReferenceLetterInfo,
  ExitInterviewNoteInfo,
} from "@/lib/employeeQueries";
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
} from "@/app/components/ActiveProfilePanels";
import { STAGE_CONTENT_PANELS } from "@/app/components/StageHistoryPanels";
import {
  updateEmergencyContact,
  proceedFromPreStage,
  proceedFromProbation,
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
  resignationInfo?: ResignationInfo | null;
  referenceLetterInfo?: ReferenceLetterInfo | null;
  exitInterviewNoteInfo?: ExitInterviewNoteInfo | null;
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
  resignationInfo,
  referenceLetterInfo,
  exitInterviewNoteInfo,
  branches,
  departments,
  locationGroup,
  locationCode,
  locationName,
}: Props) {
  const config = STAGE_PROFILE_CONFIG[stage];
  const [inPageActive, setInPageActive] = useState(config.sections[0].key);
  const currentKey = config.profileMode === "in-page-tabs" ? inPageActive : activeSection ?? config.sections[0].key;
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
  // Probation's own "Next" only makes sense once Probation Status is
  // actually Confirmed — In Progress/Extended/Stopped all keep the button
  // disabled (re-checked server-side too, in proceedFromProbation).
  const probationConfirmed = probationInfo?.probationStatus === "Confirmed";
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

  return (
    <div className="min-h-full bg-[#f9fbff]">
      <div className="max-w-[1440px] mx-auto px-8 pt-4 pb-16">
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

        {historyGroups.length > 0 &&
          (stage === "exit" ? (
            <ExitHistoryTiles
              stage={stage}
              groups={historyGroups}
              selected={history}
              currentStyle={config.navRail.current}
              onSelect={(sel) => setHistory(sel)}
              className="mb-0"
            />
          ) : (
            <HistoryTabStrip
              variant={stage === "probation" ? "bookmark" : "top"}
              groups={historyGroups}
              selected={history}
              currentStyle={config.navRail.current}
              onSelect={(sel) => setHistory(sel)}
              className="mb-0"
            />
          ))}

        {/* Card + vertical nav-pill rail as flex siblings — the reference docks
            this rail to the right of the content card on every stage. */}
        <div className="flex items-start gap-4">
          <div className="relative flex-1 min-w-0 bg-white rounded-[35px] p-10 flex gap-10">
            {/* Left column: avatar/name/status/Branch-Dept/Position/Phone/Email + proceed button */}
            <aside aria-label="Employee profile summary" className="flex-none w-[220px] flex flex-col items-start gap-2.5">
              <div
                className={`w-[122px] h-[118px] rounded-full flex items-center justify-center text-3xl font-semibold shrink-0 ${STAGE_PILL_CLASSES[stage]}`}
              >
                {initialsFromName(employeeName)}
              </div>
              <h2 className="mt-1 w-full break-words text-2xl text-black">{employeeName}</h2>
              <span className={`inline-block px-3.5 py-0.5 rounded-full text-sm font-medium ${STAGE_PILL_CLASSES[stage]}`}>
                {STAGE_LABELS[stage]}
              </span>

              <SidebarField label="Branch/Dept">
                {employeeDetail?.departmentName ?? employeeDetail?.branchName ?? "--"}
              </SidebarField>
              <SidebarField label="Position">{employeeDetail?.position || "--"}</SidebarField>
              <SidebarField label="Phone Number">{formatDisplayPhone(employeeDetail?.phone)}</SidebarField>
              <SidebarField label="Email">{employeeDetail?.email || "--"}</SidebarField>

              {proceedButton && (
                <div className="relative mt-1 w-full">
                  <button
                    type="button"
                    disabled={proceeding || (stage === "probation" && !probationConfirmed)}
                    title={stage === "probation" && !probationConfirmed ? "Probation Status must be Confirmed first" : undefined}
                    onClick={() => setConfirmingProceed(true)}
                    className="w-full h-10 rounded-[10px] bg-[#63f4aea8] text-[15px] font-bold text-[#17643c] hover:bg-[#63f4ae] transition-colors disabled:opacity-60"
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
            <div className="flex-1 min-w-0">
              {resolvePanel({
                originStage: displayStage,
                section: displaySection,
                leaveHistory,
                employeeDetail,
                resumeInfo,
                interviewAssessment,
                referenceCheck,
                medicalCheck,
                probationInfo,
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
                resignationInfo,
                referenceLetterInfo,
                exitInterviewNoteInfo,
                branches,
                departments,
                employeeId,
              })}
            </div>
          </div>

          {/* Right column: vertical stage/action nav rail */}
          <nav
            aria-label={`${STAGE_LABELS[stage]} sections`}
            className="flex-none flex flex-col"
            style={{ width: config.navRail.widthPx, gap: config.navRail.gapPx }}
          >
            {topLevel.map((section) => {
              const isActive = !history && section.key === currentKey;
              const className = `w-full text-left box-border rounded-r-[20px] border-2 font-semibold leading-tight transition-colors ${config.navRail.paddingClass} ${config.navRail.fontSizeClass} ${
                isActive ? config.navRail.current : `${config.navRail.base} hover:brightness-95`
              }`;
              if (config.profileMode === "in-page-tabs") {
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
                        return (
                          <Link
                            key={s.key}
                            href={sectionHref(s.key)}
                            className={`w-full box-border rounded-r-[20px] border-2 font-semibold leading-tight transition-colors ${config.navRail.paddingClass} ${config.navRail.fontSizeClass} ${
                              isCurrent
                                ? config.navRail.clearanceCurrent ?? config.navRail.current
                                : `${config.navRail.clearanceBase ?? config.navRail.base} hover:brightness-95`
                            }`}
                          >
                            {s.label}
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

      {confirmingProceed && proceedButton && proceedTargetStage && (
        <ConfirmDialog
          message={`Proceed ${employeeName || "this employee"} to ${STAGE_LABELS[proceedTargetStage]}?`}
          onCancel={() => setConfirmingProceed(false)}
          onConfirm={async () => {
            // Every stage with a Proceed/Next button is now wired to a real
            // employment update — Exit is terminal, so there's no button (and
            // no placeholder branch) left for it.
            setProceeding(true);
            const result =
              stage === "pre"
                ? await proceedFromPreStage(employeeId)
                : stage === "probation"
                  ? await proceedFromProbation(employeeId)
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

// Builds the profile URL for a given stage — "in-page-tabs" stages (Pre/
// Probation) have no section segment, "separate-pages" stages (Onboarding/
// Active/Exit) land on their first section. Used to send "Proceed" straight
// to the employee's new profile after a real stage move, whichever URL shape
// that target stage actually uses.
function profileUrlForStage(stage: EmployeeStage, employeeId: number): string {
  const config = STAGE_PROFILE_CONFIG[stage];
  if (config.profileMode === "separate-pages") {
    return `/employee-folder/${stage}/employee/${employeeId}/${config.sections[0].key}`;
  }
  return `/employee-folder/${stage}/employee/${employeeId}`;
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
  resignationInfo,
  referenceLetterInfo,
  exitInterviewNoteInfo,
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
  resignationInfo?: ResignationInfo | null;
  referenceLetterInfo?: ReferenceLetterInfo | null;
  exitInterviewNoteInfo?: ExitInterviewNoteInfo | null;
  branches?: BranchOpt[];
  departments?: DepartmentOpt[];
  employeeId: number;
}) {
  if (originStage === "active" && section.key === "mc-leave" && leaveHistory) {
    return <LeaveHistoryPanel rows={leaveHistory} />;
  }
  if (originStage === "onboarding" && section.key === "emergency-contact" && employeeDetail) {
    return <EmergencyContactPanel employee={employeeDetail} onSave={(data) => updateEmergencyContact(employeeId, data)} />;
  }
  // Real user_profile-backed fields — same source and same component
  // Employee Record's own Personal Info tab uses, so a full-timer's Pre-stage
  // "Personal Info" (and every later stage's "P. Info" history tab) shows the
  // same populated data instead of a placeholder "Not provided".
  if (section.key === "personal-info" && employeeDetail) {
    return <PersonalInfoPanel employee={employeeDetail} employeeId={employeeId} showOfferLetter />;
  }
  // Real resume table — same as above, shared with Employee Record's HR Info
  // > Resume/CV tab.
  if (section.key === "resume" && resumeInfo) {
    return <ResumePanel userId={employeeId} resumeFileId={resumeInfo.resumeFileId} cvFileId={resumeInfo.cvFileId} />;
  }
  // Real interview_assessment table — Pre stage's own Interview Assessment
  // tab. interviewAssessment can validly be null (no row saved yet), so this
  // must gate on !== undefined rather than truthiness — an empty real panel
  // still beats falling through to a placeholder.
  if (section.key === "interview" && interviewAssessment !== undefined) {
    return <InterviewAssessmentPanel userId={employeeId} data={interviewAssessment} />;
  }
  // Real reference_check/medical_check/probation tables — same !== undefined
  // gating as interview_assessment above (a valid "no row saved yet" null
  // still renders the real empty panel, not a placeholder).
  if (section.key === "reference" && referenceCheck !== undefined) {
    return <ReferenceCheckPanel userId={employeeId} data={referenceCheck} />;
  }
  if (section.key === "medical" && medicalCheck !== undefined) {
    return <MedicalCheckPanel userId={employeeId} data={medicalCheck} />;
  }
  if (section.key === "probation" && probationInfo !== undefined) {
    return <ProbationPanel userId={employeeId} data={probationInfo} />;
  }
  // Real documents table — shared with Employee Record's HR Info > Handbook tab.
  if (section.key === "documents" && documentsInfo !== undefined) {
    return <DocumentsPanel userId={employeeId} data={documentsInfo} />;
  }
  // Real payroll table (+ reused bank_details for the Bank Details
  // subsection) — shared with Employee Record's Finance > Tax Info tab.
  if (section.key === "payroll" && payrollInfo !== undefined && employeeDetail) {
    return <OnboardingPayrollPanel userId={employeeId} data={payrollInfo} employeeDetail={employeeDetail} />;
  }
  // Active stage's 7 remaining real tabs — achievement/salary_revision/
  // promotion/transfer/training are repeatable (list + "add new" modal, via
  // ActiveProfilePanels.RepeatableRecordSection); nda/non_compete are
  // singleton; disciplinary is a read-only combined summary of the 4
  // Employee Record Disciplinary sub-tables.
  if (section.key === "achievement" && achievements !== undefined) {
    return <AchievementPanel userId={employeeId} data={achievements} />;
  }
  if (section.key === "salary-revision" && salaryRevisions !== undefined) {
    return <SalaryRevisionPanel userId={employeeId} data={salaryRevisions} />;
  }
  if (section.key === "promotion" && promotions !== undefined) {
    return <PromotionPanel userId={employeeId} data={promotions} currentPosition={employeeDetail?.position} />;
  }
  if (section.key === "transfer" && transfers !== undefined) {
    return (
      <TransferPanel
        userId={employeeId}
        data={transfers}
        branches={branches ?? []}
        departments={departments ?? []}
        currentLocation={employeeDetail?.departmentName ?? employeeDetail?.branchName}
      />
    );
  }
  if (section.key === "training" && trainings !== undefined) {
    return <TrainingPanel userId={employeeId} data={trainings} />;
  }
  if (section.key === "nda" && ndaInfo !== undefined) {
    return <NdaPanel userId={employeeId} data={ndaInfo} />;
  }
  if (section.key === "non-compete" && nonCompeteInfo !== undefined) {
    return <NonCompetePanel userId={employeeId} data={nonCompeteInfo} />;
  }
  if (section.key === "disciplinary" && disciplinarySummary !== undefined) {
    return <DisciplinarySummaryPanel data={disciplinarySummary} />;
  }
  // Exit stage's 3 real singleton tabs — Resignation/Reference Letter/Exit
  // Interview Notes. Its 4 Clearance sub-tabs remain placeholders (no
  // backing tables), still resolved via STAGE_CONTENT_PANELS below.
  if (section.key === "resignation" && resignationInfo !== undefined) {
    return <ResignationPanel userId={employeeId} data={resignationInfo} />;
  }
  if (section.key === "reference-letter" && referenceLetterInfo !== undefined) {
    return <ReferenceLetterPanel userId={employeeId} data={referenceLetterInfo} />;
  }
  if (section.key === "exit-interview-notes" && exitInterviewNoteInfo !== undefined) {
    return <ExitInterviewNotesPanel userId={employeeId} data={exitInterviewNoteInfo} />;
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
    <nav aria-label="Previous stage sections" className={`flex flex-wrap gap-1 ${className}`}>
      {groups.flatMap((group) =>
        group.sections.map((section) => {
          const isActive = selected?.stage === group.stage && selected.section.key === section.key;
          const style = STAGE_HISTORY_TAB_STYLE[group.stage] ?? STAGE_HISTORY_TAB_STYLE.pre!;
          return (
            <button
              key={`${group.stage}-${section.key}`}
              type="button"
              onClick={() => onSelect({ stage: group.stage, section })}
              className={`px-3.5 py-2 border-2 text-[13px] font-medium whitespace-nowrap transition-colors ${shape} ${
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
    <div aria-label="Previous stages" className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {groups.map((group) => {
        const isOpen = expanded === group.stage;
        const style = STAGE_HISTORY_TAB_STYLE[group.stage] ?? STAGE_HISTORY_TAB_STYLE.pre!;
        return (
          <div key={group.stage} className="flex items-center gap-1">
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
              <div className="flex flex-wrap items-center gap-1">
                {group.sections.map((section) => {
                  const isActive = selected?.stage === group.stage && selected.section.key === section.key;
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => onSelect({ stage: group.stage, section })}
                      className={`px-3.5 py-2 rounded-t-[10px] border-2 border-b-0 text-[13px] font-medium whitespace-nowrap transition-colors ${
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
