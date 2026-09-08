import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import StageProfileView from "@/app/components/StageProfileView";
import { canEditProfile } from "@/lib/employeeRecordActions";
import {
  isEmployeeStage,
  getEmployeeOverviewRowById,
  listSalaryRevisions,
  listLeaveHistory,
  getEmployeeById,
  getResumeInfo,
  getInterviewAssessment,
  getReferenceCheck,
  getMedicalCheck,
  getProbationInfo,
  getDocuments,
  getPayrollInfo,
  listAchievements,
  listPromotions,
  listTransfers,
  listTrainings,
  getNda,
  getNonCompete,
  listDisciplinarySummary,
  listDomesticInquiries,
  listSuspensionLetters,
  listShowcauseWarningLetters,
  listPips,
  getResignation,
  getReferenceLetter,
  getExitInterviewNote,
  getKnowledgeTransferChecklist,
  getAssetRecoveryChecklist,
  getSystemRevocationChecklist,
  getFinancialSettlement,
  resolveLocationName,
  listBranches,
  listDepartments,
} from "@/lib/employeeQueries";
import { getRealAccountLifecycleOverride, computePreStartDatePassedRows } from "@/lib/careerApplicationSync";
import { getProbationDisplayInfo } from "@/lib/probationDecision";
import { STAGE_PROFILE_CONFIG } from "@/lib/stageProfileConfig";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ stage: string; id: string; section: string }>;
  searchParams: Promise<{ locGroup?: string; locCode?: string }>;
}

export default async function EmployeeFolderProfileSectionPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { stage, id, section } = await params;
  if (!isEmployeeStage(stage)) notFound();
  const config = STAGE_PROFILE_CONFIG[stage];
  if (config.profileMode !== "separate-pages") notFound();
  if (!config.sections.some((s) => s.key === section)) notFound();

  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const employee = await getEmployeeOverviewRowById(numId);
  if (!employee) notFound();
  if (employee.stage !== stage) {
    // The allowed mismatches here: (a) a real Probation-stage Full-Time
    // person, or a real Active-stage Full-Time person whose recruitment
    // pipeline still reads "Probation", is also dual-listed on the
    // Onboarding list (see [stage]/page.tsx and
    // computeOnboardingDualListedRows); (b) a real Pre-stage person whose
    // resolved start date has already passed — they've actually started,
    // per the Pre list's own definition (see computePreStartDatePassedRows)
    // — is dual-listed there too. Both must be reachable at
    // /onboarding/employee/[id]/... there, rendered with the Onboarding
    // profile template below — not a 404. Visiting them at their real
    // stage's own URL (e.g. /pre/employee/[id]) still shows that stage's
    // content, unaffected by this.
    const isDualListedOnboardingView =
      stage === "onboarding" &&
      ((await getRealAccountLifecycleOverride(employee))?.extraStages?.includes("onboarding") ||
        (await computePreStartDatePassedRows()).some((r) => r.id === employee.id));
    if (!isDualListedOnboardingView) notFound();
  }

  const { locGroup, locCode } = await searchParams;
  const locationGroup = locGroup === "branch" || locGroup === "department" ? locGroup : null;
  const locationName = await resolveLocationName(locationGroup, locCode ?? null);

  // Real schema backing so far: salary_revision/achievement/promotion/
  // transfer/training/nda/non_compete/(4 disciplinary tables) (Active's own
  // tabs), leave_request (Active/MC-Leave), emergency_contact (Onboarding/
  // Emergency Contact), resume/interview_assessment/reference_check/
  // medical_check (Pre's own tabs, reachable from Onboarding/Active/Exit via
  // history), probation (Probation's own tab, same), documents/payroll
  // (Onboarding's own tabs, reachable from Active/Exit via history) —
  // everything else stays a placeholder. Active's own tabs + leaveHistory are
  // fetched whenever the current stage is at or after Active (not just on
  // that data's own section) since Active/Exit's cumulative history can also
  // land on any of them via the history tabs. employeeDetail/resumeInfo/
  // interviewAssessment/referenceCheck/medicalCheck/probationInfo/
  // documentsInfo/payrollInfo are always fetched — every stage's sidebar now
  // shows Branch/Dept/Position/Phone/Email from employeeDetail, the
  // Probation-history visibility gate (Full Time only) reads its `position`
  // field regardless of stage, and each of Pre's/Probation's/Onboarding's
  // own history tabs can be reached from any of these three stages.
  const stageOrder = ["pre", "probation", "onboarding", "active", "exit"] as const;
  const isAtOrAfter = (owner: (typeof stageOrder)[number]) => stageOrder.indexOf(stage) >= stageOrder.indexOf(owner);
  const activeOrAfter = isAtOrAfter("active");
  // Resignation/Reference Letter/Exit Interview Notes are Exit's own tabs
  // only — Exit is terminal (nothing comes after it), so unlike Active's
  // tabs above these never need to be fetched for an earlier stage's history.
  const isExit = stage === "exit";

  // All of these are independent (keyed only by numId, none depends on
  // another's result) but were previously awaited one at a time — up to 18
  // sequential round trips on every single Active/Onboarding/Exit profile
  // load, regardless of which section was actually being viewed. Batched
  // into one Promise.all so they run concurrently instead.
  const [
    leaveHistory,
    employeeDetail,
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
  ] = await Promise.all([
    activeOrAfter ? listLeaveHistory(numId) : Promise.resolve(undefined),
    getEmployeeById(numId),
    getResumeInfo(numId),
    getInterviewAssessment(numId, employee.fullName),
    getReferenceCheck(numId),
    getMedicalCheck(numId),
    getProbationInfo(numId),
    // Only ever reachable here via a Probation history tab (this route is
    // "separate-pages" stages only — Active/Onboarding/Exit — Probation
    // itself uses "in-page-tabs", see [stage]/employee/[id]/page.tsx)
    // decideProbationOutcome is deliberately NOT wired up from this history
    // view (canDecideProbation is hardcoded false below) — decisions are
    // only made from the employee's own current-stage Probation view, not a
    // read-only history glance from a later stage.
    getProbationDisplayInfo(numId, employee.fullName),
    getDocuments(numId),
    getPayrollInfo(numId),
    activeOrAfter ? listAchievements(numId) : Promise.resolve(undefined),
    activeOrAfter ? listSalaryRevisions(numId) : Promise.resolve(undefined),
    activeOrAfter ? listPromotions(numId) : Promise.resolve(undefined),
    activeOrAfter ? listTransfers(numId) : Promise.resolve(undefined),
    activeOrAfter ? Promise.all([listBranches(), listDepartments()]) : Promise.resolve([undefined, undefined] as const),
    activeOrAfter ? listTrainings(numId) : Promise.resolve(undefined),
    activeOrAfter ? getNda(numId) : Promise.resolve(undefined),
    activeOrAfter ? getNonCompete(numId) : Promise.resolve(undefined),
    activeOrAfter ? listDisciplinarySummary(numId) : Promise.resolve(undefined),
    // Raw per-type rows, alongside the merged summary above — needed so
    // clicking a summary row can open that record's own real edit modal
    // (2026-08-13, see conversation), not just display it read-only.
    activeOrAfter ? listDomesticInquiries(numId) : Promise.resolve(undefined),
    activeOrAfter ? listSuspensionLetters(numId) : Promise.resolve(undefined),
    activeOrAfter ? listShowcauseWarningLetters(numId) : Promise.resolve(undefined),
    activeOrAfter ? listPips(numId) : Promise.resolve(undefined),
    isExit ? getResignation(numId) : Promise.resolve(undefined),
    isExit ? getReferenceLetter(numId) : Promise.resolve(undefined),
    isExit ? getExitInterviewNote(numId) : Promise.resolve(undefined),
    isExit ? getKnowledgeTransferChecklist(numId) : Promise.resolve(undefined),
    isExit ? getAssetRecoveryChecklist(numId) : Promise.resolve(undefined),
    isExit ? getSystemRevocationChecklist(numId) : Promise.resolve(undefined),
    isExit ? getFinancialSettlement(numId) : Promise.resolve(undefined),
  ]);

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;
  // Gates the "+ Add Item" affordance on Exit's 3 Clearance checklists —
  // same role check as canDecideProbation above, reused per explicit
  // instruction (see conversation) rather than a new one. Re-checked
  // server-side by addKnowledgeTransferItem/etc regardless.
  const canAddChecklistItem = ["hr", "superadmin"].includes(userRole.toLowerCase());
  // A CEO account can only edit their OWN employee profile — enforced
  // server-side in employeeRecordActions.ts via requireNotCeoUnlessOwnProfile
  // (see requireEmployeeInScope). This is the cosmetic mirror: hide every
  // panel's Edit/Save toggle when a CEO is looking at someone else's
  // profile, so they don't see a button that would only ever 403. Fresh DB
  // lookup (2026-08-28, see conversation), not session.user.role/id — those
  // are only as fresh as the JWT was at login time, so a session issued
  // before this account's role existed would silently fail open.
  const canEdit = await canEditProfile(employee.id);

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <StageProfileView
        stage={stage}
        employeeId={employee.id}
        employeeName={employee.fullName}
        activeSection={section}
        leaveHistory={leaveHistory}
        employeeDetail={employeeDetail}
        resumeInfo={resumeInfo}
        interviewAssessment={interviewAssessment}
        referenceCheck={referenceCheck}
        medicalCheck={medicalCheck}
        probationInfo={probationInfo}
        probationDisplay={probationDisplay}
        canDecideProbation={false}
        canEdit={canEdit}
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
        disciplinarySummary={disciplinarySummary}
        domesticInquiries={domesticInquiries}
        suspensionLetters={suspensionLetters}
        showcauseWarningLetters={showcauseWarningLetters}
        pips={pips}
        resignationInfo={resignationInfo}
        referenceLetterInfo={referenceLetterInfo}
        exitInterviewNoteInfo={exitInterviewNoteInfo}
        knowledgeTransferChecklist={knowledgeTransferChecklist}
        assetRecoveryChecklist={assetRecoveryChecklist}
        systemRevocationChecklist={systemRevocationChecklist}
        financialSettlement={financialSettlement}
        canAddChecklistItem={canAddChecklistItem}
        locationGroup={locationName ? locationGroup : null}
        locationCode={locationName ? locCode ?? null : null}
        locationName={locationName}
      />
    </AppShell>
  );
}
