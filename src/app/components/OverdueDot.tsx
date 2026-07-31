// Small red dot next to an employee's name on stage namelist pages, shown
// only when they have 1+ overdue Task Manager tasks (see employeeQueries's
// getOverdueTaskCounts). Native `title` attribute for the hover tooltip —
// matches this codebase's existing convention (no custom Tooltip component
// exists elsewhere), no extra JS needed for a plain hover-to-reveal string.
export default function OverdueDot({ count }: { count: number | undefined }) {
  if (!count || count <= 0) return null;
  const label = `${count} overdue task${count === 1 ? "" : "s"}`;
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 shrink-0"
      title={label}
      aria-label={label}
      role="img"
    />
  );
}
