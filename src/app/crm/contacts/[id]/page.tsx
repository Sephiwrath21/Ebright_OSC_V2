import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/app/components/AppShell";
import ContactProfile from "@/app/components/ContactProfile";
import { ChevronRight, Home } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contact Profile",
};

export default async function ContactProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole  = (session.user as { role?: string }).role ?? "";
  const userName  = session.user.name ?? null;
  const { id } = await params;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="min-h-full bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-screen-xl px-6 py-6">
          <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
              <Home className="h-4 w-4" />
              Home
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <Link href="/crm/contacts" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
              Contacts
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 dark:text-slate-100 font-medium">Profile</span>
          </nav>

          <ContactProfile contactId={id} />
        </div>
      </div>
    </AppShell>
  );
}
