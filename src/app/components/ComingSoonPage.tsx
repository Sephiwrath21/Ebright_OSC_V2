import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, ChevronRight } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import AppShell from "./AppShell";

interface Crumb {
  label: string;
  /** Omit on the last crumb (the current page). */
  href?: string;
}

interface ComingSoonPageProps {
  title: string;
  /** Breadcrumb trail after "Home" (Home is prepended automatically). */
  trail?: Crumb[];
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Tailwind bg-* class for the icon tile. */
  accent?: string;
}

/**
 * Shared scaffold for not-yet-built modules: auth guard + AppShell + breadcrumb
 * + a centered "coming soon" card. Keeps placeholder pages to a few lines each.
 */
export default async function ComingSoonPage({
  title,
  trail = [],
  Icon,
  accent = "bg-slate-600",
}: ComingSoonPageProps) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="min-h-full bg-slate-50 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 pt-4 pb-10">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-sm text-slate-500 mb-6 flex-wrap dark:text-slate-400"
          >
            <Link
              href="/home"
              className="flex items-center gap-1 hover:text-slate-900 transition-colors rounded dark:hover:text-slate-100"
            >
              <Home className="w-4 h-4" aria-hidden="true" />
              <span>Home</span>
            </Link>
            {trail.map((crumb) => (
              <span key={crumb.label} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-slate-900 transition-colors rounded dark:hover:text-slate-100">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-slate-900 font-medium dark:text-slate-100">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>

          <header className="mb-10">
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight dark:text-slate-100">
              {title}
            </h1>
          </header>

          <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center dark:bg-slate-900 dark:border-slate-800">
            <div className={`${accent} w-12 h-12 rounded-xl flex items-center justify-center mb-5`}>
              <Icon className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title} coming soon</h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed dark:text-slate-300">
              This module is under development.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
