/**
 * Per-branch WhatsApp connection — the self-service half of the Integrations
 * page.
 *
 * Nothing here is hardcoded: each branch supplies its OWN WhatsApp Business
 * credentials, they are encrypted at rest in crm_whatsapp_settings (keyed by
 * branchId), and every send/receive for that branch runs through them. That is
 * what makes the feature safe to carry into multi-tenancy — a new tenant
 * connects its own numbers without a code change or a shared app token.
 *
 * GET    → connection status + the webhook URL / verify token to paste into Meta
 * POST   → verify the supplied credentials against the live API, then save
 * DELETE → disconnect (drops credentials + verify token)
 *
 * Route: /api/crm/integrations/whatsapp
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { encrypt, decrypt } from '@/lib/crm/crypto'
import { resolveBranchAccess } from '@/lib/crm/branch-access'
import { denyReadOnlyViewer } from '@/lib/crm/admin-session'
import { buildWhatsAppProvider } from '@/lib/crm/whatsapp/factory'

export const dynamic = 'force-dynamic'

const VERIFY_TOKEN_KEY = 'meta_verify_token'

// ─── Request shapes ─────────────────────────────────────────────────────────

const MetaSchema = z.object({
  provider: z.literal('META_CLOUD'),
  /** Optional — super admins may connect a branch other than their own. */
  // Not .uuid() — the scope check in targetBranch() is the real guard, and some
  // seeded branches predate uuid IDs.
  branchId: z.string().min(1).optional(),
  phoneNumberId: z.string().trim().min(1, 'Phone number ID is required'),
  accessToken: z.string().trim().min(1, 'Access token is required'),
  appSecret: z.string().trim().min(1, 'App secret is required'),
  /** Optional: only needed so the chat panel can list approved templates. */
  wabaId: z.string().trim().optional(),
})

const TwilioSchema = z.object({
  provider: z.literal('TWILIO'),
  // Not .uuid() — the scope check in targetBranch() is the real guard, and some
  // seeded branches predate uuid IDs.
  branchId: z.string().min(1).optional(),
  accountSid: z.string().trim().min(1, 'Account SID is required'),
  authToken: z.string().trim().min(1, 'Auth token is required'),
  fromNumber: z.string().trim().min(1, 'WhatsApp number is required'),
})

const ConnectSchema = z.discriminatedUnion('provider', [MetaSchema, TwilioSchema])

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Ctx {
  userId: string
  tenantId: string
  branchId: string
  /** Every branch this caller may manage a connection for. */
  manageableBranchIds: string[]
  elevated: boolean
}

/**
 * Only BRANCH_MANAGER and above may wire up a branch's WhatsApp — the
 * credentials are effectively the branch's identity to parents, so BRANCH_STAFF
 * is read-only here.
 */
const MANAGER_ROLES = new Set(['SUPER_ADMIN', 'AGENCY_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER'])

async function resolveCtx(): Promise<Ctx | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return null

  const access = await resolveBranchAccess(session.user.id)
  if (!access) return null

  const manageableBranchIds = access.elevated
    ? (await prisma.crm_branch.findMany({
        where: { tenantId: access.tenantId },
        select: { id: true },
      })).map((b) => b.id)
    : access.branchIds

  return {
    userId: session.user.id,
    tenantId: access.tenantId,
    branchId: access.primaryBranchId,
    manageableBranchIds,
    elevated: access.elevated || MANAGER_ROLES.has(access.role),
  }
}

/** Resolve the branch this request targets, rejecting out-of-scope IDs. */
function targetBranch(ctx: Ctx, requested?: string): string | null {
  const branchId = requested ?? ctx.branchId
  if (!branchId) return null
  if (!ctx.manageableBranchIds.includes(branchId)) return null
  return branchId
}

/** Show enough of a secret to recognise it, never enough to reuse it. */
function mask(value: string): string {
  if (value.length <= 6) return '••••••'
  return `${value.slice(0, 3)}••••${value.slice(-3)}`
}

async function readVerifyToken(branchId: string): Promise<string | null> {
  const row = await prisma.crm_custom_value.findFirst({
    where: { scopeId: branchId, key: VERIFY_TOKEN_KEY },
    select: { value: true },
  })
  return row?.value ?? null
}

// ─── GET — current connection ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const ctx = await resolveCtx()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const branchId = targetBranch(ctx, req.nextUrl.searchParams.get('branchId') ?? undefined)
    if (!branchId) return NextResponse.json({ error: 'No branch in scope' }, { status: 403 })

    const settings = await prisma.crm_whatsapp_settings.findUnique({
      where: { branchId },
      select: { provider: true, credentials: true, updatedAt: true },
    })

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
    const providerSlug = settings?.provider === 'TWILIO' ? 'twilio' : 'meta'

    // Masked echo of what's stored, so the branch can confirm WHICH number is
    // wired up without the page ever handling the live token again.
    let summary: Record<string, string> | null = null
    if (settings?.credentials) {
      try {
        const parsed = JSON.parse(decrypt(settings.credentials)) as Record<string, string>
        summary =
          settings.provider === 'META_CLOUD'
            ? {
                phoneNumberId: parsed.phoneNumberId ?? '',
                ...(parsed.wabaId ? { wabaId: parsed.wabaId } : {}),
                accessToken: mask(parsed.accessToken ?? ''),
                appSecret: mask(parsed.appSecret ?? ''),
              }
            : { accountSid: mask(parsed.accountSid ?? ''), fromNumber: parsed.fromNumber ?? '', authToken: mask(parsed.authToken ?? '') }
      } catch {
        // Corrupt / key-rotated ciphertext — report as an error state rather
        // than 500ing the whole Integrations page.
        summary = null
      }
    }

    return NextResponse.json({
      branchId,
      connected: Boolean(settings?.credentials) && summary !== null,
      error: Boolean(settings?.credentials) && summary === null ? 'Stored credentials could not be read — reconnect.' : null,
      provider: settings?.provider ?? null,
      summary,
      updatedAt: settings?.updatedAt ?? null,
      canManage: ctx.elevated,
      webhookUrl: `${origin}/api/webhooks/whatsapp/${providerSlug}/${branchId}`,
      verifyToken: await readVerifyToken(branchId),
    })
  } catch (err) {
    console.error('[GET /api/crm/integrations/whatsapp]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST — connect / re-connect ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied

    const ctx = await resolveCtx()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.elevated) {
      return NextResponse.json({ error: 'Only a branch manager or above can connect WhatsApp.' }, { status: 403 })
    }

    const parsed = ConnectSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid credentials payload' },
        { status: 400 },
      )
    }

    const branchId = targetBranch(ctx, parsed.data.branchId)
    if (!branchId) return NextResponse.json({ error: 'No branch in scope' }, { status: 403 })

    const credentials =
      parsed.data.provider === 'META_CLOUD'
        ? {
            phoneNumberId: parsed.data.phoneNumberId,
            accessToken: parsed.data.accessToken,
            appSecret: parsed.data.appSecret,
            ...(parsed.data.wabaId ? { wabaId: parsed.data.wabaId } : {}),
          }
        : {
            accountSid: parsed.data.accountSid,
            authToken: parsed.data.authToken,
            fromNumber: parsed.data.fromNumber,
          }

    // Verify BEFORE persisting — a branch should never end up "connected" with
    // a token that can't actually send.
    const provider = buildWhatsAppProvider(parsed.data.provider, credentials)
    if (!provider) return NextResponse.json({ error: 'Invalid credentials shape' }, { status: 400 })

    const check = await provider.verifyCredentials()
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error ?? 'Could not reach the WhatsApp API with those details.' },
        { status: 400 },
      )
    }

    const encrypted = encrypt(JSON.stringify(credentials))

    await prisma.crm_whatsapp_settings.upsert({
      where: { branchId },
      create: { tenantId: ctx.tenantId, branchId, provider: parsed.data.provider, credentials: encrypted },
      update: { provider: parsed.data.provider, credentials: encrypted },
    })

    // The webhook's GET challenge compares against this value, so it must exist
    // before the branch pastes the callback URL into Meta. Generated once and
    // reused across reconnects so an already-subscribed webhook keeps working.
    let verifyToken = await readVerifyToken(branchId)
    if (!verifyToken) {
      verifyToken = randomBytes(24).toString('hex')
      await prisma.crm_custom_value.create({
        data: {
          tenantId: ctx.tenantId,
          key: VERIFY_TOKEN_KEY,
          value: verifyToken,
          scope: 'BRANCH',
          scopeId: branchId,
        },
      })
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
    const providerSlug = parsed.data.provider === 'TWILIO' ? 'twilio' : 'meta'

    return NextResponse.json({
      connected: true,
      branchId,
      provider: parsed.data.provider,
      displayPhoneNumber: check.displayPhoneNumber ?? null,
      verifiedName: check.verifiedName ?? null,
      webhookUrl: `${origin}/api/webhooks/whatsapp/${providerSlug}/${branchId}`,
      verifyToken,
    })
  } catch (err) {
    console.error('[POST /api/crm/integrations/whatsapp]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE — disconnect ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const denied = await denyReadOnlyViewer(); if (denied) return denied

    const ctx = await resolveCtx()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.elevated) {
      return NextResponse.json({ error: 'Only a branch manager or above can disconnect WhatsApp.' }, { status: 403 })
    }

    const branchId = targetBranch(ctx, req.nextUrl.searchParams.get('branchId') ?? undefined)
    if (!branchId) return NextResponse.json({ error: 'No branch in scope' }, { status: 403 })

    // Message history in crm_message is deliberately left intact — disconnecting
    // a number must not erase the conversation record with a parent.
    await prisma.crm_whatsapp_settings.deleteMany({ where: { branchId } })
    await prisma.crm_custom_value.deleteMany({ where: { scopeId: branchId, key: VERIFY_TOKEN_KEY } })

    return NextResponse.json({ connected: false, branchId })
  } catch (err) {
    console.error('[DELETE /api/crm/integrations/whatsapp]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
