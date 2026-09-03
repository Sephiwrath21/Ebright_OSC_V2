"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { BreadcrumbProvider } from "./BreadcrumbContext";
import { NavigationBlockerProvider } from "./NavigationBlocker";
import { getNavAccess } from "./navAccess.actions";
import type { NavAccess } from "./navAccess.types";
import { getTaskManagerNavAccess } from "@/task-manager/nav-access.actions";
import type { TaskManagerNavAccess } from "@/task-manager/nav-access.actions";

interface AppShellProps {
  children: ReactNode;
  email?: string;
  role?: string;
  name?: string | null;
}

// In-memory global state so client-side navigation (remounts) can read the last state instantly
let globalCollapsed = typeof window !== "undefined" ? localStorage.getItem("sidebar-collapsed") === "true" : false;
let isFirstLoad = true;

// Session-lived cache of the user's nav access so it's fetched once, not on
// every client navigation (each route re-renders AppShell).
let cachedNavAccess: NavAccess | null = null;

// Separate session-lived cache for Task Manager's own sidebar visibility —
// a parallel, independent mechanism from cachedNavAccess above (see
// src/task-manager/nav-access.actions.ts for why it's kept separate).
let cachedTaskManagerNavAccess: TaskManagerNavAccess | null = null;

export default function AppShell({ children, email, role, name }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(() => {
    return isFirstLoad ? false : globalCollapsed;
  });
  // Off-canvas drawer state for small screens (< lg), independent of the
  // desktop collapse state above.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navAccess, setNavAccess] = useState<NavAccess | null>(cachedNavAccess);
  const [taskManagerNavAccess, setTaskManagerNavAccess] = useState<TaskManagerNavAccess | null>(
    cachedTaskManagerNavAccess,
  );
  const pathname = usePathname();

  // Fetch the viewable-module set once per session; reuse the cache thereafter.
  useEffect(() => {
    if (cachedNavAccess) return;
    let cancelled = false;
    getNavAccess()
      .then((a) => {
        cachedNavAccess = a;
        if (!cancelled) setNavAccess(a);
      })
      .catch(() => {
        /* leave the menu unfiltered if access can't be resolved */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch Task Manager's own sidebar visibility once per session — a
  // separate, parallel fetch from the one above, following the same
  // fetch-once-cache-in-module-variable pattern.
  useEffect(() => {
    if (cachedTaskManagerNavAccess) return;
    let cancelled = false;
    getTaskManagerNavAccess()
      .then((a) => {
        cachedTaskManagerNavAccess = a;
        if (!cancelled) setTaskManagerNavAccess(a);
      })
      .catch(() => {
        /* leave Template/Package/Package Table hidden if access can't be resolved */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    isFirstLoad = false;
    const isCollapsed = localStorage.getItem("sidebar-collapsed") === "true";
    if (isCollapsed !== collapsed) {
      setCollapsed(isCollapsed);
      globalCollapsed = isCollapsed;
    }
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes (i.e. a nav link was picked).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileOpen]);

  // The TopBar button collapses the rail on desktop and opens the drawer on mobile.
  const handleToggle = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed((c) => {
        const next = !c;
        localStorage.setItem("sidebar-collapsed", String(next));
        globalCollapsed = next;
        return next;
      });
    } else {
      setMobileOpen((o) => !o);
    }
  };

  return (
    <BreadcrumbProvider>
      <NavigationBlockerProvider>
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
          {/* Desktop sidebar rail (inline, collapsible). */}
          <div className="hidden lg:flex">
            <Sidebar collapsed={collapsed} navAccess={navAccess} taskManagerNavAccess={taskManagerNavAccess} />
          </div>

          {/* Mobile off-canvas drawer + backdrop. */}
          <div
            className={`fixed inset-0 z-40 lg:hidden ${mobileOpen ? "" : "pointer-events-none"}`}
            aria-hidden={!mobileOpen}
          >
            <div
              onClick={() => setMobileOpen(false)}
              className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-200 ${
                mobileOpen ? "opacity-100" : "opacity-0"
              }`}
            />
            <div
              className={`absolute inset-y-0 left-0 flex shadow-xl transition-transform duration-200 ease-out ${
                mobileOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <Sidebar collapsed={false} navAccess={navAccess} taskManagerNavAccess={taskManagerNavAccess} />
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0 h-screen">
            <TopBar
              onToggleSidebar={handleToggle}
              sidebarCollapsed={collapsed}
              email={email}
              role={role}
              name={name}
            />
            <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">{children}</main>
          </div>
        </div>
      </NavigationBlockerProvider>
    </BreadcrumbProvider>
  );
}
