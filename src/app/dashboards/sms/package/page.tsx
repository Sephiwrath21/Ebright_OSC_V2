import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, ChevronRight, BookUser } from "lucide-react";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Package | SMS",
};

export default async function PackagePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="min-h-full bg-slate-50">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors rounded">
              <Home className="w-4 h-4" aria-hidden="true" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <Link href="/dashboards/sms" className="hover:text-slate-900 transition-colors rounded">
              SMS
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span className="text-slate-900 font-medium">Package</span>
          </nav>

          <header className="mb-10">
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
              Package Management
            </h1>
          </header>

          <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
            <div className="bg-indigo-600 w-12 h-12 rounded-xl flex items-center justify-center mb-5">
              <BookUser className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Package Management coming soon</h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              This module is under development.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
