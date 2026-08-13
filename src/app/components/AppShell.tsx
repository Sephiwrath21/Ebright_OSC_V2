"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { BreadcrumbProvider } from "./BreadcrumbContext";

interface AppShellProps {
  children: ReactNode;
  email?: string;
  role?: string;
  name?: string | null;
}

// In-memory global state so client-side navigation (remounts) can read the last state instantly
let globalCollapsed = typeof window !== "undefined" ? localStorage.getItem("sidebar-collapsed") === "true" : false;
let isFirstLoad = true;

export default function AppShell({ children, email, role, name }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(() => {
    return isFirstLoad ? false : globalCollapsed;
  });
  // Off-canvas drawer state for small screens (< lg), independent of the
  // desktop collapse state above.
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

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
      <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {/* Desktop sidebar rail (inline, collapsible). */}
        <div className="hidden lg:flex">
          <Sidebar collapsed={collapsed} />
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
            <Sidebar collapsed={false} />
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
    </BreadcrumbProvider>
  );
}
