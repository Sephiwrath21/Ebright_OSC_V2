import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import { ChevronRight, Home } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contact Profile",
};

export default async function ContactProfilePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole  = (session.user as { role?: string }).role ?? "";
  const userName  = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="min-h-full bg-slate-50">
        <div className="mx-auto max-w-screen-xl px-6 py-6">
          <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
              <Home className="h-4 w-4" />
              Home
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <Link href="/crm/contacts" className="hover:text-slate-900 transition-colors">
              Contacts
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-medium">Profile</span>
          </nav>

          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-700">Contact Profile</p>
            <p className="mt-1 text-xs text-slate-500">Coming soon — backend integration in progress.</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
