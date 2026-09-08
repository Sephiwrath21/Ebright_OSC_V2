"use client";

// Superadmin/elevated-site/CEO's top-level Department | Branch mode switch —
// extracted to its own client component (2026-08-26) so it can remember the
// last picked mode across visits: a cookie, written here on click, that
// page.tsx reads server-side (cookieEntityView) to pick the default mode
// whenever the URL has no explicit ?view= of its own. Navigation itself
// stays a plain <Link> (no router.push) so middle-click/open-in-new-tab and
// no-JS fallback keep working exactly as before this change.
import Link from "next/link";

const ENTITY_VIEW_COOKIE = "tm_entity_view";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function rememberEntityView(view: "department" | "branch") {
  document.cookie = `${ENTITY_VIEW_COOKIE}=${view}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

/** Carries the selected Daily date across so switching modes keeps it. */
export function ModeTabs({ active, date }: { active: "department" | "branch"; date?: string }) {
  const base = "rounded-lg px-4 py-1.5 text-sm font-semibold border border-transparent";
  const on = "bg-white text-gray-900 border-gray-300 shadow dark:bg-slate-700 dark:text-slate-100 dark:border-slate-500";
  const off = "text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200";
  const suffix = date ? `&date=${date}` : "";
  return (
    <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-slate-800">
      <Link
        href={`/task-manager?view=department${suffix}`}
        onClick={() => rememberEntityView("department")}
        className={`${base} ${active === "department" ? on : off}`}
      >
        Department
      </Link>
      <Link
        href={`/task-manager?view=branch${suffix}`}
        onClick={() => rememberEntityView("branch")}
        className={`${base} ${active === "branch" ? on : off}`}
      >
        Branch
      </Link>
    </div>
  );
}
