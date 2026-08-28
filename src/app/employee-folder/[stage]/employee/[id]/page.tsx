import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeRecordView from "@/app/components/EmployeeRecordView";
import { findRecordCategory } from "@/lib/employeeRecordConfig";
import {
  isEmployeeStage,
  getEmployeeOverviewRowById,
  getEmployeeById,
  getOnboardingCandidateDetail,
  getResumeInfo,
  getInterviewAssessment,
  getReferenceCheck,
  getMedicalCheck,
  getProbationInfo,
  listGuardianInfo,
  getPaymentInfo,
  getDocuments,
  getPayrollInfo,
  listLeaveHistory,
  listAchievements,
  listSalaryRevisions,
  listPromotions,
  listTransfers,
  listTrainings,
  listPerformanceReviews,
  getNda,
  getNonCompete,
  listDomesticInquiries,
  listSuspensionLetters,
  listShowcauseWarningLetters,
  listPips,
  listBranches,
  listDepartments,
  getPayslip,
  listPayslipHistory,
  listEmployeeTasks,
  getResignation,
  getReferenceLetter,
  getExitInterviewNote,
  getKnowledgeTransferChecklist,
  getAssetRecoveryChecklist,
  getSystemRevocationChecklist,
  getFinancialSettlement,
  resolveLocationName,
  type DocumentsInfo,
  type PayrollInfo,
  type ProbationInfo,
  type NdaInfo,
  type NonCompeteInfo,
  type PayslipInfo,
  type LeaveHistoryRow,
  type AchievementEntry,
  type SalaryRevisionEntry,
  type PromotionEntry,
  type TransferEntry,
  type TrainingEntry,
  type DomesticInquiryEntry,
  type SuspensionLetterEntry,
  type ShowcauseWarningLetterEntry,
  type PipEntry,
  type PayslipHistoryEntry,
  type PerformanceReviewEntry,
  type EmployeeTasksSummary,
  type ResignationInfo,
  type ReferenceLetterInfo,
  type ExitInterviewNoteInfo,
  type ExitChecklistItem,
  type FinancialSettlementInfo,
} from "@/lib/employeeQueries";
import { positionGroup } from "@/lib/employeeStages";
import { STAGE_PROFILE_CONFIG } from "@/lib/stageProfileConfig";
import { getRealAccountLifecycleOverride, computePreStartDatePassedRows } from "@/lib/careerApplicationSync";
import { getProbationDisplayInfo } from "@/lib/probationDecision";
import {
  PRE_VISIBLE_SECTIONS,
  PRE_NEW_SECTIONS,
  probationVisibleSections,
  probationNewSections,
  onboardingVisibleSections,
  onboardingNewSections,
  activeVisibleSections,
  activeNewSections,
  exitVisibleSections,
  exitNewSections,
  isSectionEmpty,
  firstNewSection,
  entirelyNewCategories,
} from "@/lib/employeeVisibleSections";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ stage: string; id: string }>;
  searchParams: Promise<{ locGroup?: string; locCode?: string }>;
}

export default async function EmployeeFolderProfilePage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { stage, id } = await params;
  if (!isEmployeeStage(stage)) notFound();
  const config = STAGE_PROFILE_CONFIG[stage];

  // Onboarding, Active, and now Exit too (2026-08-27, see conversation —
  // Exit added this round, the last of the three) are excluded from this
  // redirect — all three stay on this one bare URL, same as Pre/Probation,
  // rendering EmployeeRecordView below instead of being sent to their own
  // old per-section route (src/app/employee-folder/[stage]/employee/[id]/
  // [section]/page.tsx, still profileMode "separate-pages" in
  // stageProfileConfig.ts and still fully functional as a fallback for
  // anyone with an old bookmarked Onboarding/Active/Exit section URL — just
  // no longer the primary path for ANY stage anymore, now that Exit is
  // converted too).
  if (config.profileMode === "separate-pages" && stage !== "onboarding" && stage !== "active" && stage !== "exit") {
    const { locGroup, locCode } = await searchParams;
    const qs = locGroup && locCode ? `?locGroup=${locGroup}&locCode=${locCode}` : "";
    redirect(`/employee-folder/${stage}/employee/${id}/${config.sections[0].key}${qs}`);
  }

  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  // Negative ids are the onboarding_candidate sentinel (-source_id) — a
  // future hire with no portal account yet (see listUpcomingOnboardingCandidates).
  // Same profile template as a real employee, just synthesized from the
  // handful of fields the candidate table actually has; every other tab's
  // real-table lookups below (getResumeInfo etc.) already no-op safely for a
  // user_id that doesn't exist, so they don't need special-casing.
  const isCandidate = numId < 0;
  // A candidate-only row can now also be reached via Onboarding once its
  // start_date has passed (see computePreStartDatePassedRows) — same
  // synthesized-from-onboarding_candidate profile, just a different
  // stage label on the breadcrumb/URL.
  if (isCandidate && stage !== "pre" && stage !== "onboarding") notFound();

  let employee: { id: number; fullName: string };
  let employeeDetail;
  if (isCandidate) {
    const candidate = await getOnboardingCandidateDetail(-numId);
    if (!candidate) notFound();
    employee = { id: numId, fullName: candidate.fullName };
    employeeDetail = candidate;
  } else {
    const found = await getEmployeeOverviewRowById(numId);
    if (!found) notFound();
    if (found.stage !== stage) {
      // Two allowed mismatches: (a) someone whose real, stored stage is
      // something else (Onboarding, or even Active — the external
      // recruitment pipeline can lag behind real progress) but whose
      // career_applications.board_stage OR rec_recruit/rec_stage.name reads
      // "Probation" is dual-listed on the Probation list (see [stage]/page.tsx)
      // and must be reachable at /probation/employee/[id] there, rendered
      // with the Probation profile template below, not their real stage's
      // one, and not a 404. (b) same idea for Onboarding — a real
      // Probation/Active-stage Full-Time person still dual-listed there, or a
      // Pre-stage candidate whose resolved start date has already passed —
      // this second case used to only be reachable via the separate
      // [section]/page.tsx route (see its own identical isDualListedOnboardingView
      // check); ported here now that Onboarding renders from this file
      // instead. Visiting either at their real stage's own URL still renders
      // normally since found.stage === stage already matched above in that case.
      const isDualListedProbationView =
        stage === "probation" && (await getRealAccountLifecycleOverride(found))?.stage === "probation";
      const isDualListedOnboardingView =
        stage === "onboarding" &&
        ((await getRealAccountLifecycleOverride(found))?.extraStages?.includes("onboarding") ||
          (await computePreStartDatePassedRows()).some((r) => r.id === found.id));
      if (!isDualListedProbationView && !isDualListedOnboardingView) notFound();
    }
    employee = found;
    employeeDetail = await getEmployeeById(numId);
  }

  // Only Full Time employees go through Probation (js/pre-proceed.js sends
  // Part Time/Protege/Intern straight from Pre to Onboarding) — same
  // isFullTime gate StageProfileView.tsx's own history view already uses,
  // reused here to decide whether Probation/Onboarding's HR Info gets a
  // "Probation" sub-tab at all (2026-08-26, see conversation).
  const isFullTime = positionGroup(employeeDetail?.position ?? null) === "Full Time";

  // The sidebar (Branch/Dept/Position/Phone/Email) is sourced from this on
  // every stage now, same as the separate-pages route. Pre/Probation never
  // reach here with a locGroup/locCode — hasLocationLayer is false for both;
  // Onboarding does have a location layer, but this new embedded view has no
  // location-breadcrumb concept yet (a known simplification — flagged, not
  // silently dropped).
  const isActive = stage === "active";
  const isExit = stage === "exit";
  // Everything Active introduced stays visible, unchanged, at Exit too
  // (2026-08-27, see conversation — Exit's own visibleSectionKeys carries
  // Active's exact section lists forward via exitVisibleSections' own
  // ...activeVisibleSections(isFullTime) spread) — so every fetch gated on
  // isActive below now needs Exit included too, or Exit's carried-over
  // Active Employment/Disciplinary/Task/NDA-NC/Payroll tabs would render
  // with undefined data and fall through to EmployeeRecordView's own
  // "not wired up yet" placeholder instead of their real content.
  const isActiveOrExit = isActive || isExit;
  const [
    resumeInfo,
    interviewAssessment,
    referenceCheck,
    medicalCheck,
    guardianInfo,
    paymentInfo,
    documentsInfo,
    payrollInfo,
    probationInfo,
    probationDisplay,
    leaveHistory,
    achievements,
    salaryRevisions,
    promotions,
    transfers,
    trainings,
    performanceReview,
    ndaInfo,
    nonCompeteInfo,
    domesticInquiries,
    suspensionLetters,
    showcauseWarningLetters,
    pips,
    [branches, departments],
    payslip,
    payslipHistory,
    tasks,
    resignationInfo,
    referenceLetterInfo,
    exitInterviewNoteInfo,
    knowledgeTransferChecklist,
    assetRecoveryChecklist,
    systemRevocationChecklist,
    financialSettlement,
    { locGroup, locCode },
  ] = await Promise.all([
    getResumeInfo(numId),
    getInterviewAssessment(numId, employee.fullName),
    getReferenceCheck(numId),
    getMedicalCheck(numId),
    // Personal Info's own Guardian Info/Payment sub-tabs (2026-08-26, see
    // conversation) — same queries Employee Record's Personal Info already
    // uses. Harmless (empty array/null) for any stage that doesn't reach
    // this page.
    listGuardianInfo(numId),
    getPaymentInfo(numId),
    // HR Info > Doc / Finance > Tax Info (2026-08-26, see conversation) —
    // relevant from Onboarding onward (cumulative through Active/Exit);
    // skipped for Pre/Probation, same "only fetch what this stage can show"
    // convention the rest of this Promise.all already follows.
    stage === "onboarding" || isActiveOrExit ? getDocuments(numId) : Promise.resolve(undefined),
    stage === "onboarding" || isActiveOrExit ? getPayrollInfo(numId) : Promise.resolve(undefined),
    getProbationInfo(numId),
    // Needed whenever this page might show the Probation sub-tab: Probation
    // stage's own current view, or Onboarding/Active/Exit's read-only
    // history glance at an already-decided Full Time Probation record (see
    // canDecideProbation below — that glance is deliberately never
    // decision-capable). Skipped otherwise (Pre, or a non-Full-Time row that
    // never shows this tab at all) — not meaningful for a candidate either
    // way (isCandidate is only ever reachable at stage="pre"/"onboarding",
    // and a genuine onboarding_candidate row has no real probation record to
    // look back on).
    stage === "probation" || ((stage === "onboarding" || isActiveOrExit) && isFullTime && !isCandidate)
      ? getProbationDisplayInfo(numId, employee.fullName)
      : Promise.resolve(undefined),
    // Active Employment's 6 sub-tabs + HR Info's new "NDA / NC" + Finance's
    // new "payroll" + Disciplinary's 4 sub-tabs (2026-08-26, see
    // conversation) — introduced at Active, carried forward unchanged into
    // Exit too, same real queries/data [section]/page.tsx already fetches
    // for Active/Exit; ported here since both now render from this file.
    // Skipped for every earlier stage, same convention as above.
    isActiveOrExit ? listLeaveHistory(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listAchievements(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listSalaryRevisions(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listPromotions(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listTransfers(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listTrainings(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listPerformanceReviews(numId) : Promise.resolve(undefined),
    isActiveOrExit ? getNda(numId) : Promise.resolve(undefined),
    isActiveOrExit ? getNonCompete(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listDomesticInquiries(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listSuspensionLetters(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listShowcauseWarningLetters(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listPips(numId) : Promise.resolve(undefined),
    // Transfer's From/To dropdowns.
    isActiveOrExit ? Promise.all([listBranches(), listDepartments()]) : Promise.resolve([undefined, undefined] as const),
    isActiveOrExit ? getPayslip(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listPayslipHistory(numId) : Promise.resolve(undefined),
    // Task tab (2026-08-27, see conversation) — same listEmployeeTasks()
    // data the real Employee Record page's own Task tab already uses;
    // resolves to { pending: [], overdue: [] } rather than undefined/null
    // when this user has no Task Manager account, so `undefined` here still
    // means "not fetched" (Pre/Probation/Onboarding), never "fetched but
    // empty" (Active/Exit).
    isActiveOrExit ? listEmployeeTasks(numId) : Promise.resolve(undefined),
    // Offboarding's own 7 tabs (2026-08-27, see conversation) — Exit-only,
    // same real queries [section]/page.tsx already used for Exit.
    isExit ? getResignation(numId) : Promise.resolve(undefined),
    isExit ? getReferenceLetter(numId) : Promise.resolve(undefined),
    isExit ? getExitInterviewNote(numId) : Promise.resolve(undefined),
    isExit ? getKnowledgeTransferChecklist(numId) : Promise.resolve(undefined),
    isExit ? getAssetRecoveryChecklist(numId) : Promise.resolve(undefined),
    isExit ? getSystemRevocationChecklist(numId) : Promise.resolve(undefined),
    isExit ? getFinancialSettlement(numId) : Promise.resolve(undefined),
    searchParams,
  ]);
  const locationGroup = locGroup === "branch" || locGroup === "department" ? locGroup : null;
  const locationName = await resolveLocationName(locationGroup, locCode ?? null);

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;
  const canDecideProbation = ["hr", "superadmin"].includes(userRole.toLowerCase());
  // Gates the "+ Add Item" affordance on Offboarding's 3 Clearance
  // checklists — same role check as canDecideProbation above, reused per
  // the same convention [section]/page.tsx's own canAddChecklistItem
  // already follows.
  const canAddChecklistItem = canDecideProbation;
  // A CEO account can only edit their OWN employee profile — enforced
  // server-side in employeeRecordActions.ts via requireNotCeoUnlessOwnProfile
  // (see requireEmployeeInScope). This is the cosmetic mirror: hide every
  // panel's Edit/Save toggle when a CEO is looking at someone else's
  // profile, so they don't see a button that would only ever 403.
  const canEdit = userRole.toLowerCase() !== "ceo" || String(employee.id) === (session.user as { id?: string }).id;

  // Pre, Probation, Onboarding, Active, and now Exit (2026-08-27, see
  // conversation — Exit added this round, the last stage) — all five fully
  // discard StageProfileView's own rail/group UI in favor of reusing the
  // actual Employee Record component/tree, each restricted to its own
  // stage-appropriate subset of tabs (visibleSectionKeys) and switching
  // top-level Personal Info/HR Info/Finance/Active Employment/Disciplinary/
  // Task/Offboarding tabs via client state rather than real navigation
  // (categoryNavigationMode="client") since all five stay on this one URL.
  // StageProfileView.tsx's own Pre/Probation/Onboarding/Exit-specific render
  // blocks and stageProfileConfig.ts's section lists are left in place,
  // unused — per explicit decision, not cleaned up yet. Old bookmarked
  // Onboarding/Active/Exit section URLs still resolve via
  // [section]/page.tsx as a vestigial fallback.
  if (stage === "pre" || stage === "probation" || stage === "onboarding" || isActiveOrExit) {
    const visibleSectionKeys = isExit
      ? exitVisibleSections(isFullTime)
      : isActive
        ? activeVisibleSections(isFullTime)
        : stage === "pre"
          ? PRE_VISIBLE_SECTIONS
          : stage === "probation"
            ? probationVisibleSections(isFullTime)
            : onboardingVisibleSections(isFullTime);
    const breadcrumbLabel = isExit
      ? "Exit"
      : isActive
        ? "Active"
        : stage === "pre"
          ? "Pre"
          : stage === "probation"
            ? "Probation"
            : "Onboarding";
    // Red dot + default-tab (2026-08-26, see conversation) — newSectionKeys
    // is per-stage (Pre has none); dotSectionKeys narrows that down to just
    // the ones still genuinely empty; the default category/sectionKey opens
    // straight on the first new section instead of Personal Info, falling
    // back to Personal Info when there's nothing new to prioritize.
    const newSectionKeys = isExit
      ? exitNewSections()
      : isActive
        ? activeNewSections()
        : stage === "pre"
          ? PRE_NEW_SECTIONS
          : stage === "probation"
            ? probationNewSections(isFullTime)
            : onboardingNewSections();
    const dotSectionKeys = new Set(
      newSectionKeys.filter((key) =>
        isSectionEmpty(key, {
          probationInfo,
          documentsInfo,
          payrollInfo,
          ndaInfo,
          nonCompeteInfo,
          salaryRevisions,
          payslip,
          payslipHistory,
          leaveHistory,
          performanceReview,
          trainings,
          promotions,
          transfers,
          achievements,
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
        }),
      ),
    );
    const dotCategoryOnlyKeys = entirelyNewCategories(visibleSectionKeys, newSectionKeys);
    const defaultTarget = firstNewSection(newSectionKeys) ?? { categoryKey: "personal-info", sectionKey: "personal-info" };
    return (
      <AppShell email={userEmail} role={userRole} name={userName}>
        <EmployeeRecordView
          employeeId={employee.id}
          employeeName={employee.fullName}
          category={findRecordCategory(defaultTarget.categoryKey)!}
          sectionKey={defaultTarget.sectionKey}
          position={employeeDetail?.position}
          branchName={employeeDetail?.branchName}
          departmentName={employeeDetail?.departmentName}
          stage={stage}
          employeeDetail={employeeDetail}
          resumeInfo={resumeInfo}
          interviewAssessment={interviewAssessment}
          referenceCheck={referenceCheck}
          medicalCheck={medicalCheck}
          guardianInfo={guardianInfo}
          paymentInfo={paymentInfo}
          documentsInfo={documentsInfo}
          payrollInfo={payrollInfo}
          probationInfo={probationInfo}
          probationDisplay={probationDisplay}
          // Onboarding/Active's Probation sub-tab is a read-only history
          // glance at a decision already made at the Probation stage — same
          // rule StageProfileView.tsx's own history view already enforces
          // (decideProbationOutcome is never wired up from a later stage's
          // glance at an earlier one).
          canDecideProbation={stage === "probation" ? canDecideProbation : false}
          canEdit={canEdit}
          visibleSectionKeys={visibleSectionKeys}
          categoryNavigationMode="client"
          basePath={`/employee-folder/${stage}/employee/${employee.id}`}
          breadcrumbLabel={breadcrumbLabel}
          dotSectionKeys={dotSectionKeys}
          dotCategoryOnlyKeys={dotCategoryOnlyKeys}
          ndaInfo={ndaInfo}
          nonCompeteInfo={nonCompeteInfo}
          salaryRevisions={salaryRevisions}
          payslip={payslip}
          payslipHistory={payslipHistory}
          leaveHistory={leaveHistory}
          performanceReview={performanceReview}
          trainings={trainings}
          promotions={promotions}
          transfers={transfers}
          branches={branches}
          departments={departments}
          achievements={achievements}
          domesticInquiries={domesticInquiries}
          suspensionLetters={suspensionLetters}
          showcauseWarningLetters={showcauseWarningLetters}
          pips={pips}
          tasks={tasks}
          resignationInfo={resignationInfo}
          referenceLetterInfo={referenceLetterInfo}
          exitInterviewNoteInfo={exitInterviewNoteInfo}
          knowledgeTransferChecklist={knowledgeTransferChecklist}
          assetRecoveryChecklist={assetRecoveryChecklist}
          systemRevocationChecklist={systemRevocationChecklist}
          financialSettlement={financialSettlement}
          canAddChecklistItem={canAddChecklistItem}
        />
      </AppShell>
    );
  }

  // Genuinely unreachable: pre/probation/onboarding/active/exit all return
  // above — there's no real stage value left that reaches this point (every
  // EmployeeStage is one of these five). A defensive 404 rather than
  // silently rendering the wrong template if that guard's own logic ever
  // changes.
  notFound();
}
