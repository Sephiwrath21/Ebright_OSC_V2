/**
 * Single shared HTML email shell (red header + white body) used for every
 * outgoing email, regardless of trigger type. The per-trigger `Content.body`
 * (or static fallback) is passed in as `bodyText` and rendered as the
 * swappable inner block. Also injects the open-tracking pixel and wraps the
 * optional CTA link through the click-tracking redirect — see
 * app/api/track/open/[sendLogId] and app/api/track/click/[sendLogId].
 */

const BRAND_RED = '#dc2626';
const BRAND_RED_DARK = '#991b1b';

export interface EmailShellOptions {
  subject: string;
  bodyText: string;
  sendLogId: string;
  ctaLink?: string | null;
  ctaLabel?: string;
  /** Append an escalating renewal-nudge line — true for renewal triggers, or any parent nearing plan expiry. */
  showRenewalNudge?: boolean;
  baseUrl?: string;
  /** Optional poster/image (Content.imageUrl), rendered above the body text. */
  imageUrl?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveBaseUrl(explicit?: string): string {
  return explicit || process.env.APP_BASE_URL || 'http://localhost:3000';
}

export function wrapEmailShell(opts: EmailShellOptions): string {
  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const trackedCta = opts.ctaLink
    ? `${baseUrl}/api/track/click/${opts.sendLogId}?url=${encodeURIComponent(opts.ctaLink)}`
    : null;

  const lines = opts.bodyText
    .split('\n')
    .map((l) => `<p style="margin:0 0 8px;line-height:1.6">${escapeHtml(l)}</p>`)
    .join('');

  const ctaButton = trackedCta
    ? `<div style="margin:20px 0 8px;text-align:center">
         <a href="${trackedCta}" style="display:inline-block;background:${BRAND_RED};color:#ffffff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
           ${escapeHtml(opts.ctaLabel || 'Open link')}
         </a>
       </div>`
    : '';

  const renewalNudge = opts.showRenewalNudge
    ? `<div style="margin:16px 0 0;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12px;color:${BRAND_RED_DARK}">
         ⏰ Your plan is nearing its end — renew now to avoid a gap in classes.
       </div>`
    : '';

  const pixel = `<img src="${baseUrl}/api/track/open/${opts.sendLogId}" width="1" height="1" alt="" style="display:none" />`;

  const posterImage = opts.imageUrl
    ? `<img src="${escapeHtml(opts.imageUrl)}" alt="" style="display:block;width:100%;max-width:472px;border-radius:8px;margin:0 0 16px" />`
    : '';

  return `
<!DOCTYPE html>
<html>
  <body style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;background:#ffffff">
    <div style="background:${BRAND_RED};padding:16px 24px;border-radius:10px 10px 0 0">
      <span style="color:#ffffff;font-size:18px;font-weight:700">Ebright Academy</span>
      <span style="color:rgba(255,255,255,0.75);font-size:12px;margin-left:8px">SMS Portal</span>
    </div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 10px 10px">
      <h2 style="font-size:16px;font-weight:600;color:#111827;margin:0 0 16px">${escapeHtml(opts.subject)}</h2>
      ${posterImage}
      <div style="font-size:14px;color:#374151">${lines}</div>
      ${ctaButton}
      ${renewalNudge}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
      <p style="font-size:12px;color:#9ca3af;margin:0">
        Ebright Academy &middot; Optimisation Department<br/>
        This is an automated notification from the Ebright SMS Portal.
      </p>
    </div>
    ${pixel}
  </body>
</html>`;
}
