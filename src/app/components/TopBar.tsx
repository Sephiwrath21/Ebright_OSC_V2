"use client";

import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import UserHeader from "./UserHeader";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

interface TopBarProps {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
  email?: string;
  role?: string;
  name?: string | null;
}

export default function TopBar({ onToggleSidebar, sidebarCollapsed, email, role, name }: TopBarProps) {
  const ToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
      <div className="h-full flex items-center gap-3 px-4 md:px-6">
        {/* Left: sidebar toggle — hamburger opens the drawer on mobile, panel
            icon collapses the rail on desktop. */}
        <button
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Menu className="w-5 h-5 lg:hidden" aria-hidden="true" />
          <ToggleIcon className="w-5 h-5 hidden lg:block" aria-hidden="true" />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: notification + profile */}
        <div className="shrink-0 flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell role={role} />
          <UserHeader email={email} role={role} name={name} />
        </div>
      </div>
    </header>
  );
}
