"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Home, User, LogOut, ShieldCheck, Users,
  ChevronLeft, Check, ArrowRight, Search,
} from "lucide-react";
import { displayNameFor, formatRoleLabel, getAvatarInitials } from "@/lib/roles";

interface UserHeaderProps {
  email?: string;
  role?: string;
  name?: string | null;
}

interface PickerUser {
  id: number;
  name: string;
  email: string;
  role: string;
  branchName: string | null;
}

const ROLE_TABS = [
  { value: "",                 label: "All"              },
  { value: "superadmin",       label: "Superadmin"       },
  { value: "ceo",              label: "CEO"              },
  { value: "department",       label: "Department"       },
  { value: "branch",           label: "Branch"           },
  { value: "regional manager", label: "Regional Manager" },
  { value: "hod",              label: "HOD"              },
  { value: "staff",            label: "Staff"            },
];

const ROLE_ORDER = ["superadmin", "ceo", "department", "branch", "regional manager", "hod", "staff"];

function UserRow({ u, isCurrent, onSelect }: { u: PickerUser; isCurrent: boolean; onSelect: (id: number) => void }) {
  const uInitials = getAvatarInitials(u.name);
  return (
    <button
      disabled={isCurrent}
      onClick={() => onSelect(u.id)}
      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-default text-left group"
    >
      <span className="w-7 h-7 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-semibold text-xs group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-950 dark:group-hover:text-indigo-300 transition-colors">
        {uInitials}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{u.name}</p>
        <p className="text-xs text-slate-400 truncate">{u.email}</p>
      </div>
      {isCurrent ? (
        <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
      ) : (
        <span className="shrink-0 text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">
          {formatRoleLabel(u.role)}
        </span>
      )}
    </button>
  );
}

export default function UserHeader({ email = "", role = "", name = null }: UserHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loginAsOpen, setLoginAsOpen]   = useState(false);
  const [users, setUsers]               = useState<PickerUser[]>([]);
  const [search, setSearch]             = useState("");
  const [roleFilter, setRoleFilter]     = useState("");
  const [loading, setLoading]           = useState(false);
  const dropdownRef                     = useRef<HTMLDivElement>(null);
  const { data: session, update }       = useSession();
  const router                          = useRouter();

  const currentUserId    = (session?.user as { id?: string } | undefined)?.id;
  const sessionRole      = (session?.user as { role?: string } | undefined)?.role ?? role;
  const isImpersonating  = (session?.user as { isImpersonating?: boolean } | undefined)?.isImpersonating ?? false;
  const originalUserName = (session?.user as { originalUserName?: string } | undefined)?.originalUserName;

  // Derive display values — live session wins after impersonation
  const sessionUserName  = (session?.user as { name?: string } | undefined)?.name;
  const sessionUserEmail = (session?.user as { email?: string } | undefined)?.email;
  const activeDisplayName = isImpersonating
    ? (sessionUserName ?? email ?? "")
    : displayNameFor(role, name, email);
  const activeEmail     = sessionUserEmail ?? email;
  const activeInitials  = getAvatarInitials(activeDisplayName);
  const activeRoleLabel = formatRoleLabel(sessionRole || role);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
        setLoginAsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function openLoginAs() {
    setLoginAsOpen(true);
    setSearch("");
    setRoleFilter("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data: PickerUser[] = await res.json();
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleImpersonate(userId: number) {
    setDropdownOpen(false);
    setLoginAsOpen(false);
    await update({ action: "impersonate", userId });
    router.push("/home");
  }

  async function handleStopImpersonating() {
    setDropdownOpen(false);
    await update({ action: "stopImpersonating" });
    router.push("/home");
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login", redirect: true });
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ── Avatar trigger button ── */}
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-haspopup="menu"
        aria-expanded={dropdownOpen}
        className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
            isImpersonating
              ? "bg-amber-500 ring-2 ring-amber-200 ring-offset-1"
              : "bg-gradient-to-br from-blue-600 to-blue-800"
          }`}
        >
          {activeInitials}
        </span>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block max-w-[160px] truncate">
          {activeDisplayName}
        </span>
        {isImpersonating && (
          <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Viewing
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 dark:ring-1 dark:ring-white/10 z-50 overflow-hidden"
        >
          {!loginAsOpen ? (
            <>
              {/* ── Profile header ── */}
              <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{activeDisplayName}</p>
                <div className="mt-0.5 flex items-center gap-2 min-w-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{activeEmail}</span>
                  {(sessionRole || role) && (sessionRole || role) !== "staff" && (
                    <span className="inline-flex items-center shrink-0 rounded-md bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-200 dark:ring-blue-900 uppercase tracking-wider">
                      {activeRoleLabel}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Impersonation active card ── */}
              {isImpersonating && (
                <div className="mx-3 mt-2.5 mb-1 border-l-2 border-amber-400 bg-amber-50 rounded-r-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 shrink-0 bg-amber-400 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                      {activeInitials}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{activeDisplayName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{activeEmail}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleStopImpersonating}
                    className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Return to {originalUserName ?? "your account"}
                  </button>
                </div>
              )}

              {/* ── Nav items ── */}
              <div className="py-2">
                <Link
                  href="/home"
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => setDropdownOpen(false)}
                >
                  <Home className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  <span>Home</span>
                </Link>
                <Link
                  href="/profile"
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => setDropdownOpen(false)}
                >
                  <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  <span>My Profile</span>
                </Link>
                {sessionRole === "superadmin" && (
                  <Link
                    href="/approvals"
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    <span>Approvals</span>
                  </Link>
                )}

                {/* ── Login As ── */}
                {sessionRole === "superadmin" && !isImpersonating && (
                  <button
                    onClick={openLoginAs}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors group"
                  >
                    <span className="w-5 h-5 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
                      <Users className="w-3 h-3 text-white" />
                    </span>
                    <span className="flex-1 text-left font-medium group-hover:text-indigo-700">Login As</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                  </button>
                )}
              </div>

              {/* ── Log out ── */}
              <div className="border-t border-slate-100 dark:border-slate-800 py-1.5">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors font-medium"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>Log out</span>
                </button>
              </div>
            </>
          ) : (
            /* ── User picker panel ── */
            <div className="flex flex-col" style={{ maxHeight: 460 }}>
              {/* Clean header */}
              <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <button
                  onClick={() => setLoginAsOpen(false)}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  aria-label="Back to menu"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </button>
                <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Login as user</span>
                <span className="w-5 h-5 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
                  <Users className="w-3 h-3 text-white" />
                </span>
              </div>

              {/* Search & role filters */}
              <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 dark:border-slate-800 space-y-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search users…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    autoFocus
                  />
                </div>
                <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                  {ROLE_TABS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setRoleFilter(t.value)}
                      className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                        roleFilter === t.value
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* User list */}
              <div className="overflow-y-auto flex-1">
                {loading ? (
                  <p className="text-xs text-slate-400 text-center py-8">Loading…</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">No users found</p>
                ) : roleFilter !== "" ? (
                  filteredUsers.map((u) => (
                    <UserRow
                      key={u.id}
                      u={u}
                      isCurrent={String(u.id) === currentUserId}
                      onSelect={handleImpersonate}
                    />
                  ))
                ) : (
                  ROLE_ORDER.flatMap((r) => {
                    const group = filteredUsers.filter((u) => u.role === r);
                    if (group.length === 0) return [];
                    return [
                      <div key={`hdr-${r}`} className="px-3 pt-3 pb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {formatRoleLabel(r)}
                        </span>
                      </div>,
                      ...group.map((u) => (
                        <UserRow
                          key={u.id}
                          u={u}
                          isCurrent={String(u.id) === currentUserId}
                          onSelect={handleImpersonate}
                        />
                      )),
                    ];
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
