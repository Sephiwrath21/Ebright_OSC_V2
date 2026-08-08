import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { KanbanBoard } from '@/components/crm/opportunities/kanban-board'
import { WhatsappLeadsButton } from '@/components/crm/opportunities/whatsapp-leads-button'
import { OppFilterProvider } from '@/components/crm/opportunities/opp-filter-context'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { hasPermission } from '@/lib/crm/permissions'
import { isOperationAccount, isMarketingAccount, MARKETING_BRANCH_NAME } from '@/lib/crm/operation-accounts'

export const dynamic = 'force-dynamic'

export default async function OpportunitiesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect('/login')

  const access = await resolveBranchAccess(session.user.id)
  if (!access) redirect('/login')

  const { tenantId, primaryBranchId: branchId, branchIds, elevated, role } = access
  // Regional managers / multi-branch BMs aren't "elevated" but oversee several
  // branches — they get an "All my branches" aggregate + a working pipeline
  // switcher, scoped server-side to their own branches.
  const isMultiBranchNonElevated = !elevated && branchIds.length > 1
  const canSwitchBranches = elevated || isMultiBranchNonElevated
  // AGENCY_ADMIN has read-only leads; lead delete is SUPER_ADMIN-only.
  const canEditLeads = hasPermission(role, 'opportunities:write')
  const canDeleteLeads = hasPermission(role, 'opportunities:delete')
  // QAQC verification: Super Admin / Regional Manager / Operation can see +
  // click the tick; only Super Admin can unverify + edit the verified date.
  const canQAQC = access.isSuperAdmin || role === 'REGIONAL_MANAGER' || isOperationAccount(session.user.email)
  const canQAQCManage = access.isSuperAdmin

  // ── Role gate ──────────────────────────────────────────────────────────────
  // Lead opportunities page is for SUPER_ADMIN, AGENCY_ADMIN, BRANCH_MANAGER.
  // HR users (and BRANCH_STAFF / unknown roles) get bounced to the home so
  // they can find the right module.
  const hrmsRole = (session.user as { role?: string } | undefined)?.role
  const allowedLeadRoles = new Set(['SUPER_ADMIN', 'AGENCY_ADMIN', 'BRANCH_MANAGER'])
  if (hrmsRole && !allowedLeadRoles.has(hrmsRole) && !elevated) {
    redirect('/dashboards/crm')
  }

  // Parallelise every independent query — the remote Postgres is on a round-
  // trip of ~100–200ms each; running these in sequence makes the page sluggish.
  const [rawPipelines, branches, userBranches] = await Promise.all([
    prisma.crm_pipeline.findMany({
      where: { tenantId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          select: { id: true, name: true, order: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    // Every branch in the tenant (HR is filtered out of the pipeline list
    // below by name). Fetching dynamically — instead of an in-code whitelist —
    // means a newly-added branch's pipeline shows up automatically.
    prisma.crm_branch.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.crm_user_branch.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, name: true, email: true } } },
      distinct: ['userId'],
    }),
  ])

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]))

  // Marketing sees every branch's kanban but may only MOVE cards in its own
  // branch. Everyone else edits anywhere their role/scope allows (null).
  const editableBranchIds = isMarketingAccount(session.user.email)
    ? branches.filter((b) => b.name === MARKETING_BRANCH_NAME).map((b) => b.id)
    : null

  // Keep only pipelines whose branch is in the canonical list. Opportunities on
  // legacy/removed branches still surface via "All Branches".
  const pipelines = rawPipelines
    .map((p) => {
      const branchName = branchNameById.get(p.branchId)
      if (!branchName) return null
      return { ...p, name: branchName, _branchName: branchName }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    // The Lead opportunities page only shows English-Speaking branch pipelines.
    // HR / Recruitment pipelines live on their own page (/crm/recruitment) and
    // must NOT appear in this dropdown.
    .filter((p) => !/ebright\s*hr/i.test(p._branchName))
    .sort((a, b) => a._branchName.localeCompare(b._branchName))
    .map(({ _branchName: _b, ...rest }) => rest)

  // Role-based scoping:
  //  - SUPER_ADMIN / AGENCY_ADMIN → can see all pipelines + the "All Branches"
  //    aggregate view
  //  - BRANCH_MANAGER (and lower) → locked to the pipelines of every branch
  //    they're explicitly linked to (a user may hold multiple branch grants)
  let scopedPipelines = pipelines
  const isMarketing = isMarketingAccount(session.user.email)
  if (isMarketing) {
    // Marketing gets exactly two options in the kanban dropdown:
    //   - "All branches": an aggregate of every OTHER branch's leads (its own
    //     Marketing leads are deliberately excluded — they live under the
    //     Marketing board), view-only.
    //   - "Marketing": its own branch board, the only leads it may edit.
    // No per-branch entries: Marketing can't target a specific other branch's
    // kanban, only the whole-agency aggregate.
    const marketingPipeline = pipelines.find((p) => branchNameById.get(p.branchId) === MARKETING_BRANCH_NAME)
    const refForAggregate = pipelines.find((p) => branchNameById.get(p.branchId) !== MARKETING_BRANCH_NAME) ?? marketingPipeline
    scopedPipelines = [
      ...(refForAggregate
        ? [{
            id: `all:${refForAggregate.id}`,
            branchId: '',
            name: 'All branches',
            stages: refForAggregate.stages,
            tenantId,
            createdAt: refForAggregate.createdAt,
            updatedAt: refForAggregate.updatedAt,
          } as typeof refForAggregate]
        : []),
      ...(marketingPipeline ? [marketingPipeline] : []),
    ]
  } else if (elevated) {
    // Admins: prepend the synthetic tenant-wide "All Branches" pipeline
    const firstReal = pipelines[0]
    if (firstReal) {
      scopedPipelines = [
        {
          id: `all:${firstReal.id}`,
          branchId: '',
          name: 'All Branches',
          stages: firstReal.stages,
          tenantId,
          createdAt: firstReal.createdAt,
          updatedAt: firstReal.updatedAt,
        } as typeof firstReal,
        ...pipelines,
      ]
    }
  } else {
    // Non-elevated: only their own branches' pipelines. Multi-branch users
    // (regional managers) additionally get an "All my branches" aggregate,
    // scoped server-side to their branches.
    const own = pipelines.filter((p) => branchIds.includes(p.branchId))
    scopedPipelines = own
    if (isMultiBranchNonElevated) {
      const firstReal = own[0]
      if (firstReal) {
        scopedPipelines = [
          {
            id: `all:${firstReal.id}`,
            branchId: '',
            name: 'All my branches',
            stages: firstReal.stages,
            tenantId,
            createdAt: firstReal.createdAt,
            updatedAt: firstReal.updatedAt,
          } as typeof firstReal,
          ...own,
        ]
      }
    }
  }

  // (userBranches already fetched above in Promise.all — reuse here)
  const users = userBranches.map((ub) => ({
    id: ub.user.id,
    name: ub.user.name,
    email: ub.user.email,
  }))

  // Regional managers land on "All my branches" (the prepended aggregate) so
  // they see their whole region up front, not just their primary branch.
  // Marketing lands on its OWN board (the editable one), not the read-only
  // all-branches aggregate.
  const defaultPipelineId = isMarketing
    ? scopedPipelines.find((p) => !p.id.startsWith('all:'))?.id ?? scopedPipelines[0]?.id ?? ''
    : isMultiBranchNonElevated
      ? scopedPipelines[0]?.id ?? ''
      : scopedPipelines.find((p) => p.branchId === branchId)?.id
        ?? scopedPipelines[0]?.id
        ?? ''

  if (!defaultPipelineId) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500 text-sm p-8">
        No pipelines configured. Go to Settings &rarr; Pipelines to create one.
      </div>
    )
  }

  return (
    <OppFilterProvider>
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
          Opportunities
        </h1>
        {/* Compulsory: branch managers must clear every inbound WhatsApp lead.
            The button reads the kanban's day filter via OppFilterProvider. */}
        <WhatsappLeadsButton />
      </div>

      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          initialPipelineId={defaultPipelineId}
          pipelines={scopedPipelines}
          branches={branches}
          users={users}
          defaultBranchId={branchId}
          canSwitchBranches={canSwitchBranches}
          canEditLeads={canEditLeads}
          canDeleteLeads={canDeleteLeads}
          canQAQC={canQAQC}
          canQAQCManage={canQAQCManage}
          editableBranchIds={editableBranchIds}
        />
      </div>
    </div>
    </OppFilterProvider>
  )
}
