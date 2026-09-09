import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { EMPLOYEE_RECORD_CATEGORIES } from "@/lib/employeeRecordConfig";
import { getEmployeeOverviewRowById, getOnboardingCandidateDetail } from "@/lib/employeeQueries";
import { positionGroup, type EmployeeStage } from "@/lib/employeeStages";
import { getRealAccountLifecycleOverride } from "@/lib/careerApplicationSync";
import {
  newSectionsForStage,
  firstNewSection,
  visibleSectionsForStage,
  allVisibleSectionKeysFlat,
  firstVisibleSection,
} from "@/lib/employeeVisibleSections";
import { resolveEmployeeSectionRestriction } from "@/lib/employeeSectionAccess";

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
//
// Role-aware (2026-09-08, see conversation — bug fix): this used to pick a
// target from newSectionsForStage alone, with no idea which sections the
// CURRENT VIEWER's own role-restricted view (employeeSectionAccess.ts)
// actually includes — so it could (and for Finance, always did) redirect to
// a section that view excludes, which [category]/[section]/page.tsx then
// correctly rejects with notFound(). Now: the stage's own "what's new" list
// is filtered down to what the viewer's role-restricted map actually allows
// before picking from it; if nothing survives that filter (e.g. Finance
// viewing an Active-stage employee — Active's newSectionKeys is entirely
// HR/NDA/Handbook-ish, none of which Finance can see), falls back to the
// first section the viewer's role-restricted map allows AT ALL (for
// Finance, that's finance/payroll), not the hardcoded Personal Info
// fallback below, which a narrowly-restricted viewer may not see either.
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

  const isFullTime = positionGroup(employee.position) === "Full Time";
  const stageVisibleSectionKeys = visibleSectionsForStage(effectiveStage, isFullTime);
  const roleVisibleSectionKeys = await resolveEmployeeSectionRestriction(stageVisibleSectionKeys, employee.id);

  const newSectionKeys = newSectionsForStage(effectiveStage);
  const allowedFlat = allVisibleSectionKeysFlat(roleVisibleSectionKeys);
  const roleFilteredNewSectionKeys = newSectionKeys.filter((key) => allowedFlat.has(key));
  const target = firstNewSection(roleFilteredNewSectionKeys) ?? firstVisibleSection(roleVisibleSectionKeys);

  redirect(target ? `/employee-record/${id}/${target.categoryKey}/${target.sectionKey}` : fallbackTarget);
}
