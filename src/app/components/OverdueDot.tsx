// Small red dot next to an employee's name on stage namelist pages, shown
// only when they have 1+ overdue Task Manager tasks (see employeeQueries's
// getOverdueTaskCounts). Native `title` attribute for the hover tooltip —
// matches this codebase's existing convention (no custom Tooltip component
// exists elsewhere), no extra JS needed for a plain hover-to-reveal string.
// `label` overrides the default "N overdue task(s)" wording — reused as-is
// for the Probation summary card's own red dot (see
// EmployeeOverviewView.tsx), whose meaning ("probation ending soon") has
// nothing to do with overdue tasks.
export default function OverdueDot({ count, label }: { count: number | undefined; label?: string }) {
  if (!count || count <= 0) return null;
  const resolvedLabel = label ?? `${count} overdue task${count === 1 ? "" : "s"}`;
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 shrink-0"
      title={resolvedLabel}
      aria-label={resolvedLabel}
      role="img"
    />
  );
}
