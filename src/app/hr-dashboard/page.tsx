import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import HrDashboardView from "@/app/components/HrDashboardView";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED_ROLE_TYPES = new Set([
  "superadmin", "super_admin", "admin", "hr", "hod", "ceo",
]);

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function HrDashboardPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  const roleType = me?.role?.role_type?.toLowerCase() ?? "";

  const userEmail = session.user.email;
  const userName = session.user.name ?? null;
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "USER";

  if (!ALLOWED_ROLE_TYPES.has(roleType)) {
    return (
      <AppShell email={userEmail} role={userRole} name={userName}>
        <div className="min-h-full bg-slate-50 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-5">
              <ShieldAlert className="w-7 h-7 text-rose-600" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Restricted Access</h1>
            <p className="mt-2 text-sm text-slate-600">
              The HR Dashboard is available to HR, HOD, admin, CEO, and superadmin roles only.
            </p>
            <Link
              href="/home"
              className="mt-6 inline-flex items-center h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const sp = await searchParams;
  const initialMonth = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <HrDashboardView initialMonth={initialMonth} />
    </AppShell>
  );
}
