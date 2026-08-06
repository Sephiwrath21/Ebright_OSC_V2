import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { scopedPrisma } from '@/lib/crm/tenancy'
import { z } from 'zod'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'
import { getWhatsAppProvider } from '@/lib/crm/whatsapp/factory'
import { normalizePhone } from '@/lib/crm/utils'

const MessageSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP', 'SMS']),
  direction: z.enum(['IN', 'OUT']).default('OUT'),
  body: z.string().min(1),
  subject: z.string().optional(),
  /**
   * Send as a pre-approved template instead of free text. Required to open a
   * conversation outside WhatsApp's 24-hour customer-service window — a plain
   * text send to a parent who hasn't messaged in 24h is rejected by Meta.
   */
  templateName: z.string().optional(),
  templateVars: z.record(z.string(), z.string()).optional(),
  /** Language the template was approved under — Meta rejects a mismatch. */
  templateLanguage: z.string().optional(),
})

async function resolveTenantAndBranch(userId: string) {
  const ub = await prisma.crm_user_branch.findFirst({
    where: { userId },
    select: { tenantId: true, branchId: true },
  })
  return ub ?? null
}

// GET — the conversation thread for one contact (drives the per-lead chat panel)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await resolveTenantAndBranch(session.user.id)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const scope = scopedPrisma(ctx.tenantId)
    const { id: contactId } = await params
    const channel = req.nextUrl.searchParams.get('channel') ?? 'WHATSAPP'

    const contact = await prisma.crm_contact.findFirst({
      where: scope.where({ id: contactId, deletedAt: null }),
      select: { id: true, branchId: true, phone: true, firstName: true, lastName: true },
    })
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const messages = await prisma.crm_message.findMany({
      where: { tenantId: ctx.tenantId, contactId, channel: channel as 'EMAIL' | 'WHATSAPP' | 'SMS' },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true, direction: true, body: true, subject: true,
        status: true, errorMessage: true, createdAt: true,
      },
    })

    // Is this branch actually wired up? The panel uses it to show a "connect
    // WhatsApp first" hint rather than letting a send fail silently.
    const settings = await prisma.crm_whatsapp_settings.findUnique({
      where: { branchId: contact.branchId },
      select: { provider: true, credentials: true },
    })

    // WhatsApp's 24-hour customer-service window: free-text is only allowed
    // within 24h of the parent's LAST inbound message. Outside it, only an
    // approved template goes through.
    const lastInbound = messages.filter((m) => m.direction === 'IN').at(-1)
    const windowOpen = lastInbound
      ? Date.now() - new Date(lastInbound.createdAt).getTime() < 24 * 3600 * 1000
      : false

    return NextResponse.json({
      messages,
      phone: contact.phone,
      connected: Boolean(settings?.credentials),
      provider: settings?.provider ?? null,
      windowOpen,
      windowExpiresAt: lastInbound
        ? new Date(new Date(lastInbound.createdAt).getTime() + 24 * 3600 * 1000).toISOString()
        : null,
    })
  } catch (err) {
    console.error('[GET /api/crm/contacts/[id]/messages]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await resolveTenantAndBranch(session.user.id)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const scope = scopedPrisma(ctx.tenantId)
    const { id: contactId } = await params

    const body = await req.json()
    const parsed = MessageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error' }, { status: 400 })
    }

    const contact = await prisma.crm_contact.findFirst({
      where: scope.where({ id: contactId, deletedAt: null }),
      select: { id: true, branchId: true, phone: true },
    })
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Attribute the message to the CONTACT's branch, not the sender's first
    // branch link — a regional manager replying from another branch's kanban
    // must still send from that branch's own connected WhatsApp number.
    const branchId = contact.branchId

    const message = await prisma.crm_message.create({
      data: scope.data({
        branchId,
        contactId,
        userId: session.user.id,
        channel: parsed.data.channel,
        direction: parsed.data.direction,
        body: parsed.data.body,
        // For WhatsApp there is no real subject, so reuse the column to record
        // WHICH template was used — otherwise the thread can't distinguish a
        // template send from free text after the fact.
        subject: parsed.data.subject ?? (parsed.data.templateName ? `template:${parsed.data.templateName}` : null),
        status: 'pending',
      }),
    })

    // Only outbound WhatsApp actually leaves the building today. EMAIL/SMS keep
    // the previous log-only behaviour.
    if (parsed.data.channel !== 'WHATSAPP' || parsed.data.direction !== 'OUT') {
      return NextResponse.json(message, { status: 201 })
    }

    const to = normalizePhone(contact.phone ?? '') || contact.phone
    if (!to) {
      const failed = await prisma.crm_message.update({
        where: { id: message.id },
        data: { status: 'failed', errorMessage: 'This lead has no phone number.' },
      })
      return NextResponse.json({ ...failed, error: failed.errorMessage }, { status: 400 })
    }

    let provider: Awaited<ReturnType<typeof getWhatsAppProvider>> = null
    try {
      provider = await getWhatsAppProvider(branchId)
    } catch (err) {
      console.error('[messages] provider load failed:', err)
    }

    if (!provider) {
      const failed = await prisma.crm_message.update({
        where: { id: message.id },
        data: {
          status: 'failed',
          errorMessage: 'This branch has not connected WhatsApp yet — do it in Integrations.',
        },
      })
      return NextResponse.json({ ...failed, error: failed.errorMessage }, { status: 409 })
    }

    try {
      const result = parsed.data.templateName
        ? await provider.sendTemplate(
            to,
            parsed.data.templateName,
            parsed.data.templateVars ?? {},
            parsed.data.templateLanguage,
          )
        : await provider.sendText(to, parsed.data.body)

      const sent = await prisma.crm_message.update({
        where: { id: message.id },
        data: { status: 'sent', providerMessageId: result.providerMessageId },
      })
      return NextResponse.json(sent, { status: 201 })
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Send failed'
      const failed = await prisma.crm_message.update({
        where: { id: message.id },
        data: { status: 'failed', errorMessage: detail },
      })
      // 502: the CRM did its part, the upstream provider rejected it. The row is
      // kept so the branch can see WHAT failed and why.
      return NextResponse.json({ ...failed, error: detail }, { status: 502 })
    }
  } catch (err) {
    console.error('[POST /api/crm/contacts/[id]/messages]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
