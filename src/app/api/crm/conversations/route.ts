/**
 * Unified WhatsApp inbox — every lead in the viewer's branches that has a
 * WhatsApp thread, newest activity first.
 *
 * Backs the Conversations sidebar page. The per-lead panel in the kanban popup
 * and the lead detail page read the same crm_message rows, so a reply sent from
 * any of the three shows up in all of them.
 *
 * Route: /api/crm/conversations
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { resolveBranchAccess } from '@/lib/crm/branch-access'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 24 * 3600 * 1000

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await resolveBranchAccess(session.user.id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const search = (req.nextUrl.searchParams.get('q') ?? '').trim()

    // Elevated users see the whole tenant; everyone else only their branches.
    const branchFilter = access.elevated ? {} : { branchId: { in: access.branchIds } }

    // One row per contact would need a lateral join; at CRM message volumes it's
    // cheaper and simpler to pull the recent slice and fold it in memory.
    const recent = await prisma.crm_message.findMany({
      where: { tenantId: access.tenantId, channel: 'WHATSAPP', ...branchFilter },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        id: true, contactId: true, branchId: true, direction: true,
        body: true, status: true, createdAt: true,
      },
    })

    const byContact = new Map<string, {
      contactId: string
      branchId: string
      lastBody: string
      lastAt: Date
      lastDirection: 'IN' | 'OUT'
      lastInboundAt: Date | null
      total: number
    }>()

    for (const m of recent) {
      const existing = byContact.get(m.contactId)
      if (!existing) {
        byContact.set(m.contactId, {
          contactId: m.contactId,
          branchId: m.branchId,
          lastBody: m.body,
          lastAt: m.createdAt,
          lastDirection: m.direction,
          lastInboundAt: m.direction === 'IN' ? m.createdAt : null,
          total: 1,
        })
        continue
      }
      existing.total += 1
      // Rows arrive newest-first, so the first inbound we meet is the latest.
      if (m.direction === 'IN' && !existing.lastInboundAt) existing.lastInboundAt = m.createdAt
    }

    const contactIds = [...byContact.keys()]
    if (contactIds.length === 0) return NextResponse.json({ conversations: [] })

    const [contacts, branches] = await Promise.all([
      prisma.crm_contact.findMany({
        where: { id: { in: contactIds }, deletedAt: null },
        select: {
          id: true, firstName: true, lastName: true, phone: true, parentFullName: true,
          opportunities: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, stage: { select: { shortCode: true } } },
          },
        },
      }),
      prisma.crm_branch.findMany({
        where: { tenantId: access.tenantId },
        select: { id: true, name: true },
      }),
    ])

    const branchName = new Map(branches.map((b) => [b.id, b.name]))
    const now = Date.now()

    let conversations = contacts.map((c) => {
      const t = byContact.get(c.id)!
      const name = `${c.firstName} ${c.lastName ?? ''}`.trim() || c.phone || '(No name)'
      return {
        contactId: c.id,
        opportunityId: c.opportunities[0]?.id ?? null,
        stageCode: c.opportunities[0]?.stage?.shortCode ?? null,
        name,
        parentName: c.parentFullName,
        phone: c.phone,
        branchId: t.branchId,
        branchName: branchName.get(t.branchId) ?? '—',
        lastBody: t.lastBody,
        lastAt: t.lastAt,
        lastDirection: t.lastDirection,
        messageCount: t.total,
        // Needs a reply: the parent spoke last. Paired with the window flag this
        // tells staff at a glance which threads they can still answer freely.
        awaitingReply: t.lastDirection === 'IN',
        windowOpen: t.lastInboundAt ? now - t.lastInboundAt.getTime() < WINDOW_MS : false,
      }
    })

    if (search) {
      const q = search.toLowerCase()
      conversations = conversations.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? '').includes(q) ||
          (c.parentName ?? '').toLowerCase().includes(q),
      )
    }

    conversations.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())

    return NextResponse.json({ conversations })
  } catch (err) {
    console.error('[GET /api/crm/conversations]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
