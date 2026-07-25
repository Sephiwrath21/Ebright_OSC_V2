'use client';

import Link from 'next/link';
import { useState } from 'react';

export interface NotificationDetail {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  parentId: string | null;
  parent?: { id: string; name: string; studentName: string } | null;
  metadata: string | null;
}

interface ParentDetail {
  id: string;
  name: string;
  studentName: string;
}

interface CronCompletedMeta {
  counts: Record<string, number>;
  details: Record<string, ParentDetail[]>;
}

interface FestiveMeta {
  festivalName?: string;
  festivalSlug?: string;
  calendarEventId?: string | null;
  calendarEventDate?: string;
  usedFallback?: boolean;
  contentType?: string;
  sendLogId?: string;
}

interface ShowcaseMeta {
  showcaseName?: string;
  showcaseSlug?: string;
  calendarEventId?: string | null;
  date?: string;
  daysUntil?: number;
  contentType?: string;
}

function parseMetadata<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function humanise(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export function NotificationModal({ notification, onClose }: { notification: NotificationDetail; onClose: () => void }) {
  const cronMeta = notification.type === 'cron_completed' ? parseMetadata<CronCompletedMeta>(notification.metadata) : null;
  const festiveMeta = parseMetadata<FestiveMeta>(notification.metadata);
  const isFestiveRelated = Boolean(festiveMeta?.festivalName);
  const showcaseMeta = parseMetadata<ShowcaseMeta>(notification.metadata);
  const isShowcaseRelated = Boolean(showcaseMeta?.showcaseName);
  const showcaseNoTemplate = notification.type === 'showcase_missing_template' || notification.type === 'showcase_missing_template_urgent';

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
          maxWidth: '520px',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827', paddingRight: '12px' }}>{notification.title}</div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '18px', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>
          {new Date(notification.createdAt).toLocaleString('en-MY', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </div>

        {/* Cron-completion breakdown — one expandable row per category with a non-zero count */}
        {cronMeta ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {Object.entries(cronMeta.counts)
              .filter(([, count]) => count > 0)
              .map(([category, count]) => (
                <CategoryRow key={category} category={category} count={count} parents={cronMeta.details[category] ?? []} />
              ))}
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap', marginBottom: '16px' }}>{notification.message}</div>
        )}

        {/* Festival-specific detail */}
        {isFestiveRelated && (
          <div
            style={{
              background: festiveMeta?.usedFallback ? '#fffbeb' : '#f9fafb',
              border: `1px solid ${festiveMeta?.usedFallback ? '#fde68a' : '#e5e7eb'}`,
              borderRadius: '8px',
              padding: '12px 14px',
              marginBottom: '16px',
              fontSize: '12px',
            }}
          >
            <div style={{ fontWeight: 600, color: '#111827', marginBottom: '6px' }}>Festival detail</div>
            <div style={{ color: '#374151', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div>
                <strong>Calendar event:</strong> {festiveMeta!.festivalName}
                {festiveMeta!.calendarEventDate && ` — ${new Date(festiveMeta!.calendarEventDate!).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`}
              </div>
              <div>
                <strong>Template used:</strong>{' '}
                {festiveMeta?.usedFallback ? 'Generic fallback (no match in Content library)' : 'Matched Content library template'}
              </div>
              {festiveMeta?.calendarEventId && (
                <div style={{ color: '#9ca3af' }}>
                  <strong>Source:</strong> Cal.com booking {festiveMeta.calendarEventId}
                </div>
              )}
            </div>
            {festiveMeta?.usedFallback && (
              <div style={{ marginTop: '8px', color: '#92400e', fontWeight: 500 }}>
                ⚠️ No custom template found for &quot;{festiveMeta.festivalName}&quot; — add one in Content library.
              </div>
            )}
          </div>
        )}

        {/* Showcase-specific detail */}
        {isShowcaseRelated && (
          <div
            style={{
              background: showcaseNoTemplate ? '#fef2f2' : '#f9fafb',
              border: `1px solid ${showcaseNoTemplate ? '#fecaca' : '#e5e7eb'}`,
              borderRadius: '8px',
              padding: '12px 14px',
              marginBottom: '16px',
              fontSize: '12px',
            }}
          >
            <div style={{ fontWeight: 600, color: '#111827', marginBottom: '6px' }}>Showcase detail</div>
            <div style={{ color: '#374151', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div>
                <strong>Calendar event:</strong> {showcaseMeta!.showcaseName}
                {showcaseMeta!.date && ` — ${new Date(showcaseMeta!.date!).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                {typeof showcaseMeta?.daysUntil === 'number' && ` (${showcaseMeta.daysUntil}d away)`}
              </div>
              {showcaseMeta?.calendarEventId && (
                <div style={{ color: '#9ca3af' }}>
                  <strong>Source:</strong> Cal.com booking {showcaseMeta.calendarEventId}
                </div>
              )}
            </div>
            {showcaseNoTemplate && (
              <div style={{ marginTop: '8px', color: '#991b1b', fontWeight: 500 }}>
                {notification.type === 'showcase_missing_template_urgent' ? '🚨' : '⚠️'} No template yet for &quot;{showcaseMeta?.showcaseName}&quot;
                — it will NOT send automatically until one is added in Content library. There is no generic
                fallback for showcase events.
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {notification.parentId && (
            <Link
              href={`/parents/${notification.parentId}`}
              onClick={onClose}
              style={{ fontSize: '12px', color: '#dc2626', textDecoration: 'none', padding: '6px 12px', border: '1px solid #fee2e2', borderRadius: '6px' }}
            >
              View parent record →
            </Link>
          )}
          <Link
            href="/automation/queue"
            onClick={onClose}
            style={{ fontSize: '12px', color: '#374151', textDecoration: 'none', padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
          >
            View in Queue →
          </Link>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ category, count, parents }: { category: string; count: number; parents: ParentDetail[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ border: '1px solid #f3f4f6', borderRadius: '8px', overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        disabled={parents.length === 0}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          background: '#f9fafb',
          border: 'none',
          cursor: parents.length > 0 ? 'pointer' : 'default',
          fontSize: '13px',
        }}
      >
        <span style={{ color: '#111827', fontWeight: 500 }}>{humanise(category)}</span>
        <span style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {count} sent
          {parents.length > 0 && <span style={{ fontSize: '10px' }}>{expanded ? '▲' : '▼'}</span>}
        </span>
      </button>
      {expanded && parents.length > 0 && (
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {parents.map((p, i) => (
            <Link
              key={`${p.id}-${i}`}
              href={`/parents/${p.id}`}
              style={{ fontSize: '12px', color: '#dc2626', textDecoration: 'none' }}
            >
              {p.name} — {p.studentName}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
