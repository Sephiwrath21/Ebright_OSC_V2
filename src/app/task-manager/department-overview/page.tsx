// /task-manager/department-overview — chips + donut + click-through member
// roster, Daily and Monthly side by side. Org roles (ADMIN/CEO/OPS) pick any
// official department; HOD/DEPT_SITE are locked to their own.
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";
import {
  getDepartmentDetail,
  getFlowOverview,
  FlowBridgeError,
  NoAccountError,
  SetupPendingError,
} from "@/task-manager/data";
import { DepartmentOverviewSection } from "@/task-manager/ui/department-overview";
import { FLOW_DEPARTMENTS } from "@/task-manager/ui/types";
import {
  NoAccountCard,
  SetupPendingCard,
  TaskManagerErrorCard,
} from "@/task-manager/ui/status-cards";

export const dynamic = "force-dynamic";

function DepartmentPicker({
  current,
  hrefFor,
}: {
  current: string;
  hrefFor: (department: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FLOW_DEPARTMENTS.map((d) => (
        <a
          key={d}
          href={hrefFor(d)}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
            d === current
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {d}
        </a>
      ))}
    </div>
  );
}

export default async function DepartmentOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };
  const email = su.email;

  const sp = await searchParams;
  const hrefFor = (department: string) =>
    `/task-manager/department-overview?department=${encodeURIComponent(department)}`;

  let body: ReactNode;
  let isOrgRole = false;
  let department = "";
  try {
    // Fetched first just to learn the viewer's role/own-department — the
    // personal overview payload carries the same me.role/me.department as
    // the full role-scoped detail, without its org-wide fan-out.
    const identity = await getFlowOverview(email, "daily");
    isOrgRole =
      identity.me.role === "ADMIN" ||
      identity.me.role === "CEO" ||
      identity.me.role === "OPS";

    const requested =
      sp.department && (FLOW_DEPARTMENTS as readonly string[]).includes(sp.department)
        ? sp.department
        : null;
    department =
      requested ??
      (isOrgRole ? FLOW_DEPARTMENTS[0] : (identity.me.department ?? FLOW_DEPARTMENTS[0]));

    const [daily, monthly] = await Promise.all([
      getDepartmentDetail(email, department, "daily"),
      getDepartmentDetail(email, department, "monthly"),
    ]);

    body = (
      <div className="flex flex-col gap-8">
        <DepartmentOverviewSection label="Daily" department={daily.department} />
        <DepartmentOverviewSection label="Monthly" department={monthly.department} />
      </div>
    );
  } catch (err) {
    if (err instanceof SetupPendingError) {
      body = <SetupPendingCard />;
    } else if (err instanceof NoAccountError) {
      body = <NoAccountCard email={email} />;
    } else {
      body = (
        <TaskManagerErrorCard
          message={err instanceof FlowBridgeError ? err.message : "Unexpected error"}
        />
      );
    }
  }

  return (
    <AppShell email={email} role={su.role} name={su.name}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Department Overview</h1>
            <p className="mt-1 text-sm text-gray-500">
              Daily and Monthly department status, with a click-through member roster.
            </p>
          </div>
          <Link
            href="/task-manager"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Task Manager
          </Link>
        </div>
        {isOrgRole && department && <DepartmentPicker current={department} hrefFor={hrefFor} />}
        {body}
      </div>
    </AppShell>
  );
}
