"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import UserHeader from "./UserHeader";
import NotificationBell from "./NotificationBell";

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
    <header className="sticky top-0 z-30 h-16 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="h-full flex items-center gap-3 px-4 md:px-6">
        {/* Left: sidebar toggle */}
        <button
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ToggleIcon className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: notification + profile */}
        <div className="shrink-0 flex items-center gap-1">
          <NotificationBell role={role} />
          <UserHeader email={email} role={role} name={name} />
        </div>
      </div>
    </header>
  );
}
