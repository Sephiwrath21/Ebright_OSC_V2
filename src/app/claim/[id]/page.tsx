import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import ClaimDetailView from "@/app/components/ClaimDetailView";
import { canReviewClaims } from "@/app/claim/roles";
import { getDriveMeta, looksLikeDriveId } from "@/lib/drive";

interface ResolvedAttachment {
  url: string | null;
  name: string | null;
  exists: boolean;
}

async function resolveOne(stored: string): Promise<ResolvedAttachment> {
  // New rows: Drive file IDs (no slashes, no dots, 20+ chars).
  if (looksLikeDriveId(stored)) {
    const meta = await getDriveMeta(stored);
    if (!meta) return { url: null, name: stored, exists: false };
    return { url: `/api/attachment/${stored}`, name: meta.name, exists: true };
  }

  // Legacy rows: filesystem paths or bare filenames — file is gone.
  return { url: null, name: stored, exists: false };
}

// claim.attachment holds one Drive ID, or several comma-separated (multi-doc claims).
async function resolveAttachments(stored: string | null): Promise<ResolvedAttachment[]> {
  if (!stored) return [];
  const ids = stored.split(",").map((s) => s.trim()).filter(Boolean);
  return Promise.all(ids.map(resolveOne));
}

export const dynamic = "force-dynamic";

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

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

  const { id } = await params;
  const claimId = parseInt(id, 10);
  if (Number.isNaN(claimId)) notFound();

  const claim = await prisma.claim.findUnique({
    where: { claim_id: claimId },
    include: {
      users: {
        select: {
          email: true,
          user_profile: { select: { full_name: true, nick_name: true, phone: true } },
          employment: {
            take: 1,
            orderBy: { employment_id: "desc" },
            select: {
              employee_id: true,
              position: true,
              branch_id: true,
              branch: { select: { branch_name: true, branch_code: true } },
              department: { select: { department_name: true, department_code: true } },
            },
          },
        },
      },
    },
  });

  if (!claim) notFound();

  // Employees can only view their own claims
  if (!isFinance && claim.user_id !== me.user_id) notFound();

  // Only the requester can confirm receipt of their own claim.
  const isOwner = claim.user_id === me.user_id;

  const profile = claim.users.user_profile;
  const employment = claim.users.employment[0];
  const branchLabel =
    employment?.branch?.branch_name ??
    (employment?.branch_id === null
      ? employment?.department?.department_name ?? null
      : null);

  const attachments = await resolveAttachments(claim.attachment);

  const userEmail = session.user?.email ?? "";
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userName = session.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <ClaimDetailView
        isFinance={isFinance}
        isOwner={isOwner}
        claim={{
          claimId: claim.claim_id,
          displayId: `CLM-${String(claim.claim_id).padStart(3, "0")}`,
          claimType: claim.claim_type,
          description: claim.claim_description,
          amount: Number(claim.amount),
          approvedAmount:
            claim.approved_amount !== null ? Number(claim.approved_amount) : null,
          claimDate: claim.claim_date.toISOString().slice(0, 10),
          status: claim.status,
          attachments: attachments.map((a) => ({
            url: a.url,
            exists: a.exists,
            name: a.name ?? "attachment",
          })),
          remarks: claim.remarks,
          submittedOn: claim.submitted_on.toISOString(),
          updatedAt: claim.updated_at.toISOString(),
        }}
        employee={{
          name: profile?.full_name ?? claim.users.email,
          nickName: profile?.nick_name ?? null,
          email: claim.users.email,
          phone: profile?.phone ?? null,
          employeeId: employment?.employee_id ?? null,
          position: employment?.position ?? null,
          branch: branchLabel,
          branchCode:
            employment?.branch?.branch_code ??
            employment?.department?.department_code ??
            null,
        }}
      />
    </AppShell>
  );
}
