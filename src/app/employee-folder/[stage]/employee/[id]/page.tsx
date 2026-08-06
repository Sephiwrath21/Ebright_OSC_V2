import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import StageProfileView from "@/app/components/StageProfileView";
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
  resolveLocationName,
} from "@/lib/employeeQueries";
import { STAGE_PROFILE_CONFIG } from "@/lib/stageProfileConfig";
import { isDualListedOnProbation } from "@/lib/careerApplicationSync";

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

  // Negative ids are the onboarding_candidate sentinel (-source_id) — a
  // future hire with no portal account yet (see listUpcomingOnboardingCandidates).
  // Same profile template as a real employee, just synthesized from the
  // handful of fields the candidate table actually has; every other tab's
  // real-table lookups below (getResumeInfo etc.) already no-op safely for a
  // user_id that doesn't exist, so they don't need special-casing.
  const isCandidate = numId < 0;
  if (isCandidate && stage !== "pre") notFound();

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
      // The one allowed mismatch: someone whose real, stored stage is
      // something else (Onboarding, or even Active — the external
      // recruitment pipeline can lag behind real progress) but whose
      // career_applications.board_stage OR rec_recruit/rec_stage.name reads
      // "Probation" is dual-listed on the Probation list (see
      // [stage]/page.tsx) and must be reachable at /probation/employee/[id]
      // there — rendered with the Probation profile template below, not
      // their real stage's one, and not a 404. Visiting them at their real
      // stage's own URL still renders normally since found.stage === stage
      // already matched above in that case.
      const isDualListedProbationView = stage === "probation" && (await isDualListedOnProbation(found.fullName));
      if (!isDualListedProbationView) notFound();
    }
    employee = found;
    employeeDetail = await getEmployeeById(numId);
  }

  // The sidebar (Branch/Dept/Position/Phone/Email) is sourced from this on
  // every stage now, same as the separate-pages route. Pre/Probation never
  // reach here with a locGroup/locCode — hasLocationLayer is false for both,
  // so there's no branch/dept-scoped namelist to have arrived from.
  const [resumeInfo, interviewAssessment, referenceCheck, medicalCheck, probationInfo, { locGroup, locCode }] = await Promise.all([
    getResumeInfo(numId),
    getInterviewAssessment(numId, employee.fullName),
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
