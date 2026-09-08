import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { EMPLOYEE_RECORD_CATEGORIES } from "@/lib/employeeRecordConfig";
import { getEmployeeOverviewRowById, getOnboardingCandidateDetail } from "@/lib/employeeQueries";
import type { EmployeeStage } from "@/lib/employeeStages";
import { getRealAccountLifecycleOverride } from "@/lib/careerApplicationSync";
import { newSectionsForStage, firstNewSection } from "@/lib/employeeVisibleSections";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

// Default-landing-section resolution (2026-08-28, see conversation) — lands
// on the person's first NEW/unfilled section, same firstNewSection-based
// default the stage-folder pages already use, instead of always Personal
// Info regardless of what stage the person is actually at. Mirrors the exact
// same candidate/effective-stage resolution [category]/[section]/page.tsx
// uses for its own dot computation, kept in sync via the shared
// normalizeStageForVisibility/newSectionsForStage helpers.
export default async function EmployeeRecordPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { id } = await params;
  const numId = Number(id);
  const fallback = EMPLOYEE_RECORD_CATEGORIES[0];
  const fallbackTarget = `/employee-record/${id}/${fallback.key}/${fallback.sections[0].key}`;
  if (Number.isNaN(numId)) redirect(fallbackTarget);

  const isCandidate = numId < 0;
  let employee: { id: number; fullName: string; position: string | null; branchName: string | null; departmentName: string | null };
  let employeeStage: EmployeeStage;
  if (isCandidate) {
    const candidateDetail = await getOnboardingCandidateDetail(-numId);
    if (!candidateDetail) redirect(fallbackTarget);
    employee = candidateDetail;
    employeeStage = "pre";
  } else {
    const found = await getEmployeeOverviewRowById(numId);
    if (!found) redirect(fallbackTarget);
    employee = found;
    employeeStage = found.stage;
  }

  const override = isCandidate ? undefined : await getRealAccountLifecycleOverride({ ...employee, stage: employeeStage });
  const effectiveStage: EmployeeStage = override?.stage ?? employeeStage;
  const newSectionKeys = newSectionsForStage(effectiveStage);
  const target = firstNewSection(newSectionKeys);

  redirect(target ? `/employee-record/${id}/${target.categoryKey}/${target.sectionKey}` : fallbackTarget);
}
