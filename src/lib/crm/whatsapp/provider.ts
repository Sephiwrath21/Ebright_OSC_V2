/**
 * WhatsApp provider abstraction.
 *
 * All provider implementations (Meta Cloud API, Twilio, etc.) must satisfy
 * this interface so the rest of the CRM can stay provider-agnostic.
 */

export interface ParsedInboundMessage {
  /** Sender phone number in E.164 format (e.g. "+60123456789") */
  from: string
  body: string
  providerMessageId: string
  timestamp: Date
  type: 'text' | 'image' | 'audio' | 'document'
}

export interface SendResult {
  providerMessageId: string
}

/** Result of a live credential check against the provider's API. */
export interface VerifyResult {
  ok: boolean
  /** The connected WhatsApp number in display form, when the provider reports it. */
  displayPhoneNumber?: string
  /** The business display name shown to recipients, when available. */
  verifiedName?: string
  /** Human-readable failure reason — safe to surface in the UI. */
  error?: string
}

/**
 * A message template already approved by the provider.
 *
 * Templates are the ONLY way to open a conversation outside WhatsApp's 24-hour
 * customer-service window, so a branch that wants to reach out first can only
 * ever pick from this list.
 */
export interface WhatsAppTemplate {
  name: string
  /** BCP-47 code the template was approved under, e.g. "en" / "ms". */
  language: string
  category: string
  /** The BODY component text, with {{1}}, {{2}} … placeholders left in. */
  bodyText: string
  /** How many {{n}} placeholders the body expects. */
  variableCount: number
}

export interface WhatsAppProvider {
  /**
   * Call the provider's API with the stored credentials to confirm they work.
   * Used by the Integrations page so a branch finds out immediately that its
   * token/number is wrong, instead of on the first message send.
   */
  verifyCredentials(): Promise<VerifyResult>

  /**
   * List the templates this account may send. Implementations return only
   * APPROVED templates — offering a pending or rejected one would just produce
   * a failed send.
   */
  listTemplates(): Promise<WhatsAppTemplate[]>

  /**
   * Send a plain-text message to a recipient.
   * @param to  Recipient phone in E.164 format (no leading "whatsapp:" prefix)
   */
  sendText(to: string, body: string): Promise<SendResult>

  /**
   * Send a pre-approved template message.
   * @param to           Recipient phone in E.164 format
   * @param templateName Approved template name registered with the provider
   * @param vars         Positional substitutions keyed "1", "2", … (sorted numerically)
   * @param language     Template's approved language code; defaults to "en"
   */
  sendTemplate(
    to: string,
    templateName: string,
    vars: Record<string, string>,
    language?: string,
  ): Promise<SendResult>

  /**
   * Verify the webhook request signature to guard against spoofed payloads.
   * @param rawBody Raw UTF-8 request body string (before any JSON parsing)
   * @param headers All request headers (lowercase keys recommended)
   * @returns true if the signature is valid
   */
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string>,
  ): boolean

  /**
   * Parse a raw webhook payload into a normalised inbound message.
   * Returns null if the payload does not represent an inbound user message
   * (e.g. delivery receipts, status updates).
   */
  parseWebhook(payload: unknown): ParsedInboundMessage | null
}
