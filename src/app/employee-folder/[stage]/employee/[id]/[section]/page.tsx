import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import StageProfileView from "@/app/components/StageProfileView";
import {
  isEmployeeStage,
  listEmployeeOverviewRows,
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
  getResignation,
  getReferenceLetter,
  getExitInterviewNote,
  resolveLocationName,
} from "@/lib/employeeQueries";
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

  const rows = await listEmployeeOverviewRows();
  const employee = rows.find((r) => r.id === numId && r.stage === stage);
  if (!employee) notFound();

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

  const leaveHistory = activeOrAfter ? await listLeaveHistory(numId) : undefined;
  const employeeDetail = await getEmployeeById(numId);
  const resumeInfo = await getResumeInfo(numId);
  const interviewAssessment = await getInterviewAssessment(numId);
  const referenceCheck = await getReferenceCheck(numId);
  const medicalCheck = await getMedicalCheck(numId);
  const probationInfo = await getProbationInfo(numId);
  const documentsInfo = await getDocuments(numId);
  const payrollInfo = await getPayrollInfo(numId);
  const achievements = activeOrAfter ? await listAchievements(numId) : undefined;
  const salaryRevisions = activeOrAfter ? await listSalaryRevisions(numId) : undefined;
  const promotions = activeOrAfter ? await listPromotions(numId) : undefined;
  const transfers = activeOrAfter ? await listTransfers(numId) : undefined;
  const trainings = activeOrAfter ? await listTrainings(numId) : undefined;
  const ndaInfo = activeOrAfter ? await getNda(numId) : undefined;
  const nonCompeteInfo = activeOrAfter ? await getNonCompete(numId) : undefined;
  const disciplinarySummary = activeOrAfter ? await listDisciplinarySummary(numId) : undefined;
  // Resignation/Reference Letter/Exit Interview Notes are Exit's own tabs
  // only — Exit is terminal (nothing comes after it), so unlike Active's
  // tabs above these never need to be fetched for an earlier stage's history.
  const isExit = stage === "exit";
  const resignationInfo = isExit ? await getResignation(numId) : undefined;
  const referenceLetterInfo = isExit ? await getReferenceLetter(numId) : undefined;
  const exitInterviewNoteInfo = isExit ? await getExitInterviewNote(numId) : undefined;

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

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
        documentsInfo={documentsInfo}
        payrollInfo={payrollInfo}
        achievements={achievements}
        salaryRevisions={salaryRevisions}
        promotions={promotions}
        transfers={transfers}
        trainings={trainings}
        ndaInfo={ndaInfo}
        nonCompeteInfo={nonCompeteInfo}
        disciplinarySummary={disciplinarySummary}
        resignationInfo={resignationInfo}
        referenceLetterInfo={referenceLetterInfo}
        exitInterviewNoteInfo={exitInterviewNoteInfo}
        locationGroup={locationName ? locationGroup : null}
        locationCode={locationName ? locCode ?? null : null}
        locationName={locationName}
      />
    </AppShell>
  );
}
