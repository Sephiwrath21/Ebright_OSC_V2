import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, ChevronRight, Mail } from "lucide-react";
import AppShell from "@/app/components/AppShell";
import EditEmailForm from "@/app/components/EditEmailForm";

export const dynamic = "force-dynamic";

export default async function EditEmailPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="min-h-full bg-slate-50 dark:bg-slate-950">
        <div className="max-w-xl mx-auto px-6 pt-4 pb-10">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
            <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
              <Home className="w-4 h-4" aria-hidden="true" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <Link href="/profile" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">My Profile</Link>
            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span className="text-slate-900 dark:text-slate-100 font-medium">Edit Email</span>
          </nav>

          <header className="mb-6">
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Edit Email</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Change the email you use to sign in. After updating, you&apos;ll need to sign in with your new email next time.
            </p>
          </header>

          <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <header className="flex items-start gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">New Email</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Enter your new email and confirm with your current password.</p>
              </div>
            </header>
            <EditEmailForm currentEmail={userEmail} />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
