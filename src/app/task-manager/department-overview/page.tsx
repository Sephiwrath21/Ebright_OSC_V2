// /task-manager/department-overview — FOLDED INTO /task-manager by the
// 2026-07-24 redesign (dropdown-driven entity overview rendered inline).
// Kept as a permanent redirect so old links and bookmarks — including the
// Home overview grids' pre-redesign department URLs — keep working.
import { redirect } from "next/navigation";

export default async function DepartmentOverviewRedirect({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const sp = await searchParams;
  redirect(
    sp.department
      ? `/task-manager?view=department&department=${encodeURIComponent(sp.department)}`
      : "/task-manager?view=department",
  );
}
