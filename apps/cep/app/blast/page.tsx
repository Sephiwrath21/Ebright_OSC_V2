'use client';

import { useEffect, useState } from 'react';
import { AudienceFilterPanel, type AudiencePreview } from '@/components/shared/AudienceFilterPanel';
import { numberedBranchLabel } from '@/lib/branches';

type Preview = AudiencePreview;

interface Content {
  id: string;
  title: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  body: string;
  link: string | null;
  isActive: boolean;
}

interface AutoBlastJob {
  id: string;
  name: string;
  contentId: string;
  content: { id: string; title: string; channel: string } | null;
  segmentBranch: string | null;
  segmentStatus: string | null;
  intervalMinutes: number;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
}

interface AutoLog {
  id: string;
  message: string;
  contentType: string;
  status: string;
  sentAt: string;
  parent: { id: string; name: string; studentName: string; branch: string } | null;
}

function renderMergePreview(body: string): string {
  return body
    .replace(/\{\{parent_name\}\}/g, '(Parent name)')
    .replace(/\{\{student_name\}\}/g, '(Student name)')
    .replace(/\{\{plan_type\}\}/g, '(Plan)')
    .replace(/\{\{expiry_date\}\}/g, '(Expiry date)')
    .replace(/\{parentName\}/g, '(Parent name)')
    .replace(/\[parentName\]/g, '(Parent name)')
    .replace(/\{studentName\}/g, '(Student name)')
    .replace(/\[studentName\]/g, '(Student name)');
}

export default function BlastPage() {
  // -- one-off blast state --
  const [templates, setTemplates] = useState<Content[]>([]);
  const [contentId, setContentId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ count: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/cms?channel=EMAIL', { cache: 'no-store' });
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
      const res = await fetch('/api/blast/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          parentIds: preview.parents.map((p) => p.id),
          contentId,
        }),
      });
      const data = await res.json();
      setSent({ count: data.count });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Manual blast</h1>
      <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 24px' }}>
        Send a one-off SMS/WhatsApp/email to a segment outside the automation schedule.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Segment</div>

          <AudienceFilterPanel onPreviewChange={setPreview} />

          <Field label="Template (from Content library)">
            {templates.length === 0 ? (
              <div style={{ padding: '10px', background: '#fef3c7', color: '#a16207', borderRadius: '6px', fontSize: '12px' }}>
                No active EMAIL content yet. <a href="/content" style={{ color: '#a16207', fontWeight: 600 }}>Create one on /content</a> first.
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
          </Field>

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
            {sending ? 'Sending…' : `Send to ${preview?.count ?? 0} parent${preview?.count === 1 ? '' : 's'}`}
          </button>

          {sent && (
            <div style={{ marginTop: '10px', padding: '10px', background: '#dcfce7', color: '#16a34a', borderRadius: '6px', fontSize: '12px', fontWeight: 500 }}>
              ✅ Blast sent to {sent.count} parents. Check the bell.
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

      <AutoBlastSection />
    </div>
  );
}

// ============================================================================
// Auto-blast section — recurring blasts every N minutes
// ============================================================================

function AutoBlastSection() {
  const [contents, setContents] = useState<Content[]>([]);
  const [jobs, setJobs] = useState<AutoBlastJob[]>([]);
  const [logs, setLogs] = useState<AutoLog[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('July Instagram push');
  const [contentId, setContentId] = useState('');
  const [segBranch, setSegBranch] = useState('all');
  const [segStatus, setSegStatus] = useState('active');
  const [interval, setInterval_] = useState(5);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const loadAll = async () => {
    const [allContents, jRes, lRes, bRes] = await Promise.all([
      fetch('/api/cms', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/autoblast', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/autoblast/logs', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/branches?activeOnly=1', { cache: 'no-store' }).then((r) => r.json()),
    ]);
    setContents(allContents.filter((c: Content) => c.isActive));
    setJobs(jRes);
    setLogs(lRes);
    setBranches(bRes);
  };

  useEffect(() => {
    loadAll();
    // Matches the bell's 10s polling pattern.
    const t = window.setInterval(loadAll, 10_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!contentId && contents.length > 0) setContentId(contents[0].id);
  }, [contents, contentId]);

  const createJob = async () => {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/autoblast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          contentId,
          segmentBranch: segBranch,
          segmentStatus: segStatus,
          intervalMinutes: interval,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await loadAll();
      setName(`Auto blast ${new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (job: AutoBlastJob) => {
    await fetch(`/api/autoblast/${job.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: !job.isActive }),
    });
    await loadAll();
  };

  const remove = async (job: AutoBlastJob) => {
    if (!confirm(`Delete auto-blast job "${job.name}"?`)) return;
    await fetch(`/api/autoblast/${job.id}`, { method: 'DELETE' });
    await loadAll();
  };

  const runNow = async () => {
    setRunning(true);
    try {
      await fetch('/api/autoblast/run', { method: 'POST' });
      await loadAll();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Scheduled auto-blast</h2>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0 0' }}>
            Fire a Content template to a segment on a repeating interval.
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          style={{
            background: '#f9fafb',
            color: '#374151',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '7px 14px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: running ? 'not-allowed' : 'pointer',
          }}
        >
          {running ? 'Running…' : '▶ Run auto-blast checker now'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Create form */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>New auto-blast job</div>

          <Field label="Job name">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Content template">
            {contents.length === 0 ? (
              <div style={{ padding: '10px', background: '#fef3c7', color: '#a16207', borderRadius: '6px', fontSize: '12px' }}>
                No active content yet. <a href="/content" style={{ color: '#a16207', fontWeight: 600 }}>Create one on /content</a> first.
              </div>
            ) : (
              <select value={contentId} onChange={(e) => setContentId(e.target.value)} className="ebright-select">
                {contents.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.channel}] {c.title}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Field label="Branch">
              <select value={segBranch} onChange={(e) => setSegBranch(e.target.value)} className="ebright-select">
                <option value="all">All branches</option>
                {branches.map((b, i) => (
                  <option key={b.id} value={b.name}>{numberedBranchLabel(i, b.name)}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={segStatus} onChange={(e) => setSegStatus(e.target.value)} className="ebright-select">
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>

          <Field label="Repeat every">
            <select value={interval} onChange={(e) => setInterval_(Number(e.target.value))} className="ebright-select">
              <option value={1}>1 minute (demo speed)</option>
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes (hourly)</option>
              <option value={1440}>1440 minutes (daily)</option>
            </select>
          </Field>

          {error && (
            <div style={{ margin: '10px 0', padding: '8px 10px', background: '#fee2e2', color: '#dc2626', borderRadius: '6px', fontSize: '12px' }}>
              {error}
            </div>
          )}

          <button
            onClick={createJob}
            disabled={creating || contents.length === 0}
            style={{
              width: '100%',
              padding: '10px',
              background: contents.length === 0 ? '#9ca3af' : '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: creating || contents.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {creating ? 'Creating…' : 'Start auto-blast'}
          </button>

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#9ca3af' }}>
            First run happens {interval} minute{interval === 1 ? '' : 's'} after creation. In-process scheduler
            checks every 60s. Click <em>Run auto-blast checker now</em> to force a check immediately.
          </div>
        </div>

        {/* Active jobs */}
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>
            Active jobs ({jobs.filter((j) => j.isActive).length}/{jobs.length})
          </div>
          {jobs.length === 0 ? (
            <div style={{ padding: '24px 0', color: '#9ca3af', fontSize: '13px', textAlign: 'center' }}>
              No auto-blast jobs yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {jobs.map((j) => (
                <div key={j.id} style={{ padding: '12px', border: '1px solid #f3f4f6', borderRadius: '8px', background: j.isActive ? '#f9fafb' : '#ffffff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{j.name}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                        [{j.content?.channel ?? '?'}] {j.content?.title ?? '(deleted content)'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                        every {j.intervalMinutes}m · {j.segmentBranch === 'all' ? 'all branches' : j.segmentBranch} · {j.segmentStatus === 'all' ? 'all status' : j.segmentStatus}
                      </div>
                      <div style={{ fontSize: '11px', color: j.isActive ? '#16a34a' : '#9ca3af', marginTop: '4px' }}>
                        {j.isActive ? `Next: ${formatRelative(j.nextRunAt)}` : 'Paused'}
                        {j.lastRunAt && ` · last: ${formatRelative(j.lastRunAt)}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => toggle(j)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb',
                          background: j.isActive ? '#fef3c7' : '#dcfce7',
                          color: j.isActive ? '#a16207' : '#16a34a',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        {j.isActive ? 'Stop' : 'Start'}
                      </button>
                      <button
                        onClick={() => remove(j)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          borderRadius: '6px',
                          border: '1px solid #fee2e2',
                          background: 'transparent',
                          color: '#dc2626',
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Log */}
      <div style={{ marginTop: '20px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Recent auto-blast sends</div>
        {logs.length === 0 ? (
          <div style={{ padding: '20px 0', color: '#9ca3af', fontSize: '13px', textAlign: 'center' }}>No auto-blast sends yet.</div>
        ) : (
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {logs.map((l) => (
              <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: l.status === 'sent' ? '#dcfce7' : '#fee2e2',
                    color: l.status === 'sent' ? '#16a34a' : '#dc2626',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    flexShrink: 0,
                  }}
                >
                  {l.status}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{l.parent?.name ?? '—'} · {l.parent?.studentName}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    {l.parent?.branch} · {new Date(l.sentAt).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  if (Math.abs(diff) < 60_000) return diff < 0 ? 'just now' : 'in <1m';
  const mins = Math.round(diff / 60_000);
  if (mins < 0) return `${Math.abs(mins)}m ago`;
  if (mins < 60) return `in ${mins}m`;
  return d.toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid #e5e7eb',
  fontSize: '13px',
  background: '#ffffff',
  color: '#111827',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
