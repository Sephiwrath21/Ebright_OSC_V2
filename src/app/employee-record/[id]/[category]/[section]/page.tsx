import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeRecordView from "@/app/components/EmployeeRecordView";
import {
  getEmployeeById,
  getEmployeeOverviewRowById,
  listLeaveHistory,
  getResumeInfo,
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
  getPerformanceReview,
  getPayslip,
  listBranches,
  listDepartments,
} from "@/lib/employeeQueries";
import { findRecordCategory } from "@/lib/employeeRecordConfig";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string; category: string; section: string }>;
}

const PERSONAL_INFO_SECTIONS = new Set(["personal-info", "payment", "emergency-contact"]);

export default async function EmployeeRecordSectionPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { id, category, section } = await params;
  const cat = findRecordCategory(category);
  if (!cat) notFound();
  if (!cat.sections.some((s) => s.key === section)) notFound();

  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const employee = await getEmployeeOverviewRowById(numId);
  if (!employee) notFound();

  // Personal Info's own 3 data sections (not Guardian Info) map cleanly onto
  // user_profile/bank_details/emergency_contact, already assembled by
  // getEmployeeById elsewhere in the app. Active Employment > Leave reuses
  // the same leave_request source as the Active-stage MC/Leave tab. Finance >
  // Tax Info also needs employeeDetail — its Bank Details subsection reuses
  // bank_details (already assembled onto EmployeeDetailFull), same as
  // Payment & Bank Info.
  const needsEmployeeDetail =
    (category === "personal-info" && PERSONAL_INFO_SECTIONS.has(section)) || (category === "finance" && section === "tax-info");
  const needsLocationOptions = category === "active-employment" && section === "transfer";

  // Every section's data fetch is independent (keyed only by numId, at most
  // one or two are ever real queries on a given page — the rest resolve
  // immediately) but were previously awaited one at a time, which serialized
  // the odd case where two conditions both apply (e.g. Finance > Tax Info
  // needs both employeeDetail and payrollInfo). Batched into one Promise.all
  // so they run concurrently instead.
  const [
    employeeDetail,
    leaveHistory,
    resumeInfo,
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
  ] = await Promise.all([
    needsEmployeeDetail ? getEmployeeById(numId) : Promise.resolve(null),
    category === "active-employment" && section === "leave" ? listLeaveHistory(numId) : Promise.resolve(undefined),
    category === "hr-info" && section === "resume" ? getResumeInfo(numId) : Promise.resolve(undefined),
    category === "hr-info" && section === "reference" ? getReferenceCheck(numId) : Promise.resolve(undefined),
    category === "hr-info" && section === "medical-check" ? getMedicalCheck(numId) : Promise.resolve(undefined),
    category === "hr-info" && section === "handbook" ? getDocuments(numId) : Promise.resolve(undefined),
    category === "finance" && section === "tax-info" ? getPayrollInfo(numId) : Promise.resolve(undefined),
    category === "active-employment" && section === "cert" ? listAchievements(numId) : Promise.resolve(undefined),
    category === "finance" && section === "payroll" ? listSalaryRevisions(numId) : Promise.resolve(undefined),
    category === "active-employment" && section === "promotion" ? listPromotions(numId) : Promise.resolve(undefined),
    needsLocationOptions ? listTransfers(numId) : Promise.resolve(undefined),
    needsLocationOptions ? Promise.all([listBranches(), listDepartments()]) : Promise.resolve([undefined, undefined] as const),
    category === "active-employment" && section === "training" ? listTrainings(numId) : Promise.resolve(undefined),
    category === "hr-info" && section === "nda-nc" ? getNda(numId) : Promise.resolve(undefined),
    category === "hr-info" && section === "nda-nc" ? getNonCompete(numId) : Promise.resolve(undefined),
    category === "disciplinary" && section === "domestic-inquiry" ? listDomesticInquiries(numId) : Promise.resolve(undefined),
    category === "disciplinary" && section === "suspension" ? listSuspensionLetters(numId) : Promise.resolve(undefined),
    category === "disciplinary" && section === "showcause" ? listShowcauseWarningLetters(numId) : Promise.resolve(undefined),
    category === "disciplinary" && section === "pip" ? listPips(numId) : Promise.resolve(undefined),
    category === "personal-info" && section === "guardian-info" ? listGuardianInfo(numId) : Promise.resolve(undefined),
    category === "personal-info" && section === "payment" ? getPaymentInfo(numId) : Promise.resolve(undefined),
    category === "active-employment" && section === "performance-review" ? getPerformanceReview(numId) : Promise.resolve(undefined),
    category === "finance" && section === "payroll" ? getPayslip(numId) : Promise.resolve(undefined),
  ]);

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeRecordView
        employeeId={employee.id}
        employeeName={employee.fullName}
        category={cat}
        sectionKey={section}
        position={employee.position}
        branchName={employee.branchName}
        departmentName={employee.departmentName}
        stage={employee.stage}
        employeeDetail={employeeDetail}
        leaveHistory={leaveHistory}
        resumeInfo={resumeInfo}
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
      />
    </AppShell>
  );
}
