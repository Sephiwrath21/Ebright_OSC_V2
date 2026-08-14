import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import { canManageInductions } from "@/app/induction/roles";
import {
  getInductionHealthScore,
  getConfidenceTrajectory,
  getProblemAreas,
  getRecommendations,
  getImpactLog,
} from "@/app/induction/queries";
import { HealthScoreGauge } from "@/app/induction/components/HealthScoreGauge";
import { ConfidenceTrajectoryChart } from "@/app/induction/components/ConfidenceTrajectoryChart";
import { ProblemAreasSection } from "@/app/induction/components/ProblemAreasSection";
import { RecommendationsBoard } from "@/app/induction/components/RecommendationsBoard";
import { ImpactLogSection } from "@/app/induction/components/ImpactLogSection";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Induction Feedback & Analytics",
};

export default async function FeedbackAnalyticsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const actor = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });

  if (!canManageInductions(actor?.role?.role_type ?? null)) {
    return (
      <AppShell
        email={session.user.email ?? undefined}
        role={actor?.role?.role_type ?? undefined}
        name={session.user.name ?? undefined}
      >
        <div className="p-6">Access denied.</div>
      </AppShell>
    );
  }

  const [healthScore, trajectory, problems, recommendations, impactLog] =
    await Promise.all([
      getInductionHealthScore(),
      getConfidenceTrajectory(),
      getProblemAreas(),
      getRecommendations(),
      getImpactLog(),
    ]);

  return (
    <AppShell
      email={session.user.email ?? undefined}
      role={actor?.role?.role_type ?? undefined}
      name={session.user.name ?? undefined}
    >
      <div className="space-y-8 p-6">
        <div>
          <h1 className="text-3xl font-bold">Induction Feedback & Analytics</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Surveys, health metrics, and continuous improvement
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <HealthScoreGauge score={healthScore} />
          <div className="xl:col-span-2">
            <ConfidenceTrajectoryChart data={trajectory} />
          </div>
        </div>

        <ProblemAreasSection areas={problems} />

        <RecommendationsBoard recommendations={recommendations} />

        <ImpactLogSection logs={impactLog} />
      </div>
    </AppShell>
  );
}
