"use client";

import { useState, useEffect, type ReactNode } from "react";
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

  useEffect(() => {
    isFirstLoad = false;
    const isCollapsed = localStorage.getItem("sidebar-collapsed") === "true";
    if (isCollapsed !== collapsed) {
      setCollapsed(isCollapsed);
      globalCollapsed = isCollapsed;
    }
  }, [collapsed]);

  return (
    <BreadcrumbProvider>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <Sidebar collapsed={collapsed} />
        <div className="flex-1 flex flex-col min-w-0 h-screen">
          <TopBar
            onToggleSidebar={() =>
              setCollapsed((c) => {
                const next = !c;
                localStorage.setItem("sidebar-collapsed", String(next));
                globalCollapsed = next;
                return next;
              })
            }
            sidebarCollapsed={collapsed}
            email={email}
            role={role}
            name={name}
          />
          <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
