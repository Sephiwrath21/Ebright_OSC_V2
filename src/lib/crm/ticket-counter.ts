import 'server-only'

// Per-platform ticket tally for the OD homepage "Tickets Counter" card.
//
// This is the one place OUTSIDE the CRM module that reads CRM data (the
// /api/od/dashboard route). It used to go through the legacy read-only
// `lib/crm-db.ts` pg pool; now it rides the CRM's own Prisma client so the
// legacy flat crm-*.ts libs could be deleted.
//
// `@/lib/crm/db` throws at module load when CRM_DATABASE_URL is unset, so the
// client is imported lazily — a portal deployment without the CRM link keeps
// working (isCrmAvailable() → false, counter → null → demo-table fallback).

export function isCrmAvailable(): boolean {
  return !!process.env.CRM_DATABASE_URL
}

/** Tenant used for the portal-side tally: prefer the real 'ebright' tenant,
 *  fall back to the oldest one (mirrors the legacy resolver's behaviour). */
async function resolveTenantId(
  prisma: (typeof import('@/lib/crm/db'))['prisma'],
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM crm.crm_tenant
     WHERE slug IN ('ebright', 'ebright-demo')
     ORDER BY "createdAt" ASC LIMIT 1`
  if (rows[0]?.id) return rows[0].id
  const any = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM crm.crm_tenant ORDER BY "createdAt" ASC LIMIT 1`
  return any[0]?.id ?? null
}

/** Total tickets and how many are solved (status = 'complete') per platform.
 *  `count` is the solved subset; the card bar renders count/total. */
export async function getTicketCounterByPlatform(): Promise<
  { name: string; count: number; total: number }[] | null
> {
  if (!isCrmAvailable()) return null
  const { prisma } = await import('@/lib/crm/db')
  const tenantId = await resolveTenantId(prisma)
  if (!tenantId) return null
  const rows = await prisma.$queryRaw<{ name: string; total: number; solved: number }[]>`
    SELECT p.name,
           COUNT(t.id)::int AS total,
           COUNT(t.id) FILTER (WHERE t.status = 'complete')::int AS solved
      FROM crm.tkt_platform p
      LEFT JOIN crm.tkt_ticket t ON t.platform_id = p.id AND t.tenant_id = ${tenantId}
     WHERE p.tenant_id = ${tenantId}
     GROUP BY p.name
     ORDER BY total DESC, p.name ASC`
  return rows.map((r) => ({ name: r.name, count: Number(r.solved), total: Number(r.total) }))
}
