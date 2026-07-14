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

export default function AppShell({ children, email, role, name }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "true");
  }, []);

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
