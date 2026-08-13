import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  Home,
  ChevronRight,
  User,
  Briefcase,
  Landmark,
  HeartPulse,
  KeyRound,
  CircleCheck,
  Shield,
  Pencil,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { displayNameFor, formatRoleLabel, getAvatarInitials } from "@/lib/roles";
import { titleCaseName } from "@/lib/text";
import { listBranches, listDepartments, listTeamMembersByDepartment, type TeamMember } from "@/lib/employeeQueries";
import AppShell from "@/app/components/AppShell";
import ProfileOrgUnit from "@/app/components/ProfileOrgUnit";

export const dynamic = "force-dynamic";

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string; emailChanged?: string; updated?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    include: {
      role: true,
      user_profile: true,
      bank_details: true,
      emergency_contact: { take: 1 },
      employment: {
        include: { branch: true, department: true },
        orderBy: { start_date: "desc" },
        take: 1,
      },
    },
  });
  if (!me) redirect("/login");

  const sp = await searchParams;
  const justChanged = sp?.changed === "1";
  const emailChanged = sp?.emailChanged === "1";
  const profileUpdated = sp?.updated === "1";

  const roleType = me.role.role_type;
  const roleLabel = formatRoleLabel(roleType);
  const normalizedFullName = titleCaseName(me.user_profile?.full_name);
  const displayName = displayNameFor(roleType, normalizedFullName, me.email);
  const initials = getAvatarInitials(displayName);

  const userEmail = me.email;
  const userRole = roleType;
  const userName = session.user.name ?? null;

  const canEditOrgUnit = roleType === "admin" || roleType === "ceo" || roleType === "staff" || roleType === "branch";
  const [branches, departments, team] = await Promise.all([
    canEditOrgUnit ? listBranches() : Promise.resolve([]),
    canEditOrgUnit ? listDepartments() : Promise.resolve([]),
    roleType === "superadmin" ? listTeamMembersByDepartment("OPT", me.user_id) : Promise.resolve([] as TeamMember[]),
  ]);

  const emp = me.employment[0];
  const defaultOrgUnit = emp?.branch_id
    ? `branch:${emp.branch_id}`
    : emp?.department_id
      ? `dept:${emp.department_id}`
      : "";

  const bank = me.bank_details;
  const em = me.emergency_contact[0];

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="min-h-full bg-slate-50 dark:bg-slate-950">
        <div className="max-w-5xl mx-auto px-6 pt-4 pb-10">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
            <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
              <Home className="w-4 h-4" aria-hidden="true" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span className="text-slate-900 dark:text-slate-100 font-medium">My Profile</span>
          </nav>

          {justChanged && (
            <div role="status" className="mb-5 flex items-start gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900 text-sm text-emerald-800 dark:text-emerald-200">
              <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Password changed successfully.</span>
            </div>
          )}

          {emailChanged && (
            <div role="status" className="mb-5 flex items-start gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900 text-sm text-emerald-800 dark:text-emerald-200">
              <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Email updated. Sign out and sign in again with your new email to refresh your session.</span>
            </div>
          )}

          {profileUpdated && (
            <div role="status" className="mb-5 flex items-start gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900 text-sm text-emerald-800 dark:text-emerald-200">
              <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Profile updated.</span>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <span className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 text-white font-semibold text-lg flex items-center justify-center shrink-0">
                {initials}
              </span>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight truncate">
                  {displayName}
                </h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{me.email}</span>
                  {roleType !== "staff" && (
                    <span className="inline-flex items-center gap-1 shrink-0 rounded-md bg-blue-50 dark:bg-blue-900 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-200 dark:ring-blue-800 uppercase tracking-wider">
                      <Shield className="w-3 h-3" aria-hidden="true" />
                      {roleLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {roleType === "staff" && (
                <Link
                  href="/profile/edit"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 shadow-sm"
                >
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                  Edit My Profile
                </Link>
              )}
              <Link
                href="/profile/change-password"
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <KeyRound className="w-4 h-4" aria-hidden="true" />
                Change Password
              </Link>
            </div>
          </div>

          <div className="space-y-6 mt-6">
            <Section Icon={Shield} title="Account" description="Login credentials and sign-in activity.">
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between gap-2">
                  <span>Email</span>
                  <Link
                    href="/profile/edit-email"
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline normal-case tracking-normal"
                  >
                    Edit
                  </Link>
                </dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100 break-words">{me.email}</dd>
              </div>
              <Item label="Role" value={roleLabel} />
              <Item label="Password" value="••••••••" mono />
              <Item label="Account Status" value={me.status ?? "—"} />
              <Item label="Last Login" value={formatDateTime(me.last_login)} />
              <Item label="Member Since" value={formatDate(me.created_at)} />
            </Section>

            {roleType === "superadmin" && (
              <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <header className="flex items-start gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Profile</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Department profile and team members.</p>
                  </div>
                </header>
                <dl className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  <Item label="Name" value={displayName} />
                  <Item label="Department" value="Optimisation" />
                </dl>
                <div className="px-6 pb-6">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                    Team members {team.length > 0 && <span className="text-slate-400 normal-case tracking-normal font-normal">({team.length})</span>}
                  </h3>
                  {team.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                      No other members in the Optimisation department yet.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                      {team.map((m) => {
                        const initials = getAvatarInitials(m.fullName ?? m.email);
                        const name = m.fullName ?? m.email.split("@")[0];
                        return (
                          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                            <span className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center shrink-0">
                              {initials}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.email}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {m.position && (
                                <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 whitespace-nowrap">
                                  {m.position}
                                </span>
                              )}
                              {m.status && (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${m.status === "active" ? "bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/20"}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${m.status === "active" ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />
                                  {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {canEditOrgUnit && (
              <ProfileOrgUnit
                branches={branches}
                departments={departments}
                defaultOrgUnit={defaultOrgUnit}
                onlyBranches={roleType === "branch"}
              />
            )}

            {(roleType === "ceo" || roleType === "staff") && (
              <>
                <Section Icon={User} title="User Profile" description="Personal identity and contact details.">
                  <Item label="Full Name" value={normalizedFullName || null} span={2} />
                  <Item label="Nick Name" value={titleCaseName(me.user_profile?.nick_name) || null} />
                  <Item label="Phone" value={me.user_profile?.phone ?? null} />
                  <Item label="Gender" value={me.user_profile?.gender ?? null} />
                  <Item label="Date of Birth" value={formatDate(me.user_profile?.dob ?? null)} />
                  <Item label="NRIC" value={me.user_profile?.nric ?? null} mono />
                  <Item label="Nationality" value={me.user_profile?.nationality ?? null} />
                  <Item label="Home Address" value={me.user_profile?.home_address ?? null} span={2} />
                </Section>

                <Section Icon={Briefcase} title="Employment" description="Role, branch, and contract terms.">
                  <Item label="Employee ID" value={emp?.employee_id ?? null} mono />
                  <Item label="Position" value={emp?.position ?? null} />
                  <Item
                    label="Branch / Department"
                    value={
                      emp?.branch
                        ? `${emp.branch.branch_code} — ${emp.branch.branch_name} (Branch)`
                        : emp?.department
                          ? `${emp.department.department_code} — ${emp.department.department_name} (Department)`
                          : null
                    }
                    span={2}
                  />
                  <Item label="Employment Type" value={emp?.employment_type ?? null} />
                  <Item label="Status" value={emp?.status ?? null} />
                  <Item label="Start Date" value={formatDate(emp?.start_date ?? null)} />
                  <Item label="End Date" value={formatDate(emp?.end_date ?? null)} />
                  <Item label="Probation" value={emp?.probation ? "Yes" : "No"} />
                </Section>

                <Section Icon={Landmark} title="Bank Details" description="Used for salary disbursement.">
                  <Item label="Bank Name" value={bank?.bank_name ?? null} />
                  <Item label="Account Number" value={bank?.bank_account ?? null} mono />
                </Section>

                <Section Icon={HeartPulse} title="Emergency Contact" description="Person to reach in case of emergency.">
                  <Item label="Contact Name" value={titleCaseName(em?.name) || null} />
                  <Item label="Contact Phone" value={em?.phone ?? null} />
                  <Item label="Relation" value={em?.relation ?? null} />
                </Section>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Section({
  Icon,
  title,
  description,
  children,
}: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <header className="flex items-start gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </header>
      <dl className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
        {children}
      </dl>
    </section>
  );
}

function Item({
  label,
  value,
  span = 1,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  span?: 1 | 2;
  mono?: boolean;
}) {
  const display = value && String(value).trim() ? String(value) : "—";
  return (
    <div className={span === 2 ? "md:col-span-2" : ""}>
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-900 dark:text-slate-100 ${mono ? "tabular-nums" : ""} break-words`}>
        {display}
      </dd>
    </div>
  );
}
