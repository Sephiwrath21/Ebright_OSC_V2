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
  getDocuments,
  getPayrollInfo,
  listAchievements,
  listSalaryRevisions,
  listPromotions,
  listTransfers,
  listTrainings,
  getNda,
  getNonCompete,
  listDomesticInquiries,
  listSuspensionLetters,
  listShowcauseWarningLetters,
  listPips,
  listGuardianInfo,
  getPaymentInfo,
  listPerformanceReviews,
  getPayslip,
  listPayslipHistory,
  listBranches,
  listDepartments,
  listEmployeeTasks,
} from "@/lib/employeeQueries";
import { findRecordCategory } from "@/lib/employeeRecordConfig";

export const dynamic = "force-dynamic";

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
  const isPersonalInfoCategory = category === "personal-info";
  const isHrInfoCategory = category === "hr-info";
  const isFinanceCategory = category === "finance";
  // Active Employment rollout Batch 7 (2026-08-13, see conversation) — only
  // Performance Review actually registers with the page-level PageEditProvider
  // (Leave is read-only; Training/Promotion/Transfer/Cert are the same
  // RepeatableRecordSection panels excluded from this whole rollout), but all
  // 6 of its sections still render together now so switching between them
  // doesn't lose an in-progress edit/draft on any of them — same reasoning as
  // Personal Info/HR Info/Finance above, so all 6 need their data fetched
  // together too, not just the one the URL happens to name.
  const isActiveEmploymentCategory = category === "active-employment";
  const needsEmployeeDetail = !isCandidate && (isPersonalInfoCategory || isFinanceCategory);
  const needsLocationOptions = isActiveEmploymentCategory;

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
  ] = await Promise.all([
    needsEmployeeDetail ? getEmployeeById(numId) : Promise.resolve(null),
    isActiveEmploymentCategory ? listLeaveHistory(numId) : Promise.resolve(undefined),
    isHrInfoCategory ? getResumeInfo(numId) : Promise.resolve(undefined),
    isHrInfoCategory ? getInterviewAssessment(numId, employee.fullName) : Promise.resolve(undefined),
    isHrInfoCategory ? getReferenceCheck(numId) : Promise.resolve(undefined),
    isHrInfoCategory ? getMedicalCheck(numId) : Promise.resolve(undefined),
    isHrInfoCategory ? getDocuments(numId) : Promise.resolve(undefined),
    isFinanceCategory ? getPayrollInfo(numId) : Promise.resolve(undefined),
    isActiveEmploymentCategory ? listAchievements(numId) : Promise.resolve(undefined),
    isFinanceCategory ? listSalaryRevisions(numId) : Promise.resolve(undefined),
    isActiveEmploymentCategory ? listPromotions(numId) : Promise.resolve(undefined),
    needsLocationOptions ? listTransfers(numId) : Promise.resolve(undefined),
    needsLocationOptions ? Promise.all([listBranches(), listDepartments()]) : Promise.resolve([undefined, undefined] as const),
    isActiveEmploymentCategory ? listTrainings(numId) : Promise.resolve(undefined),
    isHrInfoCategory ? getNda(numId) : Promise.resolve(undefined),
    isHrInfoCategory ? getNonCompete(numId) : Promise.resolve(undefined),
    category === "disciplinary" && section === "domestic-inquiry" ? listDomesticInquiries(numId) : Promise.resolve(undefined),
    category === "disciplinary" && section === "suspension" ? listSuspensionLetters(numId) : Promise.resolve(undefined),
    category === "disciplinary" && section === "showcause" ? listShowcauseWarningLetters(numId) : Promise.resolve(undefined),
    category === "disciplinary" && section === "pip" ? listPips(numId) : Promise.resolve(undefined),
    isPersonalInfoCategory ? listGuardianInfo(numId) : Promise.resolve(undefined),
    isPersonalInfoCategory ? getPaymentInfo(numId) : Promise.resolve(undefined),
    isActiveEmploymentCategory ? listPerformanceReviews(numId) : Promise.resolve(undefined),
    isFinanceCategory ? getPayslip(numId) : Promise.resolve(undefined),
    isFinanceCategory ? listPayslipHistory(numId) : Promise.resolve(undefined),
    category === "task" ? listEmployeeTasks(numId) : Promise.resolve(undefined),
  ]);

  // Candidates never hit the needsEmployeeDetail fetch above (it's forced
  // null), so their own employeeDetail is candidateDetail itself — already
  // the full EmployeeDetailFull shape from getOnboardingCandidateDetail.
  const employeeDetail = isCandidate ? candidateDetail : employeeDetailFetched;

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;
  const canEdit = userRole.toLowerCase() !== "ceo" || String(employee.id) === (session.user as { id?: string }).id;

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
        stage={employeeStage}
        employeeCode={employee.employeeId}
        employeeDetail={employeeDetail}
        leaveHistory={leaveHistory}
        resumeInfo={resumeInfo}
        interviewAssessment={interviewAssessment}
        referenceCheck={referenceCheck}
        medicalCheck={medicalCheck}
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
      />
    </AppShell>
  );
}
