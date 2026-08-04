import { NextRequest, NextResponse } from 'next/server';
import { renderPlaceholders } from '@/lib/send';
import { wrapEmailShell } from '@/lib/email-shell';

export const dynamic = 'force-dynamic';

// Same dummy data shown for every preview — filling merge fields with something
// obviously fake avoids implying a preview reflects any real parent.
const DUMMY_DATA = {
  parentName: 'Pn. Sofia Alina',
  studentName: 'Amirah Insyirah',
  planType: '6mo',
  expiryDate: null,
};

/**
 * Renders a Content draft through the exact same wrapEmailShell used for real
 * sends (lib/email.ts's sendEmail) — never a hand-built mock — so the preview
 * can't diverge from what actually goes out. No DB write, no real send;
 * sendLogId is a placeholder since the tracking pixel/click link are never
 * loaded from a preview iframe.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = typeof body.title === 'string' ? body.title : '';
  const bodyText = typeof body.body === 'string' ? body.body : '';
  const link = body.link ? String(body.link) : null;
  const imageUrl = body.imageUrl ? String(body.imageUrl) : null;

  const text = renderPlaceholders(bodyText, DUMMY_DATA);
  const html = wrapEmailShell({
    subject: title || '(no subject)',
    bodyText: link ? `${text}\n\n${link}` : text,
    sendLogId: 'preview',
    ctaLink: link,
    imageUrl,
  });

  return NextResponse.json({ html });
}
