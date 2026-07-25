import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import StageProfileView from "@/app/components/StageProfileView";
import {
  isEmployeeStage,
  listEmployeeOverviewRows,
  getEmployeeById,
  getResumeInfo,
  getInterviewAssessment,
  getReferenceCheck,
  getMedicalCheck,
  getProbationInfo,
  resolveLocationName,
} from "@/lib/employeeQueries";
import { STAGE_PROFILE_CONFIG } from "@/lib/stageProfileConfig";

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

  if (config.profileMode === "separate-pages") {
    const { locGroup, locCode } = await searchParams;
    const qs = locGroup && locCode ? `?locGroup=${locGroup}&locCode=${locCode}` : "";
    redirect(`/employee-folder/${stage}/employee/${id}/${config.sections[0].key}${qs}`);
  }

  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const rows = await listEmployeeOverviewRows();
  const employee = rows.find((r) => r.id === numId && r.stage === stage);
  if (!employee) notFound();

  // The sidebar (Branch/Dept/Position/Phone/Email) is sourced from this on
  // every stage now, same as the separate-pages route. Pre/Probation never
  // reach here with a locGroup/locCode — hasLocationLayer is false for both,
  // so there's no branch/dept-scoped namelist to have arrived from.
  const [employeeDetail, resumeInfo, interviewAssessment, referenceCheck, medicalCheck, probationInfo, { locGroup, locCode }] =
    await Promise.all([
      getEmployeeById(numId),
      getResumeInfo(numId),
      getInterviewAssessment(numId),
      getReferenceCheck(numId),
      getMedicalCheck(numId),
      getProbationInfo(numId),
      searchParams,
    ]);
  const locationGroup = locGroup === "branch" || locGroup === "department" ? locGroup : null;
  const locationName = await resolveLocationName(locationGroup, locCode ?? null);

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <StageProfileView
        stage={stage}
        employeeId={employee.id}
        employeeName={employee.fullName}
        activeSection={null}
        employeeDetail={employeeDetail}
        resumeInfo={resumeInfo}
        interviewAssessment={interviewAssessment}
        referenceCheck={referenceCheck}
        medicalCheck={medicalCheck}
        probationInfo={probationInfo}
        locationGroup={locationName ? locationGroup : null}
        locationCode={locationName ? locCode ?? null : null}
        locationName={locationName}
      />
    </AppShell>
  );
}
