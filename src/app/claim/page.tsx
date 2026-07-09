import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import ClaimsView, {
  type ClaimRow,
  type StatusCounts,
  type OrgOption,
} from "@/app/components/ClaimsView";
import { canReviewClaims } from "@/app/claim/roles";

export const dynamic = "force-dynamic";

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const { status: initialStatus } = await searchParams;

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      user_id: true,
      role_id: true,
      email: true,
      role: { select: { role_type: true } },
    },
  });
  if (!me) redirect("/login");

  const isFinance = canReviewClaims({
    role_id: me.role_id,
    email: me.email,
    role_type: me.role?.role_type ?? null,
  });
  const isSuperadmin = me.role?.role_type?.toLowerCase() === "superadmin";

  const [claims, branches, departments] = await Promise.all([
    prisma.claim.findMany({
      where: isFinance ? {} : { user_id: me.user_id },
      orderBy: { submitted_on: "desc" },
      include: {
        users: {
          select: {
            email: true,
            user_profile: { select: { full_name: true, nick_name: true } },
            employment: {
              take: 1,
              orderBy: { employment_id: "desc" },
              select: {
                branch_id: true,
                branch: { select: { branch_name: true, branch_code: true } },
                department: { select: { department_name: true, department_code: true } },
              },
            },
          },
        },
      },
    }),
    isFinance
      ? prisma.branch.findMany({
          select: { branch_id: true, branch_code: true, branch_name: true },
          orderBy: { branch_name: "asc" },
        })
      : Promise.resolve([]),
    isFinance
      ? prisma.department.findMany({
          select: { department_id: true, department_code: true, department_name: true },
          orderBy: { department_name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const rows: ClaimRow[] = claims.map((c) => {
    const profile = c.users.user_profile;
    const employment = c.users.employment[0];
    const branchLabel =
      employment?.branch?.branch_code ??
      (employment?.branch_id === null
        ? employment?.department?.department_code ?? "—"
        : employment?.branch?.branch_name ?? "—");
    return {
      claimId: c.claim_id,
      displayId: `CLM-${String(c.claim_id).padStart(3, "0")}`,
      employeeName: profile?.full_name ?? c.users.email,
      branch: branchLabel,
      claimType: c.claim_type,
      amount: Number(c.amount),
      claimDate: c.claim_date.toISOString().slice(0, 10),
      status: c.status,
    };
  });

  const counts: StatusCounts = {
    submitted: rows.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    disbursed: 0,
    received: 0,
  };
  for (const r of rows) {
    if (r.status in counts) counts[r.status as keyof StatusCounts] += 1;
  }

  const orgOptions: OrgOption[] = [
    ...branches
      .filter((b) => b.branch_code)
      .map((b) => ({
        code: b.branch_code!,
        label: `${b.branch_name} (${b.branch_code})`,
        kind: "branch" as const,
      })),
    ...departments
      .filter((d) => d.department_code)
      .map((d) => ({
        code: d.department_code!,
        label: `${d.department_name} (${d.department_code})`,
        kind: "department" as const,
      })),
  ];

  const userEmail = session.user?.email ?? "";
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userName = session.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <ClaimsView
        claims={rows}
        counts={counts}
        isFinance={isFinance}
        isSuperadmin={isSuperadmin}
        orgOptions={orgOptions}
        initialStatus={initialStatus ?? ""}
      />
    </AppShell>
  );
}
