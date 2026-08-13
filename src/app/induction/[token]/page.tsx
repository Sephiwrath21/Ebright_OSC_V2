import { auth } from "@/auth";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import PersonalInductionView from "@/app/induction/components/PersonalInductionView";
import { canManageInductions } from "@/app/induction/roles";
import {
  getInductionByToken,
  listAllSubstepTemplates,
} from "@/app/induction/queries";
import { getActiveAssignmentForUser } from "@/lib/workflow/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Induction",
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function PersonalInductionPage({ params }: PageProps) {
  const { token } = await params;
  const result = await getInductionByToken(token);

  if (!result.ok) {
    const heading =
      result.error === "expired"
        ? "This link has expired"
        : "We couldn’t find this induction";
    const detail =
      result.error === "expired"
        ? "Your induction link is no longer valid. Please contact HR to receive a new one."
        : "The link you used doesn’t match any active induction. Double-check the URL or contact HR.";

    return (
      <main className="h-full flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex w-9 h-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{heading}</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{detail}</p>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Link
              href="/home"
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Go home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const session = await auth();
  let canMarkComplete = false;
  if (session?.user?.email) {
    const actor = await prisma.users.findUnique({
      where: { email: session.user.email },
      select: { user_id: true, role: { select: { role_type: true } } },
    });
    if (actor) {
      const isManager = canManageInductions(actor.role?.role_type ?? null);
      const isOwner = actor.user_id === result.profile.userId;
      canMarkComplete = isManager || isOwner;
    }
  }

  // Substep templates feed the auto-attached sub-workflow under Department
  // Training. Filtered inside the view by the inductee's department.
  const substepTemplates = await listAllSubstepTemplates();

  // Workflow Center PR1: surface the candidate's assigned department
  // workflow (if any). Auto-assignment after Day 3 lands in PR2; for
  // now this is populated only via manual assignment from the HR
  // candidate detail page.
  const workflowAssignment = await getActiveAssignmentForUser(result.profile.userId);

  return (
    <PersonalInductionView
      profile={result.profile}
      canMarkComplete={canMarkComplete}
      substepTemplates={substepTemplates}
      workflowAssignment={workflowAssignment}
    />
  );
}
