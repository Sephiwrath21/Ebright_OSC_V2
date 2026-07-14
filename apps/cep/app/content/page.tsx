'use client';

import { useEffect, useState } from 'react';
import { PLAN_TYPES, PLAN_TYPE_LABELS } from '@/lib/planTypes';
import { parsePlanTypes } from '@/lib/content';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { ViewToggle, useViewPreference } from '@/components/shared/ViewToggle';

interface Content {
  id: string;
  title: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  body: string;
  link: string | null;
  imageUrl: string | null;
  triggerType: string | null;
  planTypes: string | null;
  department: string | null;
  weekNumber: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Company is email-only for now (Ebright CEP batch, Part 5). SMS/WhatsApp stay
// in the schema/Content type and existing SMS/WHATSAPP rows keep displaying
// normally — this only hides them from the filter pills and the create/edit
// channel picker, so re-enabling later is a config change, not a rebuild.
const VISIBLE_CHANNELS = ['EMAIL'] as const;

const DUMMY_PREVIEW_NOTE = 'Pn. Sofia Alina / Amirah Insyirah';

const RULE_CATEGORIES = ['all', 'festive', 'renewal', 'weekly', 'showcase', 'promo'] as const;
type RuleCategoryFilter = (typeof RULE_CATEGORIES)[number];
const RULE_CATEGORY_LABELS: Record<RuleCategoryFilter, string> = {
  all: 'All',
  festive: 'Festive',
  renewal: 'Renewal',
  weekly: 'Weekly',
  showcase: 'Showcase',
  promo: 'Promo',
};

const TRIGGER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Manual blast only (no trigger)' },
  // Rule-engine names (lib/cron.ts + AutomationRule), day-based, plan-aware
  { value: 'welcome', label: 'Rule: Welcome' },
  { value: 'followus', label: 'Rule: Follow us (intake)' },
  { value: 'followus_reminder', label: 'Rule: Follow-us reminder' },
  { value: 'review', label: 'Rule: Parent review' },
  { value: 'referral', label: 'Rule: Referral offer' },
  { value: 'video', label: 'Rule: Weekly video tip' },
  { value: 'birthday', label: 'Rule: Student birthday' },
  { value: 'renewal', label: 'Rule: Renewal (generic fallback)' },
  { value: 'renewal_30d_before_expiry', label: 'Rule: Renewal — 30 days out' },
  { value: 'renewal_14d_before_expiry', label: 'Rule: Renewal — 14 days out' },
  { value: 'renewal_3d_before_expiry', label: 'Rule: Renewal — 3 days out' },
  { value: 'festive', label: 'Rule: Festive (generic fallback, all festivals)' },
  { value: 'promo', label: 'Rule: Promo (manual send from /promo)' },
  // Legacy intake triggers (fireTriggeredSend, Day-0 signup flow)
  { value: 'DAY0_WELCOME', label: 'Intake: Day 0 — Welcome' },
  { value: 'DAY0_FOLLOWUP', label: 'Intake: Day 0 — Follow us' },
  { value: 'DAY14_REMINDER', label: 'Intake: Day 14 — Follow-us reminder' },
  { value: 'WEEKLY_VIDEO', label: 'Intake: Every Monday — Video tip' },
  { value: 'DAY42_REVIEW', label: 'Intake: Day 42 — Parent review' },
  { value: 'DAY56_REFERRAL', label: 'Intake: Day 56 — Referral offer' },
  { value: 'BIRTHDAY', label: 'Intake: Birthday — Student birthday' },
];

const CHANNEL_COLORS: Record<string, string> = {
  EMAIL: '#991b1b',
  SMS: '#dc2626',
  WHATSAPP: '#22c55e',
};

const CHANNEL_ICONS: Record<string, string> = {
  EMAIL: '✉️',
  SMS: '💬',
  WHATSAPP: '📱',
};

interface FormState {
  id: string | null;
  title: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  body: string;
  link: string;
  imageUrl: string;
  triggerType: string;
  planTypes: string[];
  department: string;
  weekNumber: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  title: '',
  channel: 'EMAIL',
  body: '',
  link: '',
  imageUrl: '',
  triggerType: '',
  planTypes: ['all'],
  department: '',
  weekNumber: '',
  isActive: true,
};

const DEPARTMENT_COLORS: Record<Department, string> = {
  CEO: '#7c3aed',
  ACD: '#2563eb',
  MKT: '#dc2626',
  MKT_REFERRAL: '#db2777',
  HR: '#ca8a04',
  FNC: '#16a34a',
  OD: '#0891b2',
  OPS: '#ea580c',
  AD_HOC: '#6b7280',
};

export default function ContentCmsPage() {
  const [items, setItems] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState<RuleCategoryFilter>('all');
  const [view, setView] = useViewPreference('ebright_content_view');
  const [festiveTriggerOptions, setFestiveTriggerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [showcaseTriggerOptions, setShowcaseTriggerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cms', { cache: 'no-store' });
      setItems(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const loadFestiveTriggerOptions = async () => {
    const res = await fetch('/api/festive', { cache: 'no-store' });
    if (!res.ok) return;
    const events: Array<{ name: string; slug: string; sendOnDay: boolean; sendPreDays: number | null }> = await res.json();
    const options: Array<{ value: string; label: string }> = [];
    for (const evt of events) {
      if (evt.sendOnDay) options.push({ value: `festive_${evt.slug}`, label: `Rule: Festive — ${evt.name}` });
      if (evt.sendPreDays != null) {
        options.push({ value: `festive_${evt.slug}_pre`, label: `Rule: Festive — ${evt.name} (pre-festival, H-${evt.sendPreDays})` });
      }
    }
    setFestiveTriggerOptions(options);
  };

  const loadShowcaseTriggerOptions = async () => {
    const res = await fetch('/api/showcase', { cache: 'no-store' });
    if (!res.ok) return;
    const events: Array<{ name: string; slug: string }> = await res.json();
    setShowcaseTriggerOptions(events.map((evt) => ({ value: `showcase_${evt.slug}`, label: `Rule: Showcase — ${evt.name}` })));
  };

  useEffect(() => {
    load();
    loadFestiveTriggerOptions();
    loadShowcaseTriggerOptions();
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setShowPreview(false);
    setShowForm(true);
  };

  const openEdit = (c: Content) => {
    setForm({
      id: c.id,
      title: c.title,
      channel: c.channel,
      body: c.body,
      link: c.link ?? '',
      imageUrl: c.imageUrl ?? '',
      triggerType: c.triggerType ?? '',
      planTypes: parsePlanTypes(c.planTypes),
      department: c.department ?? '',
      weekNumber: c.weekNumber != null ? String(c.weekNumber) : '',
      isActive: c.isActive,
    });
    setError(null);
    setShowPreview(false);
    setShowForm(true);
  };

  const openPreview = async () => {
    setShowPreview(true);
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/cms/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: form.title, body: form.body, link: form.link, imageUrl: form.imageUrl }),
      });
      const j = await res.json();
      setPreviewHtml(j.html ?? '');
    } finally {
      setPreviewLoading(false);
    }
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        channel: form.channel,
        body: form.body,
        link: form.link.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        triggerType: form.triggerType || null,
        planTypes: form.planTypes,
        department: form.department || null,
        weekNumber: form.weekNumber.trim() ? Number(form.weekNumber) : null,
        isActive: form.isActive,
      };
      const res = await fetch(form.id ? `/api/cms/${form.id}` : '/api/cms', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this content? Any auto-blast job using it will be paused.')) return;
    await fetch(`/api/cms/${id}`, { method: 'DELETE' });
    await load();
  };

  const toggleActive = async (c: Content) => {
    await fetch(`/api/cms/${c.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    await load();
  };

  const filtered =
    filterCategory === 'all' ? items : items.filter((i) => ruleCategoryOf(i.triggerType) === filterCategory);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Content library (CMS)</h1>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 0' }}>
            Editable templates. When a trigger fires, the automation uses the matching Content record
            (if active); otherwise it falls back to the static defaults.
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '9px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add content
        </button>
      </div>

      {/* Rule/content-category filter — the only filter row on this page now that
          the channel row (Email being the sole visible channel) was removed. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {RULE_CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              label={RULE_CATEGORY_LABELS[cat]}
              active={filterCategory === cat}
              onClick={() => setFilterCategory(cat)}
            />
          ))}
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '10px' }}>
          No content yet. Click <strong>+ Add content</strong> to create your first template.
        </div>
      ) : view === 'list' ? (
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
          {filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => openEdit(c)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openEdit(c);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                borderTop: '1px solid #f3f4f6',
                cursor: 'pointer',
                opacity: c.isActive ? 1 : 0.6,
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', flexShrink: 0 }}>{c.title}</span>
              {triggerCategory(c.triggerType) && (
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '999px',
                    background: triggerCategory(c.triggerType)!.color + '18',
                    color: triggerCategory(c.triggerType)!.color,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    flexShrink: 0,
                  }}
                >
                  {triggerCategory(c.triggerType)!.label}
                </span>
              )}
              <DepartmentBadge department={c.department} />
              {c.weekNumber != null && <WeekBadge weekNumber={c.weekNumber} />}
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                  background: c.isActive ? '#dcfce7' : '#f3f4f6',
                  color: c.isActive ? '#16a34a' : '#6b7280',
                }}
              >
                {c.isActive ? 'Active' : 'Inactive'}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: '#9ca3af',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {c.triggerType ? triggerLabel(c.triggerType) : 'Manual blast only'}
              </span>
              <ChannelBadge channel={c.channel} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
          {filtered.map((c) => (
            <div
              key={c.id}
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '16px',
                opacity: c.isActive ? 1 : 0.6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{c.title}</div>
                    {triggerCategory(c.triggerType) && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '999px',
                          background: triggerCategory(c.triggerType)!.color + '18',
                          color: triggerCategory(c.triggerType)!.color,
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          flexShrink: 0,
                        }}
                      >
                        {triggerCategory(c.triggerType)!.label}
                      </span>
                    )}
                    <DepartmentBadge department={c.department} />
                    {c.weekNumber != null && <WeekBadge weekNumber={c.weekNumber} />}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                    {c.triggerType ? triggerLabel(c.triggerType) : 'Manual blast only'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                    {parsePlanTypes(c.planTypes).includes('all')
                      ? 'All plans'
                      : parsePlanTypes(c.planTypes).map((p) => PLAN_TYPE_LABELS[p] ?? p).join(', ')}
                  </div>
                </div>
                <ChannelBadge channel={c.channel} />
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: '#374151',
                  background: '#f9fafb',
                  padding: '10px',
                  borderRadius: '6px',
                  whiteSpace: 'pre-wrap',
                  minHeight: '60px',
                  maxHeight: '120px',
                  overflow: 'auto',
                }}
              >
                {c.body}
              </div>

              {c.link && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '6px 10px',
                    background: '#eff6ff',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#1d4ed8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={c.link}
                >
                  🔗 {c.link}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
                <span
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleActive(c);
                    }
                  }}
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: c.isActive ? '#dcfce7' : '#f3f4f6',
                    color: c.isActive ? '#16a34a' : '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleActive(c)}
                >
                  {c.isActive ? 'Active' : 'Inactive'}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => openEdit(c)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      color: '#374151',
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #fee2e2',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
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

      {showForm && (
        <Modal onClose={() => setShowForm(false)} maxWidth={showPreview ? '620px' : '900px'}>
          {showPreview ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>Email preview</div>
                <button
                  onClick={() => setShowPreview(false)}
                  style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}
                >
                  ← Back to editing
                </button>
              </div>
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: 0, marginBottom: '12px' }}>
                Rendered with sample data ({DUMMY_PREVIEW_NOTE}) through the same template used for real sends.
              </p>
              {previewLoading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>Rendering…</div>
              ) : (
                <iframe
                  title="Email preview"
                  srcDoc={previewHtml}
                  style={{ width: '100%', height: '560px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#f9fafb' }}
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button
                  onClick={() => setShowPreview(false)}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Back to editing
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px' }}>
                {form.id ? 'Edit content' : 'Add content'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
                {/* Left column — editor */}
                <div style={{ minWidth: 0 }}>
                  <Field label="Title / email subject">
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Welcome to Ebright Academy 🎉"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Attach to trigger">
                    <select
                      value={form.triggerType}
                      onChange={(e) => setForm({ ...form, triggerType: e.target.value })}
                      className="ebright-select"
                    >
                      {TRIGGER_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                      {festiveTriggerOptions.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                      {showcaseTriggerOptions.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Body — merge fields: {{parent_name}}, {parent_first_name}, {{student_name}}, {{plan_type}}, {{expiry_date}}. Weekly-import tokens ({videoLink}, {facebookLink}, {instagramLink}, {tiktokLink}, {threadsLink}) are NOT auto-filled — they need a manual value entered here per week before sending.">
                    <textarea
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      rows={9}
                      placeholder="Hi {parentName}, welcome to Ebright! {studentName} is going to love it."
                      style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </Field>

                  <Field label="Link (optional — becomes a CTA button in email, appended to SMS/WhatsApp)">
                    <input
                      value={form.link}
                      onChange={(e) => setForm({ ...form, link: e.target.value })}
                      placeholder="https://ebrightacademy.com/..."
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Poster / image URL (optional — shown above the body in the email)">
                    <input
                      value={form.imageUrl}
                      onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                      placeholder="https://.../poster.jpg"
                      style={inputStyle}
                    />
                  </Field>
                </div>

                {/* Right column — metadata */}
                <div style={{ minWidth: 0 }}>
                  <Field label="Channel">
                    {VISIBLE_CHANNELS.includes(form.channel as 'EMAIL') ? (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          fontSize: '12px',
                          color: '#374151',
                        }}
                      >
                        ✉️ Email only
                      </div>
                    ) : (
                      // Legacy SMS/WhatsApp content keeps its real channel visible when
                      // edited, even though it's no longer a creatable option going forward.
                      <select
                        value={form.channel}
                        onChange={(e) => setForm({ ...form, channel: e.target.value as FormState['channel'] })}
                        className="ebright-select"
                      >
                        <option value={form.channel}>
                          {CHANNEL_ICONS[form.channel]} {form.channel} (legacy)
                        </option>
                        {VISIBLE_CHANNELS.map((c) => (
                          <option key={c} value={c}>
                            {CHANNEL_ICONS[c]} {c}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>

                  <Field label="Department (owner, for accountability — not used for send-time filtering)">
                    <select
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      className="ebright-select"
                    >
                      <option value="">No department</option>
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {DEPARTMENT_LABELS[d]}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Week number (1-48 — for the Weekly conveyer-belt 'video' trigger only)">
                    <input
                      type="number"
                      min={1}
                      max={48}
                      value={form.weekNumber}
                      onChange={(e) => setForm({ ...form, weekNumber: e.target.value })}
                      placeholder="e.g. 3"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Applicable plan types">
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#374151' }}>
                        <input
                          type="checkbox"
                          checked={form.planTypes.includes('all')}
                          onChange={(e) => setForm({ ...form, planTypes: e.target.checked ? ['all'] : [] })}
                        />
                        All plans
                      </label>
                      {PLAN_TYPES.map((p) => (
                        <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#374151' }}>
                          <input
                            type="checkbox"
                            disabled={form.planTypes.includes('all')}
                            checked={form.planTypes.includes(p)}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                planTypes: e.target.checked
                                  ? [...form.planTypes.filter((x) => x !== 'all'), p]
                                  : form.planTypes.filter((x) => x !== p),
                              })
                            }
                          />
                          {PLAN_TYPE_LABELS[p]}
                        </label>
                      ))}
                    </div>
                  </Field>

                  <div style={{ marginTop: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      id="isActive"
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    />
                    <label htmlFor="isActive" style={{ fontSize: '13px', color: '#374151' }}>
                      Active (will be used by automation when trigger fires)
                    </label>
                  </div>

                  <button
                    onClick={openPreview}
                    disabled={!form.body.trim()}
                    style={{
                      width: '100%',
                      background: '#111827',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: form.body.trim() ? 'pointer' : 'not-allowed',
                      opacity: form.body.trim() ? 1 : 0.5,
                    }}
                  >
                    👁️ Preview email
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ marginTop: '12px', padding: '10px', background: '#fee2e2', color: '#dc2626', borderRadius: '6px', fontSize: '12px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button onClick={() => setShowForm(false)} style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function triggerLabel(t: string): string {
  const known = TRIGGER_OPTIONS.find((o) => o.value === t)?.label;
  if (known) return known;
  // Dynamic festive/showcase triggers aren't in the static list since they come from
  // admin-editable/Cal.com-synced rows — humanize as a fallback.
  if (t.startsWith('festive_')) {
    const isPre = t.endsWith('_pre');
    const label = t.replace(/^festive_/, '').replace(/_pre$/, '').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    return `Rule: Festive — ${label}${isPre ? ' (pre-festival)' : ''}`;
  }
  if (t.startsWith('showcase_')) {
    const label = t.replace(/^showcase_/, '').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    return `Rule: Showcase — ${label}`;
  }
  return t;
}

/** Festival, Showcase, and Promo templates each have different fallback/scheduling
 * behavior (see docs/architecture.md), so the content list badges which is which
 * rather than leaving it to the trigger text. */
function triggerCategory(t: string | null): { label: string; color: string } | null {
  if (!t) return null;
  if (t === 'festive' || t.startsWith('festive_')) return { label: 'Festive', color: '#991b1b' };
  if (t.startsWith('showcase_')) return { label: 'Showcase', color: '#dc2626' };
  if (t === 'promo') return { label: 'Promo', color: '#7c3aed' };
  return null;
}

/**
 * Rule-category filter pills (Ebright CEP batch — "Add: Rule-Type Filter
 * Pills") — the same triggerType prefix rules as triggerCategory() above,
 * extended to also distinguish Renewal from the per-parent Weekly
 * conveyer-belt rules, since those two aren't visually badged but still need
 * to be filterable. No new/separate categorization field: every template's
 * bucket is derived from its existing triggerType, exactly what's already
 * shown as the gray "Rule: ..." line under its title.
 */
function ruleCategoryOf(t: string | null): Exclude<RuleCategoryFilter, 'all'> | null {
  if (!t) return null;
  if (t === 'festive' || t.startsWith('festive_')) return 'festive';
  if (t.startsWith('showcase_')) return 'showcase';
  if (t === 'promo') return 'promo';
  if (t === 'renewal' || t.startsWith('renewal_')) return 'renewal';
  // Everything else with a triggerType is a per-parent lifecycle rule — welcome,
  // followus(_reminder), review, referral, video, birthday, and their legacy
  // DAY0_WELCOME/DAY14_REMINDER/WEEKLY_VIDEO/DAY42_REVIEW/DAY56_REFERRAL/BIRTHDAY
  // intake equivalents.
  return 'weekly';
}

/** Which department owns this template — accountability/tracking badge, not a
 * filter dimension (the Rules-page filter pills stay derived from triggerType). */
function DepartmentBadge({ department }: { department: string | null }) {
  if (!department) return null;
  const color = DEPARTMENT_COLORS[department as Department] ?? '#6b7280';
  const label = DEPARTMENT_LABELS[department as Department] ?? department;
  return (
    <span
      style={{
        fontSize: '9px',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '999px',
        background: color + '18',
        color,
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function WeekBadge({ weekNumber }: { weekNumber: number }) {
  return (
    <span
      style={{
        fontSize: '9px',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '999px',
        background: '#f3f4f6',
        color: '#374151',
        flexShrink: 0,
      }}
    >
      Week {weekNumber}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const color = CHANNEL_COLORS[channel] ?? '#9ca3af';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 600,
        background: color + '18',
        color,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        flexShrink: 0,
      }}
    >
      {CHANNEL_ICONS[channel]} {channel}
    </span>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: '999px',
        border: active ? 'none' : '1px solid #e5e7eb',
        background: active ? '#dc2626' : '#ffffff',
        color: active ? '#ffffff' : '#374151',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function Modal({ children, onClose, maxWidth = '560px' }: { children: React.ReactNode; onClose: () => void; maxWidth?: string }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(17,24,39,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {children}
      </div>
    </div>
  );
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
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
