/**
 * Meta WhatsApp Cloud API implementation of WhatsAppProvider.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 * API version: v20.0
 */

import { createHmac, timingSafeEqual } from 'crypto'
import type {
  ParsedInboundMessage,
  SendResult,
  VerifyResult,
  WhatsAppProvider,
  WhatsAppTemplate,
} from './provider'

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

interface MetaMessageResponse {
  messages?: Array<{ id: string }>
  error?: { message: string; code: number }
}

interface MetaWebhookMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
}

interface MetaWebhookValue {
  messages?: MetaWebhookMessage[]
}

interface MetaWebhookChange {
  value?: MetaWebhookValue
}

interface MetaWebhookEntry {
  changes?: MetaWebhookChange[]
}

interface MetaWebhookPayload {
  entry?: MetaWebhookEntry[]
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface MetaWhatsAppProviderConfig {
  /** WhatsApp Business phone number ID from Meta developer console */
  phoneNumberId: string
  /** Permanent or temporary access token with whatsapp_business_messaging permission */
  accessToken: string
  /** App secret used to verify x-hub-signature-256 webhook signatures */
  appSecret: string
  /**
   * WhatsApp Business Account ID. Optional — only needed to LIST templates,
   * since templates hang off the WABA node rather than the phone number.
   * Sending a template works without it.
   */
  wabaId?: string
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

const API_BASE = 'https://graph.facebook.com/v20.0'

export class MetaWhatsAppProvider implements WhatsAppProvider {
  private readonly phoneNumberId: string
  private readonly accessToken: string
  private readonly appSecret: string
  private readonly wabaId?: string

  constructor(config: MetaWhatsAppProviderConfig) {
    this.wabaId = config.wabaId
    this.phoneNumberId = config.phoneNumberId
    this.accessToken = config.accessToken
    this.appSecret = config.appSecret
  }

  // -------------------------------------------------------------------------
  // verifyCredentials
  // -------------------------------------------------------------------------

  /**
   * Reads the phone number node itself — the cheapest call that proves the
   * access token is valid AND that it actually grants access to THIS phone
   * number ID. A token that is valid but scoped to a different WABA fails here
   * rather than silently at first send.
   */
  async verifyCredentials(): Promise<VerifyResult> {
    const url = `${API_BASE}/${this.phoneNumberId}?fields=display_phone_number,verified_name`

    let response: Response
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }

    const data = (await response.json().catch(() => ({}))) as {
      display_phone_number?: string
      verified_name?: string
      error?: { message?: string }
    }

    if (!response.ok) {
      return {
        ok: false,
        error: data.error?.message ?? `HTTP ${response.status} from Meta`,
      }
    }

    return {
      ok: true,
      displayPhoneNumber: data.display_phone_number,
      verifiedName: data.verified_name,
    }
  }

  // -------------------------------------------------------------------------
  // listTemplates
  // -------------------------------------------------------------------------

  /**
   * Templates live on the WABA node, not the phone number, so this needs the
   * WABA ID. Without one we return an empty list rather than throwing — the UI
   * treats that as "no templates available" and tells the branch to add the ID.
   */
  async listTemplates(): Promise<WhatsAppTemplate[]> {
    if (!this.wabaId) return []

    const url = `${API_BASE}/${this.wabaId}/message_templates?limit=200&fields=name,status,category,language,components`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    })

    const data = (await response.json().catch(() => ({}))) as {
      data?: Array<{
        name?: string
        status?: string
        category?: string
        language?: string
        components?: Array<{ type?: string; text?: string }>
      }>
      error?: { message?: string }
    }

    if (!response.ok) {
      throw new Error(`[Meta WhatsApp] listTemplates failed: ${data.error?.message ?? `HTTP ${response.status}`}`)
    }

    return (data.data ?? [])
      // Only APPROVED can actually be sent — offering PENDING/REJECTED would
      // just hand the user a guaranteed failure.
      .filter((t) => (t.status ?? '').toUpperCase() === 'APPROVED' && t.name)
      .map((t) => {
        const bodyText =
          t.components?.find((c) => (c.type ?? '').toUpperCase() === 'BODY')?.text ?? ''
        // Highest placeholder index wins — {{1}} {{3}} means 3 slots, and Meta
        // rejects the send if the count doesn't match the template definition.
        const indices = [...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]))
        return {
          name: t.name as string,
          language: t.language ?? 'en',
          category: t.category ?? 'UTILITY',
          bodyText,
          variableCount: indices.length ? Math.max(...indices) : 0,
        }
      })
  }

  // -------------------------------------------------------------------------
  // sendText
  // -------------------------------------------------------------------------

  async sendText(to: string, body: string): Promise<SendResult> {
    const url = `${API_BASE}/${this.phoneNumberId}/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body },
      }),
    })

    const data = (await response.json()) as MetaMessageResponse

    if (!response.ok) {
      const errMsg = data.error?.message ?? `HTTP ${response.status}`
      throw new Error(`[Meta WhatsApp] sendText failed: ${errMsg}`)
    }

    const messageId = data.messages?.[0]?.id
    if (!messageId) {
      throw new Error('[Meta WhatsApp] sendText: no message ID in response')
    }

    return { providerMessageId: messageId }
  }

  // -------------------------------------------------------------------------
  // sendTemplate
  // -------------------------------------------------------------------------

  async sendTemplate(
    to: string,
    templateName: string,
    vars: Record<string, string>,
    language = 'en',
  ): Promise<SendResult> {
    const url = `${API_BASE}/${this.phoneNumberId}/messages`

    // Placeholders are positional: vars keys are "1", "2", … and must be sent
    // in numeric order. localeCompare would order "10" before "2" and silently
    // swap the parent's name with their child's, so compare numerically and
    // fall back to string order for any non-numeric key.
    const parameters = Object.entries(vars)
      .sort(([a], [b]) => {
        const na = Number(a)
        const nb = Number(b)
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
        return a.localeCompare(b)
      })
      .map(([, value]) => ({ type: 'text', text: value }))

    const components =
      parameters.length > 0
        ? [{ type: 'body', parameters }]
        : []

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          components,
        },
      }),
    })

    const data = (await response.json()) as MetaMessageResponse

    if (!response.ok) {
      const errMsg = data.error?.message ?? `HTTP ${response.status}`
      throw new Error(`[Meta WhatsApp] sendTemplate failed: ${errMsg}`)
    }

    const messageId = data.messages?.[0]?.id
    if (!messageId) {
      throw new Error('[Meta WhatsApp] sendTemplate: no message ID in response')
    }

    return { providerMessageId: messageId }
  }

  // -------------------------------------------------------------------------
  // verifyWebhookSignature
  // -------------------------------------------------------------------------

  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string>,
  ): boolean {
    // Meta sends: x-hub-signature-256: sha256=<hex>
    const signatureHeader =
      headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'] ?? ''

    const prefix = 'sha256='
    if (!signatureHeader.startsWith(prefix)) {
      return false
    }

    const receivedHex = signatureHeader.slice(prefix.length)

    let receivedBuf: Buffer
    try {
      receivedBuf = Buffer.from(receivedHex, 'hex')
    } catch {
      return false
    }

    const expectedBuf = createHmac('sha256', this.appSecret)
      .update(rawBody, 'utf8')
      .digest()

    if (receivedBuf.length !== expectedBuf.length) {
      return false
    }

    return timingSafeEqual(receivedBuf, expectedBuf)
  }

  // -------------------------------------------------------------------------
  // parseWebhook
  // -------------------------------------------------------------------------

  parseWebhook(payload: unknown): ParsedInboundMessage | null {
    if (typeof payload !== 'object' || payload === null) return null

    const root = payload as MetaWebhookPayload

    const message =
      root.entry?.[0]?.changes?.[0]?.value?.messages?.[0]

    if (!message) return null

    // Only handle inbound messages (not status updates)
    if (!message.id || !message.from || !message.timestamp) return null

    const type = this.normaliseMessageType(message.type)
    const body = message.text?.body ?? ''

    const timestampSeconds = parseInt(message.timestamp, 10)
    const timestamp = isNaN(timestampSeconds)
      ? new Date()
      : new Date(timestampSeconds * 1000)

    return {
      from: `+${message.from.replace(/^\+/, '')}`,
      body,
      providerMessageId: message.id,
      timestamp,
      type,
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private normaliseMessageType(
    raw: string,
  ): 'text' | 'image' | 'audio' | 'document' {
    switch (raw) {
      case 'text':
        return 'text'
      case 'image':
        return 'image'
      case 'audio':
      case 'voice':
        return 'audio'
      default:
        return 'document'
    }
  }
}
