/**
 * Approved WhatsApp templates for a lead's branch.
 *
 * Outside WhatsApp's 24-hour customer-service window a template is the ONLY
 * message that will be delivered, so the chat panel needs this list before a
 * branch can reach out to a parent who hasn't replied recently.
 *
 * Route: /api/crm/whatsapp/templates?contactId=…
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { getWhatsAppProvider } from '@/lib/crm/whatsapp/factory'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await resolveBranchAccess(session.user.id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve the branch from the contact so the caller can only ever read
    // templates for a lead they can already see.
    const contactId = req.nextUrl.searchParams.get('contactId')
    let branchId = req.nextUrl.searchParams.get('branchId') ?? access.primaryBranchId

    if (contactId) {
      const scope = scopedPrisma(access.tenantId)
      const contact = await prisma.crm_contact.findFirst({
        where: scope.where({ id: contactId, deletedAt: null }),
        select: { branchId: true },
      })
      if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      branchId = contact.branchId
    }

    if (!access.elevated && !access.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 })
    }

    let provider: Awaited<ReturnType<typeof getWhatsAppProvider>> = null
    try {
      provider = await getWhatsAppProvider(branchId)
    } catch (err) {
      console.error('[whatsapp/templates] provider load failed:', err)
    }
    if (!provider) return NextResponse.json({ connected: false, templates: [] })

    try {
      const templates = await provider.listTemplates()
      return NextResponse.json({ connected: true, templates })
    } catch (err) {
      // A bad/expired token or a missing WABA ID shouldn't blank the chat panel
      // — report it so the UI can explain why the list is empty.
      const detail = err instanceof Error ? err.message : 'Could not load templates'
      return NextResponse.json({ connected: true, templates: [], error: detail })
    }
  } catch (err) {
    console.error('[GET /api/crm/whatsapp/templates]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
