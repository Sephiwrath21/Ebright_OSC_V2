import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeRecordView from "@/app/components/EmployeeRecordView";
import {
  getEmployeeById,
  getEmployeeOverviewRowById,
  getOnboardingCandidateDetail,
  type EmployeeStage,
  listLeaveHistory,
  getResumeInfo,
  getInterviewAssessment,
  getReferenceCheck,
  getMedicalCheck,
  getProbationInfo,
  getDocuments,
  getPayrollInfo,
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
  listGuardianInfo,
  getPaymentInfo,
  getPayslip,
  listPayslipHistory,
  listBranches,
  listDepartments,
  listEmployeeTasks,
  getResignation,
  getReferenceLetter,
  getExitInterviewNote,
  getKnowledgeTransferChecklist,
  getAssetRecoveryChecklist,
  getSystemRevocationChecklist,
  getFinancialSettlement,
} from "@/lib/employeeQueries";
import { findRecordCategory } from "@/lib/employeeRecordConfig";
import { positionGroup } from "@/lib/employeeStages";
import { getRealAccountLifecycleOverride } from "@/lib/careerApplicationSync";
import { getProbationDisplayInfo } from "@/lib/probationDecision";
import {
  PRE_VISIBLE_SECTIONS,
  PRE_NEW_SECTIONS,
  onboardingVisibleSections,
  onboardingNewSections,
  activeVisibleSections,
  activeNewSections,
  exitVisibleSections,
  exitNewSections,
  isSectionEmpty,
  entirelyNewCategories,
} from "@/lib/employeeVisibleSections";

export const dynamic = "force-dynamic";

// Employee Record's own effective-stage resolution (2026-08-27, see
// conversation) — reuses the exact same override lookup the stage-folder
// pages already use (getRealAccountLifecycleOverride), not a separate
// re-derivation. A Probation-effective employee (override.stage ===
// "probation", which per that function's own source always pairs with
// extraStages: ["onboarding"] — Probation is inherently an Onboarding
// sub-state, never reached any other way) is deliberately mapped to
// ONBOARDING's own visible/new-section functions, not a Probation-specific
// one — Onboarding's set is already the superset (its HR Info list already
// includes "probation" as a sub-tab), so showing the narrower Probation-only
// set here would be a regression relative to what Onboarding already shows.
// This mapping intentionally ignores extraStages — checking stage ===
// "probation" alone is sufficient (confirmed via the override's own source).
function normalizeStageForVisibility(stage: EmployeeStage): "pre" | "onboarding" | "active" | "exit" {
  if (stage === "probation") return "onboarding";
  if (stage === "pre" || stage === "onboarding" || stage === "active" || stage === "exit") return stage;
  return "pre";
}

function visibleSectionsForStage(stage: EmployeeStage, isFullTime: boolean): Record<string, string[]> {
  const normalized = normalizeStageForVisibility(stage);
  if (normalized === "pre") return PRE_VISIBLE_SECTIONS;
  if (normalized === "onboarding") return onboardingVisibleSections(isFullTime);
  if (normalized === "active") return activeVisibleSections(isFullTime);
  return exitVisibleSections(isFullTime);
}

// Same normalization for the red-dot "what's new" tracking — kept in sync
// with visibleSectionsForStage above rather than a separate rule, since dots
// only make sense relative to whatever set of sections is actually visible
// (a Probation-effective employee seeing Onboarding's fuller set should also
// get Onboarding's own "what's new" tracking, e.g. Doc/Tax Info, not just
// Probation's narrower "just the Probation sub-tab" one).
function newSectionsForStage(stage: EmployeeStage): string[] {
  const normalized = normalizeStageForVisibility(stage);
  if (normalized === "pre") return PRE_NEW_SECTIONS;
  if (normalized === "onboarding") return onboardingNewSections();
  if (normalized === "active") return activeNewSections();
  return exitNewSections();
}

interface Props {
  params: Promise<{ id: string; category: string; section: string }>;
}


export default async function EmployeeRecordSectionPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { id, category, section } = await params;
  const cat = findRecordCategory(category);
  if (!cat) notFound();
  if (!cat.sections.some((s) => s.key === section)) notFound();

  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  // Candidate — a future hire sourced from onboarding_candidate with no
  // real portal account yet (see getOnboardingCandidateDetail), same
  // negative-sentinel (-source_id) convention the Pre-stage profile flow
  // already uses (see [stage]/employee/[id]/page.tsx). Every other
  // section's own table lookup below (getResumeInfo, listLeaveHistory, ...)
  // already no-ops safely for a user_id that doesn't exist, so only where
  // the employee summary/employeeDetail comes from needs special-casing —
  // getOnboardingCandidateDetail already returns the full EmployeeDetailFull
  // shape (id/fullName/position/branchName/departmentName included, every
  // real-table field null), so it doubles as both `employee` and
  // `employeeDetail` directly, no separate real-account lookup needed.
  const isCandidate = numId < 0;
  let employee: { id: number; fullName: string; position: string | null; branchName: string | null; departmentName: string | null; employeeId: string | null };
  let employeeStage: EmployeeStage;
  let candidateDetail: Awaited<ReturnType<typeof getOnboardingCandidateDetail>> = null;
  if (isCandidate) {
    candidateDetail = await getOnboardingCandidateDetail(-numId);
    if (!candidateDetail) notFound();
    employee = candidateDetail;
    employeeStage = "pre";
  } else {
    const found = await getEmployeeOverviewRowById(numId);
    if (!found) notFound();
    employee = found;
    employeeStage = found.stage;
  }

  // Effective stage (2026-08-27, see conversation) — this page used to show
  // every category/section unconditionally (visibleSectionKeys undefined);
  // now it shows the exact same cumulative set the employee's own
  // stage-folder profile would, which requires resolving the SAME
  // dual-listing override the stage-folder pages already use rather than
  // trusting the raw stored stage. getRealAccountLifecycleOverride is a
  // no-op (undefined) for candidates and for anyone whose raw stage isn't
  // onboarding/probation/active — employeeStage is already correct in
  // those cases.
  const override = isCandidate ? undefined : await getRealAccountLifecycleOverride({ ...employee, stage: employeeStage });
  const effectiveStage: EmployeeStage = override?.stage ?? employeeStage;
  const isFullTime = positionGroup(employee.position) === "Full Time";
  const visibleSectionKeys = visibleSectionsForStage(effectiveStage, isFullTime);
  const newSectionKeys = newSectionsForStage(effectiveStage);
  const isOnboardingOrLater = normalizeStageForVisibility(effectiveStage) !== "pre";
  const isActiveOrExit =
    normalizeStageForVisibility(effectiveStage) === "active" || normalizeStageForVisibility(effectiveStage) === "exit";
  const isExit = normalizeStageForVisibility(effectiveStage) === "exit";

  // Personal Info's 4 sub-sections (Personal Info/Guardian Info/Payment/
  // Emergency Contact), HR Info's 7 (Resume/CV, Offer Letter, Hiring Notes,
  // Reference, Medical Check, NDA/NC, Employee Handbook), and Finance's 2
  // (Payroll/Payslip, Tax Info) all render together now, regardless of
  // which one is in the URL — see the PageEditProvider rollout (2026-08-13,
  // conversation): EmployeeRecordView manages its own client-side "which
  // sub-tab is visible" state for these categories instead of navigating
  // between routes, so every section's data needs to be fetched together
  // whenever the category is open, not just the one the URL happens to
  // name. Personal Info was the pilot, HR Info was Batch 2, Finance is
  // Batch 3 (Onboarding/Exit follow in later batches). Active Employment >
  // Leave reuses the same leave_request source as the Active-stage MC/Leave
  // tab. Finance also needs employeeDetail unconditionally now (not just
  // for Tax Info specifically) — OnboardingPayrollPanel's showBankDetails
  // subsection reuses bank_details (already assembled onto
  // EmployeeDetailFull), same as Payment & Bank Info; Payroll/Payslip
  // itself doesn't read employeeDetail, but the two now share one fetch
  // batch. Skipped entirely for a candidate — candidateDetail above already
  // covers it, and there's no real users row to query anyway.
  //
  // Gating switched from "which category is the URL currently on" to "is
  // this section relevant to the employee's own effective stage"
  // (2026-08-27, see conversation) — red dots need every visible section's
  // emptiness checked regardless of which one the URL happens to be on, not
  // just the one currently being viewed. Personal Info and HR Info's base 5
  // are visible from Pre onward for every stage this page can show, so they
  // stay unconditional; Finance/Active Employment/Disciplinary/Task/
  // Offboarding are still gated, now on effective stage instead of the URL.
  // HR Info added (2026-08-26, see conversation) — its Offer Letter tab
  // (OfferLetterPanel) needs employeeDetail.offerLetterFileId, same field
  // Personal Info's own employeeDetail fetch already carries. Unconditional
  // for real accounts now (2026-08-27) — Personal Info and HR Info are
  // visible from Pre onward for every stage this page can show, so there's
  // no longer a category this could be skipped for.
  const needsEmployeeDetail = !isCandidate;
  const needsLocationOptions = isActiveOrExit;

  // Every section's data fetch is independent (keyed only by numId, at most
  // one or two are ever real queries on a given page — the rest resolve
  // immediately) but were previously awaited one at a time, which serialized
  // the odd case where two conditions both apply (e.g. Finance > Tax Info
  // needs both employeeDetail and payrollInfo). Batched into one Promise.all
  // so they run concurrently instead.
  const [
    employeeDetailFetched,
    leaveHistory,
    resumeInfo,
    interviewAssessment,
    referenceCheck,
    medicalCheck,
    probationInfo,
    probationDisplay,
    documentsInfo,
    payrollInfo,
    achievements,
    salaryRevisions,
    promotions,
    transfers,
    [branches, departments],
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
    tasks,
    resignationInfo,
    referenceLetterInfo,
    exitInterviewNoteInfo,
    knowledgeTransferChecklist,
    assetRecoveryChecklist,
    systemRevocationChecklist,
    financialSettlement,
  ] = await Promise.all([
    needsEmployeeDetail ? getEmployeeById(numId) : Promise.resolve(null),
    isActiveOrExit ? listLeaveHistory(numId) : Promise.resolve(undefined),
    getResumeInfo(numId),
    getInterviewAssessment(numId, employee.fullName),
    getReferenceCheck(numId),
    getMedicalCheck(numId),
    getProbationInfo(numId),
    // Read-only history glance, same as every stage-folder page's own
    // Onboarding/Active/Exit view of a decision made back at Probation —
    // this page never exposes the Confirm/Extend/Stop decision itself (see
    // canDecideProbation below, always false here).
    isOnboardingOrLater && isFullTime && !isCandidate
      ? getProbationDisplayInfo(numId, employee.fullName)
      : Promise.resolve(undefined),
    isOnboardingOrLater ? getDocuments(numId) : Promise.resolve(undefined),
    isOnboardingOrLater ? getPayrollInfo(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listAchievements(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listSalaryRevisions(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listPromotions(numId) : Promise.resolve(undefined),
    needsLocationOptions ? listTransfers(numId) : Promise.resolve(undefined),
    needsLocationOptions ? Promise.all([listBranches(), listDepartments()]) : Promise.resolve([undefined, undefined] as const),
    isActiveOrExit ? listTrainings(numId) : Promise.resolve(undefined),
    isActiveOrExit ? getNda(numId) : Promise.resolve(undefined),
    isActiveOrExit ? getNonCompete(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listDomesticInquiries(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listSuspensionLetters(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listShowcauseWarningLetters(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listPips(numId) : Promise.resolve(undefined),
    listGuardianInfo(numId),
    getPaymentInfo(numId),
    isActiveOrExit ? listPerformanceReviews(numId) : Promise.resolve(undefined),
    isActiveOrExit ? getPayslip(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listPayslipHistory(numId) : Promise.resolve(undefined),
    isActiveOrExit ? listEmployeeTasks(numId) : Promise.resolve(undefined),
    isExit ? getResignation(numId) : Promise.resolve(undefined),
    isExit ? getReferenceLetter(numId) : Promise.resolve(undefined),
    isExit ? getExitInterviewNote(numId) : Promise.resolve(undefined),
    isExit ? getKnowledgeTransferChecklist(numId) : Promise.resolve(undefined),
    isExit ? getAssetRecoveryChecklist(numId) : Promise.resolve(undefined),
    isExit ? getSystemRevocationChecklist(numId) : Promise.resolve(undefined),
    isExit ? getFinancialSettlement(numId) : Promise.resolve(undefined),
  ]);

  // Candidates never hit the needsEmployeeDetail fetch above (it's forced
  // null), so their own employeeDetail is candidateDetail itself — already
  // the full EmployeeDetailFull shape from getOnboardingCandidateDetail.
  const employeeDetail = isCandidate ? candidateDetail : employeeDetailFetched;

  // Red dots (2026-08-27, see conversation) — same isSectionEmpty/
  // entirelyNewCategories machinery the stage-folder pages already use,
  // fed by newSectionKeys/visibleSectionKeys (both already resolved above
  // from effectiveStage) and the data just fetched.
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

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;
  const canEdit = userRole.toLowerCase() !== "ceo" || String(employee.id) === (session.user as { id?: string }).id;
  // Gates the "+ Add Item" affordance on Offboarding's 3 Clearance
  // checklists — same role check every other Clearance/Probation
  // "+ Add"/decision gate in this app already uses.
  const canAddChecklistItem = ["hr", "superadmin"].includes(userRole.toLowerCase());

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeRecordView
        employeeId={employee.id}
        canEdit={canEdit}
        employeeName={employee.fullName}
        category={cat}
        sectionKey={section}
        position={employee.position}
        branchName={employee.branchName}
        departmentName={employee.departmentName}
        stage={effectiveStage}
        employeeCode={employee.employeeId}
        employeeDetail={employeeDetail}
        leaveHistory={leaveHistory}
        resumeInfo={resumeInfo}
        interviewAssessment={interviewAssessment}
        referenceCheck={referenceCheck}
        medicalCheck={medicalCheck}
        probationInfo={probationInfo}
        probationDisplay={probationDisplay}
        // This page never exposes the Confirm/Extend/Stop decision itself —
        // same read-only-history-glance treatment every OTHER-than-the-
        // employee's-own-current-stage view already gets.
        canDecideProbation={false}
        documentsInfo={documentsInfo}
        payrollInfo={payrollInfo}
        achievements={achievements}
        salaryRevisions={salaryRevisions}
        promotions={promotions}
        transfers={transfers}
        branches={branches}
        departments={departments}
        trainings={trainings}
        ndaInfo={ndaInfo}
        nonCompeteInfo={nonCompeteInfo}
        domesticInquiries={domesticInquiries}
        suspensionLetters={suspensionLetters}
        showcauseWarningLetters={showcauseWarningLetters}
        pips={pips}
        guardianInfo={guardianInfo}
        paymentInfo={paymentInfo}
        performanceReview={performanceReview}
        payslip={payslip}
        payslipHistory={payslipHistory}
        tasks={tasks}
        resignationInfo={resignationInfo}
        referenceLetterInfo={referenceLetterInfo}
        exitInterviewNoteInfo={exitInterviewNoteInfo}
        knowledgeTransferChecklist={knowledgeTransferChecklist}
        assetRecoveryChecklist={assetRecoveryChecklist}
        systemRevocationChecklist={systemRevocationChecklist}
        financialSettlement={financialSettlement}
        canAddChecklistItem={canAddChecklistItem}
        visibleSectionKeys={visibleSectionKeys}
        dotSectionKeys={dotSectionKeys}
        dotCategoryOnlyKeys={dotCategoryOnlyKeys}
      />
    </AppShell>
  );
}
