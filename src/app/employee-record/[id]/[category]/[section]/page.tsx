import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeRecordView from "@/app/components/EmployeeRecordView";
import {
  getEmployeeById,
  listEmployeeOverviewRows,
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

  const rows = await listEmployeeOverviewRows();
  const employee = rows.find((r) => r.id === numId);
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
  const employeeDetail = needsEmployeeDetail ? await getEmployeeById(numId) : null;
  const leaveHistory = category === "active-employment" && section === "leave" ? await listLeaveHistory(numId) : undefined;
  const resumeInfo = category === "hr-info" && section === "resume" ? await getResumeInfo(numId) : undefined;
  const referenceCheck = category === "hr-info" && section === "reference" ? await getReferenceCheck(numId) : undefined;
  const medicalCheck = category === "hr-info" && section === "medical-check" ? await getMedicalCheck(numId) : undefined;
  const documentsInfo = category === "hr-info" && section === "handbook" ? await getDocuments(numId) : undefined;
  const payrollInfo = category === "finance" && section === "tax-info" ? await getPayrollInfo(numId) : undefined;
  const achievements = category === "active-employment" && section === "cert" ? await listAchievements(numId) : undefined;
  const salaryRevisions = category === "finance" && section === "payroll" ? await listSalaryRevisions(numId) : undefined;
  const promotions = category === "active-employment" && section === "promotion" ? await listPromotions(numId) : undefined;
  const transfers = category === "active-employment" && section === "transfer" ? await listTransfers(numId) : undefined;
  const trainings = category === "active-employment" && section === "training" ? await listTrainings(numId) : undefined;
  const needsNdaNc = category === "hr-info" && section === "nda-nc";
  const ndaInfo = needsNdaNc ? await getNda(numId) : undefined;
  const nonCompeteInfo = needsNdaNc ? await getNonCompete(numId) : undefined;
  const domesticInquiries =
    category === "disciplinary" && section === "domestic-inquiry" ? await listDomesticInquiries(numId) : undefined;
  const suspensionLetters =
    category === "disciplinary" && section === "suspension" ? await listSuspensionLetters(numId) : undefined;
  const showcauseWarningLetters =
    category === "disciplinary" && section === "showcause" ? await listShowcauseWarningLetters(numId) : undefined;
  const pips = category === "disciplinary" && section === "pip" ? await listPips(numId) : undefined;
  const guardianInfo = category === "personal-info" && section === "guardian-info" ? await listGuardianInfo(numId) : undefined;
  const paymentInfo = category === "personal-info" && section === "payment" ? await getPaymentInfo(numId) : undefined;
  const performanceReview =
    category === "active-employment" && section === "performance-review" ? await getPerformanceReview(numId) : undefined;
  const payslip = category === "finance" && section === "payroll" ? await getPayslip(numId) : undefined;

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
