"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  Home,
  Library,
  LayoutDashboard,
  Users,
  Newspaper,
  BookUser,
  Package,
  GraduationCap,
  CalendarCheck,
  ShieldCheck,
  ListChecks,
  ChevronDown,
  Award,
  ClipboardList,
} from "lucide-react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  name: string;
  /** Leaf items navigate; items with `children` toggle instead. */
  href?: string;
  Icon?: IconComponent;
  /** Optional image used in place of the lucide Icon (e.g. a product logo). */
  iconSrc?: string;
  external?: boolean;
  /** Match the active route exactly instead of by prefix (for "Overview" links whose siblings share the prefix). */
  exact?: boolean;
  children?: NavItem[];
}

const primaryNav: NavItem[] = [
  { name: "Home", href: "/home", Icon: Home },
  {
    name: "HRMS",
    href: "/dashboards/hrms",
    Icon: Users,
    children: [
      { name: "Overview", href: "/dashboards/hrms" },
      { name: "Employee Dashboard", href: "/dashboard-employee-management" },
      { name: "Manpower Planning", href: "/manpower-schedule" },
      { name: "Claims", href: "/claim" },
      {
        name: "Attendance",
        children: [
          { name: "Overview", href: "/attendance", exact: true },
          { name: "Leave", href: "/attendance/leave" },
          { name: "Report", href: "/attendance/report" },
          { name: "Summary", href: "/attendance/summary" },
        ],
      },
      { name: "HR Dashboard", href: "/induction/hr-dashboard" },
      { name: "Manpower Cost Report", href: "/manpower-cost-report" },
      { name: "Staff Directory", href: "/staff-directory" },
    ],
  },
  {
    name: "CNS",
    href: "/dashboards/crm",
    Icon: Newspaper,
    children: [
      {
        name: "Lead",
        children: [
          { name: "Dashboard", href: "/crm/dashboard", exact: true },
          { name: "Contacts", href: "/crm/contacts" },
          { name: "Opportunities", href: "/crm/opportunities" },
          { name: "Forms", href: "/crm/forms" },
          { name: "Branches", href: "/crm/branches" },
          { name: "Region", href: "/crm/region" },
          { name: "Automations", href: "/crm/automations" },
          { name: "Analytics", href: "/crm/analytics" },
          { name: "Integrations", href: "/crm/integrations" },
        ],
      },
      {
        name: "Ticket",
        children: [
          { name: "Dashboard", href: "/crm/ticket/dashboard", exact: true },
          { name: "Opportunities", href: "/crm/ticket/opportunities" },
          { name: "My Tickets", href: "/crm/ticket/my-tickets" },
          { name: "New Ticket", href: "/crm/ticket/new" },
          { name: "Platforms", href: "/crm/ticket/platforms" },
        ],
      },
    ],
  },
  {
    name: "SMS",
    href: "/dashboards/sms",
    Icon: BookUser,
    children: [
      { name: "Student", href: "/dashboards/sms/student" },
      { name: "Package", href: "/dashboards/sms/package" },
      { name: "Age Group", href: "/dashboards/sms/age-group" },
    ],
  },
  {
    name: "Inventory",
    href: "https://inventory.ebright.my/",
    Icon: Package,
    external: true,
  },
  { name: "Academy", href: "/academy", Icon: GraduationCap },
  {
    name: "FA System",
    href: "/dashboards/fa",
    Icon: Award,
    children: [
      { name: "Events", href: "/dashboards/fa/events" },
      { name: "Inventory", href: "/dashboards/fa/inventory" },
      { name: "Student List", href: "/dashboards/fa/student-list" },
      { name: "Reports", href: "/dashboards/fa/reports" },
      { name: "Attendance", href: "/dashboards/fa/attendance" },
      { name: "Dashboard", href: "/dashboards/fa", exact: true },
    ],
  },
  {
    name: "PCM System",
    href: "/dashboards/pcm",
    Icon: ClipboardList,
    children: [
      { name: "Events", href: "/dashboards/pcm/events" },
      { name: "Student List", href: "/dashboards/pcm/student-list" },
      { name: "Invitations", href: "/dashboards/pcm/invitations" },
      { name: "Reports", href: "/dashboards/pcm/reports" },
      { name: "Attendance", href: "/dashboards/pcm/attendance" },
      { name: "Dashboard", href: "/dashboards/pcm", exact: true },
    ],
  },
  { name: "Task Manager", href: "/task-manager", Icon: ListChecks },
];

const secondaryNav: NavItem[] = [
  { name: "Attendance", href: "/attendance", Icon: CalendarCheck },
  { name: "Account Management", href: "/account-management", Icon: ShieldCheck },
  {
    name: "Internal Dashboard",
    href: "https://dashboard.ebright.my",
    Icon: LayoutDashboard,
    iconSrc: "/internal-dashboard-icon.png",
    external: true,
  },
  {
    name: "Library",
    href: "https://library.ebright.my/",
    Icon: Library,
    iconSrc: "/library-icon.png",
    external: true,
  },
];

function isItemActive(item: NavItem, pathname: string | null): boolean {
  if (!item.href || item.external || !pathname) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function containsActive(items: NavItem[], pathname: string | null): boolean {
  return items.some(
    (item) =>
      isItemActive(item, pathname) ||
      (item.children ? containsActive(item.children, pathname) : false),
  );
}

/** First navigable href in the subtree — used as the link target in collapsed (icon-only) mode. */
function firstHref(item: NavItem): string {
  if (item.href) return item.href;
  for (const child of item.children ?? []) {
    const href = firstHref(child);
    if (href !== "#") return href;
  }
  return "#";
}

export default function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={`bg-white border-r border-slate-200 flex flex-col shrink-0 transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <Link
        href="/home"
        aria-label="Ebright Portal — Home"
        className={`flex items-center h-16 border-b border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
          collapsed ? "justify-center px-0" : "px-5"
        }`}
      >
        {collapsed ? (
          <img
            src="/ebright-mark.png"
            alt="Ebright"
            className="w-12 h-12 object-contain shrink-0"
          />
        ) : (
          <img
            src="/ebright-logo.png"
            alt="Ebright"
            className="h-8 w-auto"
          />
        )}
      </Link>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4">
        <NavSection label="Workspace" items={primaryNav} pathname={pathname} collapsed={collapsed} />
        <div className="my-3 mx-3 border-t border-slate-100" />
        <NavSection label="Quick Access" items={secondaryNav} pathname={pathname} collapsed={collapsed} />
      </nav>
    </aside>
  );
}

function NavSection({
  label,
  items,
  pathname,
  collapsed,
}: {
  label: string;
  items: NavItem[];
  pathname: string | null;
  collapsed: boolean;
}) {
  return (
    <div className="px-3">
      {!collapsed && (
        <p className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </p>
      )}
      <ul className="space-y-1">
        {items.map((item) => (
          <NavNode key={item.name} item={item} depth={0} pathname={pathname} collapsed={collapsed} />
        ))}
      </ul>
    </div>
  );
}

function NavNode({
  item,
  depth,
  pathname,
  collapsed,
}: {
  item: NavItem;
  depth: number;
  pathname: string | null;
  collapsed: boolean;
}) {
  const { name, href, Icon, iconSrc, external, children } = item;
  const hasChildren = !!children?.length;
  const isActive = isItemActive(item, pathname);
  const hasActiveDescendant = hasChildren && containsActive(children, pathname);
  const [open, setOpen] = useState(hasActiveDescendant);

  // Auto-expand the branch containing the current page; never auto-collapse
  // so other sections the user opened stay open.
  useEffect(() => {
    if (hasActiveDescendant) setOpen(true);
  }, [hasActiveDescendant]);

  // Indent nested rows so their text lines up after the top-level icon,
  // stepping in a bit further per level.
  const indent = depth === 0 ? undefined : { paddingLeft: `${28 + depth * 16}px` };

  const icon = iconSrc ? (
    <img
      src={iconSrc}
      alt=""
      className={`shrink-0 rounded-[3px] object-contain ${collapsed ? "w-8 h-8" : "w-5 h-5"}`}
      aria-hidden="true"
    />
  ) : Icon ? (
    <Icon
      className={`w-5 h-5 shrink-0 ${
        isActive || hasActiveDescendant ? "text-blue-600" : "text-slate-500"
      }`}
      aria-hidden="true"
    />
  ) : null;

  // Collapsed (icon-only) rail: no room for nesting — every item is a plain
  // icon link; parents link to their first child page.
  if (collapsed) {
    if (depth > 0) return null;
    const target = href ?? firstHref(item);
    const className = `relative flex items-center justify-center h-10 w-10 mx-auto rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
      isActive || hasActiveDescendant
        ? "bg-blue-50 text-blue-700"
        : "text-slate-700 hover:bg-slate-100"
    }`;
    return (
      <li>
        {external ? (
          <a href={target} target="_blank" rel="noopener noreferrer" title={name} className={className}>
            {icon}
          </a>
        ) : (
          <Link href={target} title={name} aria-current={isActive ? "page" : undefined} className={className}>
            {icon}
          </Link>
        )}
      </li>
    );
  }

  const rowClass = `relative flex items-center gap-3 w-full rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-3 ${
    depth === 0 ? "py-2.5" : "py-2"
  } ${
    isActive
      ? "bg-blue-50 text-blue-700"
      : hasActiveDescendant
        ? "text-blue-700 hover:bg-slate-100"
        : `${depth === 0 ? "text-slate-700" : "text-slate-600"} hover:bg-slate-100`
  }`;

  if (hasChildren) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={rowClass}
          style={indent}
        >
          {icon}
          <span className="flex-1 text-left whitespace-nowrap">{name}</span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
              open ? "" : "-rotate-90"
            }`}
            aria-hidden="true"
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <ul className="overflow-hidden min-h-0 mt-0.5 space-y-0.5">
            {children.map((child) => (
              <NavNode
                key={child.name}
                item={child}
                depth={depth + 1}
                pathname={pathname}
                collapsed={collapsed}
              />
            ))}
          </ul>
        </div>
      </li>
    );
  }

  const inner = (
    <>
      {isActive && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-blue-600 rounded-r"
          aria-hidden="true"
        />
      )}
      {icon}
      <span className="whitespace-nowrap">{name}</span>
    </>
  );

  return (
    <li>
      {external ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={rowClass}
          style={indent}
        >
          {inner}
        </a>
      ) : (
        <Link
          href={href ?? "#"}
          aria-current={isActive ? "page" : undefined}
          className={rowClass}
          style={indent}
        >
          {inner}
        </Link>
      )}
    </li>
  );
}
