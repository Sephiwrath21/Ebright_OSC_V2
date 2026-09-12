// Departments shown under "ClickUp Task". Slugs are used in the URL
// (/clickup-task/<slug>) and map to DB departments by `code`.
export type Department = {
  slug: string;
  name: string;
  code: string;
  icon: string;
  color: string;
};

export const DEPARTMENTS: Department[] = [
  { slug: "optimisation", name: "Optimisation Department", code: "OPT", icon: "📈", color: "#185FA5" },
  { slug: "marketing", name: "Marketing Department", code: "MKT", icon: "📣", color: "#A32D2D" },
  { slug: "finance", name: "Finance Department", code: "FNC", icon: "💰", color: "#0F6E56" },
  { slug: "hr", name: "HR Department", code: "HR", icon: "🧑‍💼", color: "#3C3489" },
  { slug: "academy", name: "Academy Department", code: "ACD", icon: "🎓", color: "#854F0B" },
  { slug: "operation", name: "Operation Department", code: "OPS", icon: "⚙️", color: "#475569" },
];

export function getDepartment(slug: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.slug === slug.toLowerCase());
}

// Roles that may see every department. Everyone else is (eventually) locked
// to their own department.
const ADMIN_ROLES = new Set(["superadmin", "ceo"]);

export function canSeeAllDepartments(role?: string | null): boolean {
  return !!role && ADMIN_ROLES.has(role.toLowerCase());
}

// Who may POST company-wide announcements: admins + Heads of Department.
const ANNOUNCER_ROLES = new Set(["superadmin", "ceo", "hod"]);

export function canPostAnnouncement(role?: string | null): boolean {
  return !!role && ANNOUNCER_ROLES.has(role.toLowerCase());
}

// Who may open ClickUp Task at all (2026-09-04, per instruction): department
// accounts (role_type "department"), CEO, and Super Admin — nobody else. Note
// this is deliberately NARROWER than canSeeAllDepartments above, which is about
// *which* departments an allowed user may open; this one is about reaching the
// module in the first place. Every other role_type — branch, regional manager,
// hod, staff — loses both the sidebar entry and the routes themselves.
const CLICKUP_TASK_ROLES = new Set(["superadmin", "ceo", "department"]);

export function canAccessClickUpTask(role?: string | null): boolean {
  return !!role && CLICKUP_TASK_ROLES.has(role.toLowerCase());
}
