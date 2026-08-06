"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  ChevronRight,
  Award,
  ClipboardList,
} from "lucide-react";
import type { NavAccess } from "./navAccess.types";

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
  /** Access-management feature key that gates this item (and its subtree).
   *  Hidden unless the signed-in user can `view` it. Unset = always shown. */
  feature?: string;
  /** Superadmin / CEO only (e.g. Account Management). */
  privileged?: boolean;
  children?: NavItem[];
}

const primaryNav: NavItem[] = [
  { name: "Home", href: "/home", Icon: Home },
  { name: "ClickUp Task", href: "/clickup-task", Icon: ClipboardList },
  {
    name: "HRMS",
    href: "/dashboards/hrms",
    Icon: Users,
    children: [
      { name: "Overview", href: "/dashboards/hrms" },
      { name: "Employee Dashboard", href: "/dashboard-employee-management", feature: "employee_dashboard" },
      { name: "Manpower Planning", href: "/manpower-schedule", feature: "manpower_plan" },
      { name: "Claims", href: "/claim", feature: "claim" },
      {
        name: "Attendance",
        children: [
          { name: "Overview", href: "/attendance", exact: true, feature: "attendance_overview" },
          { name: "Leave", href: "/attendance/leave", feature: "leave" },
          { name: "Report", href: "/attendance/report", feature: "attendance_report" },
          { name: "Summary", href: "/attendance/summary", feature: "attendance_summary" },
          { name: "Justifications", href: "/attendance/justifications", feature: "attendance_justifications" },
        ],
      },
      { name: "HR Dashboard", href: "/induction/hr-dashboard", feature: "hr_dashboard" },
      { name: "Manpower Cost Report", href: "/manpower-cost-report", feature: "manpower_cost" },
      { name: "Staff Directory", href: "/staff-directory", feature: "staff_directory" },
      // No `feature` gate — Employee Folder's real access control is
      // employeeScope.ts (department/branch/own-record scoping), not the
      // access-management role_permission matrix; that matrix currently has
      // no grant configured for any role but department/HR, which was
      // hiding this link for every branch/department/staff account even
      // though their own /employee-folder route works fine and is properly
      // scoped. Per explicit decision (see conversation) — visibility
      // should follow the same rule the route itself enforces, not a
      // separate, out-of-sync permission table.
      { name: "Employee Folder", href: "/employee-folder" },
    ],
  },
  {
    name: "CNS",
    href: "/dashboards/crm",
    Icon: Newspaper,
    feature: "cns_dashboard",
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
      { name: "Student", href: "/dashboards/sms/student", feature: "sms_student" },
      { name: "Package", href: "/dashboards/sms/package", feature: "sms_package" },
      { name: "Age Group", href: "/dashboards/sms/age-group", feature: "sms_age_group" },
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
    feature: "fa_dashboard",
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
    feature: "pcm_dashboard",
    children: [
      { name: "Events", href: "/dashboards/pcm/events" },
      { name: "Student List", href: "/dashboards/pcm/student-list" },
      { name: "Invitations", href: "/dashboards/pcm/invitations" },
      { name: "Reports", href: "/dashboards/pcm/reports" },
      { name: "Attendance", href: "/dashboards/pcm/attendance" },
      { name: "Dashboard", href: "/dashboards/pcm", exact: true },
    ],
  },
  {
    name: "Task Manager",
    href: "/task-manager",
    Icon: ListChecks,
    children: [
      { name: "Overview", href: "/task-manager", exact: true },
      { name: "Template", href: "/task-manager/template" },
      { name: "Package", href: "/task-manager/package" },
      { name: "Package Table", href: "/task-manager/package-table" },
    ],
  },
];

const secondaryNav: NavItem[] = [
  { name: "Attendance", href: "/attendance", Icon: CalendarCheck, feature: "attendance_overview" },
  { name: "Account Management", href: "/account-management", Icon: ShieldCheck, privileged: true },
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

/**
 * Drop nav items the signed-in user can't reach: feature-gated items whose key
 * isn't granted, and privileged-only items for non-privileged users. A parent
 * whose children all get filtered out disappears too. `null` access (still
 * loading) leaves the menu untouched so nothing flickers for privileged users.
 */
function filterNav(items: NavItem[], access: NavAccess | null): NavItem[] {
  if (!access) return items;
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.privileged && !access.privileged) continue;
    if (item.feature && !access.features.includes(item.feature)) continue;
    if (item.children?.length) {
      const kids = filterNav(item.children, access);
      if (kids.length === 0) continue;
      out.push({ ...item, children: kids });
    } else {
      out.push(item);
    }
  }
  return out;
}

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

/** True if `target` sits inside any open flyout popover (they're portaled to
 * document.body as siblings, so containment can't be checked via ancestry). */
function isInsideAnyFlyout(target: Node): boolean {
  const el = target instanceof Element ? target : target.parentElement;
  return !!el?.closest("[data-nav-flyout]");
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

export default function Sidebar({
  collapsed,
  navAccess = null,
}: {
  collapsed: boolean;
  navAccess?: NavAccess | null;
}) {
  const pathname = usePathname();
  const primaryItems = filterNav(primaryNav, navAccess);
  const secondaryItems = filterNav(secondaryNav, navAccess);

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
        <NavSection label="Workspace" items={primaryItems} pathname={pathname} collapsed={collapsed} />
        {secondaryItems.length > 0 && (
          <>
            <div className="my-3 mx-3 border-t border-slate-100" />
            <NavSection label="Quick Access" items={secondaryItems} pathname={pathname} collapsed={collapsed} />
          </>
        )}
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
  flyoutMode,
  onNavigate,
  isFlyoutOpen,
  onToggleFlyout,
}: {
  item: NavItem;
  depth: number;
  pathname: string | null;
  collapsed: boolean;
  /** True when rendered inside a flyout popover — nested groups cascade into
   * another side flyout instead of expanding inline underneath. */
  flyoutMode?: boolean;
  /** Called when a leaf link navigates — used to close the flyout(s) it was opened from. */
  onNavigate?: () => void;
  /** Controlled state for mutually exclusive sibling flyouts. */
  isFlyoutOpen?: boolean;
  onToggleFlyout?: (open: boolean) => void;
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

  // Collapsed rail: clicking a parent icon opens a flyout with its children
  // instead of expanding inline (there's no room to nest in a 64px rail).
  // Rendered via a portal (positioned with getBoundingClientRect) since the
  // sidebar's nav wrapper has overflow-x-hidden/overflow-y-auto and would
  // otherwise clip an absolutely-positioned popover.
  // scroll/resize, or picking a leaf link inside it.
  const [localFlyoutOpen, setLocalFlyoutOpen] = useState(false);
  const flyoutOpen = isFlyoutOpen !== undefined ? isFlyoutOpen : localFlyoutOpen;
  const setFlyoutOpen = onToggleFlyout || setLocalFlyoutOpen;
  
  // Track which child has its flyout open to ensure mutual exclusivity
  const [activeChildFlyout, setActiveChildFlyout] = useState<string | null>(null);

  const [flyoutPos, setFlyoutPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Measure the button and set the popover position *before* opening, so the
  // portal paints in the right spot on its first frame instead of flashing at
  // the top-left corner (0,0) until the positioning effect catches up.
  function toggleFlyout() {
    if (!flyoutOpen) {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setFlyoutPos({ top: rect.top, left: rect.right + 8 });
    }
    setFlyoutOpen(!flyoutOpen);
  }

  useEffect(() => {
    if (!flyoutOpen) return;
    // Re-measure in case layout shifted between click and open.
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setFlyoutPos({ top: rect.top, left: rect.right + 8 });

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      // A click inside a cascaded (deeper) flyout shouldn't close this one.
      if (isInsideAnyFlyout(target)) return;
      setFlyoutOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFlyoutOpen(false);
    }
    function handleClose() {
      setFlyoutOpen(false);
      setActiveChildFlyout(null);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleClose);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [flyoutOpen]);

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

  // Collapsed (icon-only) rail: no room for nesting.
  if (collapsed) {
    if (depth > 0) return null;

    const iconButtonClass = `relative flex items-center justify-center h-10 w-10 mx-auto rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
      isActive || hasActiveDescendant || flyoutOpen
        ? "bg-blue-50 text-blue-700"
        : "text-slate-700 hover:bg-slate-100"
    }`;

    // Parents with children: clicking the icon opens a flyout listing them.
    if (hasChildren) {
      return (
        <li>
          <button
            ref={buttonRef}
            type="button"
            onClick={toggleFlyout}
            title={name}
            aria-expanded={flyoutOpen}
            aria-haspopup="true"
            className={iconButtonClass}
          >
            {icon}
          </button>
          {flyoutOpen &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                ref={popoverRef}
                data-nav-flyout
                style={{ position: "fixed", top: flyoutPos.top, left: flyoutPos.left }}
                className="z-50 min-w-56 rounded-lg border border-slate-200 bg-white py-2 shadow-lg"
              >
                <p className="px-3 pb-2 mb-1 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  {name}
                </p>
                <ul className="px-1 space-y-0.5">
                  {children.map((child) => (
                    <NavNode
                      key={child.name}
                      item={child}
                      depth={0}
                      pathname={pathname}
                      collapsed={false}
                      flyoutMode
                      onNavigate={() => {
                        setFlyoutOpen(false);
                        setActiveChildFlyout(null);
                      }}
                      isFlyoutOpen={activeChildFlyout === child.name}
                      onToggleFlyout={(o) => setActiveChildFlyout(o ? child.name : null)}
                    />
                  ))}
                </ul>
              </div>,
              document.body,
            )}
        </li>
      );
    }

    // Leaf items: plain icon link.
    const target = href ?? firstHref(item);
    return (
      <li>
        {external ? (
          <a href={target} target="_blank" rel="noopener noreferrer" title={name} className={iconButtonClass}>
            {icon}
          </a>
        ) : (
          <Link href={target} title={name} aria-current={isActive ? "page" : undefined} className={iconButtonClass}>
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

  // Inside a flyout popover: a nested group cascades into its own side
  // flyout (positioned off this row) instead of expanding inline downward.
  if (flyoutMode && hasChildren) {
    return (
      <li>
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleFlyout}
          aria-expanded={flyoutOpen}
          aria-haspopup="true"
          className={rowClass}
          style={indent}
        >
          {icon}
          <span className="flex-1 text-left whitespace-nowrap">{name}</span>
          <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
        {flyoutOpen &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={popoverRef}
              data-nav-flyout
              style={{ position: "fixed", top: flyoutPos.top, left: flyoutPos.left }}
              className="z-50 min-w-56 rounded-lg border border-slate-200 bg-white py-2 shadow-lg"
            >
              <ul className="px-1 space-y-0.5">
                {children.map((child) => (
                  <NavNode
                    key={child.name}
                    item={child}
                    depth={0}
                    pathname={pathname}
                    collapsed={false}
                    flyoutMode
                    onNavigate={() => {
                      setFlyoutOpen(false);
                      setActiveChildFlyout(null);
                      onNavigate?.();
                    }}
                    isFlyoutOpen={activeChildFlyout === child.name}
                    onToggleFlyout={(o) => setActiveChildFlyout(o ? child.name : null)}
                  />
                ))}
              </ul>
            </div>,
            document.body,
          )}
      </li>
    );
  }

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
                onNavigate={onNavigate}
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
          onClick={onNavigate}
        >
          {inner}
        </a>
      ) : (
        <Link
          href={href ?? "#"}
          aria-current={isActive ? "page" : undefined}
          className={rowClass}
          style={indent}
          onClick={onNavigate}
        >
          {inner}
        </Link>
      )}
    </li>
  );
}
