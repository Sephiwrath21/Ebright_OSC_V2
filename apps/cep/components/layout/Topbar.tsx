'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { NotificationModal, type NotificationDetail } from './NotificationModal';

const TYPE_ICONS: Record<string, string> = {
  welcome_sent: '👋',
  sms_sent: '✅',
  sms_skipped: '⏭️',
  birthday_due: '🎂',
  blast_sent: '📤',
  system: 'ℹ️',
  cron_completed: '🕐',
  festive_fallback: '⚠️',
  festive_canceled: '🗑️',
  showcase_missing_template: '⚠️',
  showcase_missing_template_urgent: '🚨',
  showcase_canceled: '🗑️',
};

const TYPE_COLORS: Record<string, string> = {
  welcome_sent: '#dc2626',
  sms_sent: '#22c55e',
  sms_skipped: '#9ca3af',
  birthday_due: '#f59e0b',
  blast_sent: '#dc2626',
  system: '#9ca3af',
  cron_completed: '#6366f1',
  festive_fallback: '#f59e0b',
  festive_canceled: '#9ca3af',
  showcase_missing_template: '#f59e0b',
  showcase_missing_template_urgent: '#dc2626',
  showcase_canceled: '#9ca3af',
};

type Notification = NotificationDetail;

function pageTitle(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/parents')) return 'Parents';
  if (pathname.startsWith('/enrollment')) return 'Enrollment';
  if (pathname.startsWith('/content')) return 'Content library';
  if (pathname.startsWith('/blast')) return 'Blast';
  if (pathname.startsWith('/calendars')) return 'Calendars';
  if (pathname.startsWith('/automation/queue')) return 'Automation \u2022 Queue';
  if (pathname.startsWith('/automation/cron')) return 'Automation \u2022 Cron monitor';
  if (pathname.startsWith('/automation')) return 'Automation rules';
  if (pathname.startsWith('/admin')) return 'Admin';
  return 'Ebright SMS Portal';
}

export function Topbar() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Notification | null>(null);
  const pathname = usePathname() || '/';
  const ref = useRef<HTMLDivElement>(null);

  // Poll unread count every 10 seconds
  useEffect(() => {
    let mounted = true;
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/notifications/unread-count', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setUnreadCount(data.count ?? 0);
      } catch {
        /* ignore */
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const openDropdown = async () => {
    setOpen(true);
    try {
      const res = await fetch('/api/notifications?limit=15', { cache: 'no-store' });
      const data = await res.json();
      setNotifications(data);
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async () => {
    // Optimistic UI first, then try to persist. If the request fails
    // (e.g. dev server restarting), UI still updates and next poll re-syncs.
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      /* server unreachable — next poll will re-sync */
    }
  };

  const handleClick = async (n: Notification) => {
    if (!n.read) {
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try {
        await fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
      } catch {
        /* server unreachable — next poll will re-sync */
      }
    }
    setOpen(false);
    setSelected(n);
  };

  return (
    <div
      style={{
        height: '56px',
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{pageTitle(pathname)}</div>

      <div style={{ position: 'relative' }} ref={ref}>
        <button
          onClick={open ? () => setOpen(false) : openDropdown}
          style={{
            position: 'relative',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            color: '#6b7280',
            fontSize: '20px',
            lineHeight: 1,
          }}
          aria-label={`${unreadCount} unread notifications`}
        >
          🔔
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                background: '#ef4444',
                color: '#fff',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                fontSize: '10px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '48px',
              width: '380px',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 1000,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Notifications</span>
              <button
                onClick={markAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#dc2626',
                  fontWeight: 500,
                }}
              >
                Mark all read
              </button>
            </div>

            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      background: n.read ? 'transparent' : 'rgba(220,38,38,0.06)',
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(220,38,38,0.06)')
                    }
                  >
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        flexShrink: 0,
                        background: (TYPE_COLORS[n.type] || '#9ca3af') + '22',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                      }}
                    >
                      {TYPE_ICONS[n.type] || 'ℹ️'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: n.read ? 400 : 600,
                          color: '#111827',
                        }}
                      >
                        {n.title}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          marginTop: '2px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {n.message}
                      </div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '3px' }}>
                        {new Date(n.createdAt).toLocaleString('en-MY', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    {!n.read && (
                      <div
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: '#dc2626',
                          flexShrink: 0,
                          marginTop: '4px',
                        }}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {selected && <NotificationModal notification={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
