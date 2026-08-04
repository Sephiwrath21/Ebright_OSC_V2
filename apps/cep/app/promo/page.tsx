'use client';

import { useEffect, useState } from 'react';
import { AudienceFilterPanel, AudienceField, type AudiencePreview } from '@/components/shared/AudienceFilterPanel';

interface Content {
  id: string;
  title: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  body: string;
  link: string | null;
  isActive: boolean;
}

function renderMergePreview(body: string): string {
  return body
    .replace(/\{\{parent_name\}\}/g, '(Parent name)')
    .replace(/\{\{student_name\}\}/g, '(Student name)')
    .replace(/\{parent_first_name\}/g, '(Parent first name)')
    .replace(/\{parentName\}/g, '(Parent name)')
    .replace(/\{studentName\}/g, '(Student name)');
}

/**
 * Promo — manual/on-demand sales & marketing pushes (docs/architecture.md, layer 3).
 * Deliberately separate from /blast even though the send mechanism is identical:
 * Promo templates are their own Content-library category (triggerType: 'promo'),
 * and sends are tagged distinctly (contentType: 'promo') in Queue/Notifications.
 * No schedule, no calendar source — the only trigger is an admin clicking Send.
 */
export default function PromoPage() {
  const [templates, setTemplates] = useState<Content[]>([]);
  const [contentId, setContentId] = useState('');
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ count: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/cms?channel=EMAIL&triggerType=promo', { cache: 'no-store' });
      const all: Content[] = await res.json();
      const active = all.filter((c) => c.isActive);
      setTemplates(active);
      setContentId((current) => current || active[0]?.id || '');
    };
    load();
  }, []);

  const selectedTemplate = templates.find((t) => t.id === contentId) ?? null;

  const send = async () => {
    if (!preview || preview.count === 0 || !contentId) return;
    setSending(true);
    try {
      const res = await fetch('/api/promo/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentIds: preview.parents.map((p) => p.id), contentId }),
      });
      const data = await res.json();
      setSent({ count: data.count });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Promo</h1>
      <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 24px' }}>
        Manual sales/marketing push to a filtered segment — no schedule, no calendar source. For recurring or
        automated sends, use Blast or the automation rules instead.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Segment</div>

          <AudienceFilterPanel onPreviewChange={setPreview} />

          <AudienceField label="Promo template (from Content library)">
            {templates.length === 0 ? (
              <div style={{ padding: '10px', background: '#fef3c7', color: '#a16207', borderRadius: '6px', fontSize: '12px' }}>
                No active Promo content yet.{' '}
                <a href="/content" style={{ color: '#a16207', fontWeight: 600 }}>
                  Create one on /content
                </a>{' '}
                (tag it &quot;Rule: Promo&quot;) first.
              </div>
            ) : (
              <select value={contentId} onChange={(e) => setContentId(e.target.value)} className="ebright-select">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}
          </AudienceField>

          {selectedTemplate && (
            <div
              style={{
                fontSize: '12px',
                color: '#374151',
                background: '#f9fafb',
                padding: '10px',
                borderRadius: '6px',
                whiteSpace: 'pre-wrap',
                marginBottom: '10px',
              }}
            >
              {renderMergePreview(selectedTemplate.body)}
              {selectedTemplate.link && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#1d4ed8' }}>🔗 {selectedTemplate.link}</div>
              )}
            </div>
          )}

          <div style={{ marginTop: '14px', padding: '10px', background: '#f9fafb', borderRadius: '8px', fontSize: '12px' }}>
            {preview ? (
              <>
                <div style={{ marginBottom: '6px' }}>
                  Recipients: <strong>{preview.count}</strong>
                </div>
                <div style={{ color: '#6b7280' }}>
                  SMS ~RM {preview.estimatedCost.sms} · WA ~RM {preview.estimatedCost.wa} · Total ~RM {preview.estimatedCost.total}
                </div>
              </>
            ) : (
              'Loading…'
            )}
          </div>

          <button
            onClick={send}
            disabled={!preview || preview.count === 0 || sending || !contentId}
            style={{
              marginTop: '14px',
              width: '100%',
              padding: '10px',
              background: preview && preview.count > 0 && contentId ? '#dc2626' : '#9ca3af',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: preview && preview.count > 0 && !sending ? 'pointer' : 'not-allowed',
            }}
          >
            {sending ? 'Sending…' : `Send promo to ${preview?.count ?? 0} parent${preview?.count === 1 ? '' : 's'}`}
          </button>

          {sent && (
            <div style={{ marginTop: '10px', padding: '10px', background: '#dcfce7', color: '#16a34a', borderRadius: '6px', fontSize: '12px', fontWeight: 500 }}>
              ✅ Promo sent to {sent.count} parents. Check the bell.
            </div>
          )}
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>
            Recipients preview ({preview?.count ?? 0})
          </div>
          <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
            {preview?.parents.map((p) => (
              <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                  {p.studentName} · {p.branch} · {p.phone}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
