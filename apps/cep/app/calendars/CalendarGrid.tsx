'use client';

import { useMemo, useState } from 'react';

export interface CalendarEventItem {
  id: string;
  type: string;
  title: string;
  date: string; // ISO
  branch: string | null;
  description: string | null;
}

const TYPES = ['celebration', 'showcase', 'adhoc'] as const;

const TYPE_COLORS: Record<string, string> = {
  celebration: '#991b1b',
  showcase: '#dc2626',
  adhoc: '#f59e0b',
};

const TYPE_ICONS: Record<string, string> = {
  celebration: '🎉',
  showcase: '🎤',
  adhoc: '📌',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const toolbarIconButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  width: '32px',
  height: '32px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '14px',
  cursor: 'pointer',
  color: '#374151',
  flexShrink: 0,
};

const MONTH_SELECT_CSS = `
  .ebright-month-select {
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    font-family: inherit;
    font-size: 12px;
    color: #374151;
    background-color: #f9fafb;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 14px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    height: 32px;
    padding: 0 26px 0 12px;
    box-sizing: border-box;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }
  .ebright-month-select:hover {
    background-color: #f3f4f6;
    border-color: #d1d5db;
  }
  .ebright-month-select:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.15);
  }
  .ebright-month-select:focus-visible {
    outline: none;
  }
`;

export function CalendarGrid({ events }: { events: CalendarEventItem[] }) {
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(TYPES));
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [dayModal, setDayModal] = useState<{ date: Date; events: CalendarEventItem[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toggleType = (t: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const filteredEvents = useMemo(() => events.filter((e) => activeTypes.has(e.type)), [events, activeTypes]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const e of filteredEvents) {
      const d = new Date(e.date);
      const key = dayKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filteredEvents]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startWeekday);
  const cells = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthLabel = cursor.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    setCursor(d);
  };

  const openDay = (date: Date, dayEvents: CalendarEventItem[]) => {
    if (dayEvents.length === 0) return;
    setDayModal({ date, events: dayEvents });
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const handlePrint = () => window.print();

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Link copied');
    } catch {
      showToast('Could not copy link');
    }
  };

  return (
    <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      {/* Native <select> reset — appearance:none strips the browser's default arrow/blue
          focus ring so it can match the rest of the toolbar's rounded, branded controls.
          The open option-list itself is OS/browser-rendered and can't be restyled cross-
          browser — a known native <select> limitation, kept as a native element anyway
          for accessibility/keyboard behavior rather than building a custom menu for one option.
          Uses dangerouslySetInnerHTML rather than <style>{`...`}</style> — React HTML-entity-
          escapes text children (" becomes &quot;), and <style> is a raw-text HTML element the
          browser's CSS parser does NOT decode entities in, which would silently break the
          url("...") chevron background-image. */}
      <style dangerouslySetInnerHTML={{ __html: MONTH_SELECT_CSS }} />

      {/* Red header bar */}
      <div style={{ background: '#dc2626', padding: '16px 24px', textAlign: 'center' }}>
        <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '18px', letterSpacing: '0.3px' }}>Ebright Calendar</div>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          borderBottom: '1px solid #e5e7eb',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={goToday}
            style={{ background: 'transparent', border: '1px solid #d1d5db', borderRadius: '999px', padding: '6px 16px', fontSize: '12px', fontWeight: 500, color: '#374151', cursor: 'pointer' }}
          >
            Today
          </button>
          <button onClick={goPrev} aria-label="Previous month" style={toolbarIconButtonStyle}>
            ‹
          </button>
          <button onClick={goNext} aria-label="Next month" style={toolbarIconButtonStyle}>
            ›
          </button>
        </div>

        <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>{monthLabel}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={handlePrint} aria-label="Print" title="Print" style={toolbarIconButtonStyle}>
            🖨️
          </button>
          <div style={{ position: 'relative' }}>
            <button onClick={handleShare} aria-label="Share" title="Share" style={toolbarIconButtonStyle}>
              🔗
            </button>
            {toast && (
              <div
                style={{
                  position: 'absolute',
                  top: '38px',
                  right: 0,
                  background: '#111827',
                  color: '#ffffff',
                  fontSize: '11px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                }}
              >
                {toast}
              </div>
            )}
          </div>
          <select value="month" onChange={() => {}} aria-label="Calendar view" className="ebright-month-select">
            <option value="month">Month</option>
          </select>
        </div>
      </div>

      <div style={{ padding: '16px 20px 20px' }}>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {TYPES.map((t) => {
            const active = activeTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: active ? TYPE_COLORS[t] + '18' : '#f3f4f6',
                  color: active ? TYPE_COLORS[t] : '#9ca3af',
                  border: 'none',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  opacity: active ? 1 : 0.7,
                }}
              >
                {TYPE_ICONS[t]} {t}
              </button>
            );
          })}
        </div>

        {/* Weekday header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: '#e5e7eb', border: '1px solid #e5e7eb', borderBottom: 'none', borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} style={{ background: '#f9fafb', padding: '10px', fontSize: '11px', fontWeight: 600, color: '#9ca3af', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gridAutoRows: '104px', // fixed row height — content must fit inside it, never the other way around
            gap: '1px',
            background: '#e5e7eb',
            border: '1px solid #e5e7eb',
            borderRadius: '0 0 10px 10px',
            overflow: 'hidden',
          }}
        >
          {cells.map((date, i) => {
            const inMonth = date.getMonth() === month;
            const dayEvents = eventsByDay.get(dayKey(date)) ?? [];
            const isToday = isSameDay(date, today);
            const visibleTags = dayEvents.slice(0, 3);
            const overflowCount = dayEvents.length - visibleTags.length;

            return (
              <div
                key={i}
                onClick={() => openDay(date, dayEvents)}
                role={dayEvents.length > 0 ? 'button' : undefined}
                tabIndex={dayEvents.length > 0 ? 0 : undefined}
                onKeyDown={(e) => {
                  if (dayEvents.length > 0 && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    openDay(date, dayEvents);
                  }
                }}
                style={{
                  height: '104px',
                  minWidth: 0, // grid items default to min-width:auto, which would let long nowrap text force the column (and row) to grow — this defeats that
                  background: isToday ? '#fef2f2' : inMonth ? '#ffffff' : '#f9fafb',
                  padding: '8px',
                  cursor: dayEvents.length > 0 ? 'pointer' : 'default',
                  boxSizing: 'border-box',
                  overflow: 'hidden', // safety net: nothing inside can ever push this cell (or its row) taller/wider
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: isToday ? '#dc2626' : 'transparent',
                    color: isToday ? '#ffffff' : inMonth ? '#111827' : '#d1d5db',
                    fontWeight: isToday ? 700 : 400,
                    fontSize: '12px',
                    marginBottom: '6px',
                    flexShrink: 0,
                  }}
                >
                  {date.getDate()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, width: '100%' }}>
                  {visibleTags.map((e) => (
                    <div
                      key={e.id}
                      title={e.title}
                      style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: (TYPE_COLORS[e.type] ?? '#9ca3af') + '1c',
                        color: TYPE_COLORS[e.type] ?? '#6b7280',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0, // flex items also default to min-width:auto — same fix as the grid item above
                        maxWidth: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      {TYPE_ICONS[e.type] ?? '📅'} {e.title}
                    </div>
                  ))}
                  {overflowCount > 0 && (
                    <div style={{ fontSize: '10px', color: '#9ca3af', paddingLeft: '4px', flexShrink: 0 }}>+{overflowCount} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer strip */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid #e5e7eb',
          background: '#f9fafb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>EBRIGHT PORTAL Calendar</div>
        <div style={{ fontSize: '11px', color: '#9ca3af' }}>Events shown in time zone: (GMT+08:00) Malaysia Time - Kuala Lumpur</div>
      </div>

      {dayModal && <DayDetailModal date={dayModal.date} events={dayModal.events} onClose={() => setDayModal(null)} />}
    </div>
  );
}

function DayDetailModal({ date, events, onClose }: { date: Date; events: CalendarEventItem[]; onClose: () => void }) {
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
          padding: '20px',
          width: '100%',
          maxWidth: '440px',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>
            {date.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', fontSize: '18px', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {events.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px', background: '#f9fafb', borderRadius: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: (TYPE_COLORS[e.type] ?? '#9ca3af') + '18',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '15px',
                  flexShrink: 0,
                }}
              >
                {TYPE_ICONS[e.type] ?? '📅'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>{e.title}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {new Date(e.date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}
                  {e.branch ?? 'All branches'}
                  {e.description ? ` · ${e.description}` : ''}
                </div>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: (TYPE_COLORS[e.type] ?? '#9ca3af') + '18',
                  color: TYPE_COLORS[e.type] ?? '#9ca3af',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}
              >
                {e.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
