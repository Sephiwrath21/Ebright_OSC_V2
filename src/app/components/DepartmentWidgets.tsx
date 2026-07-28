"use client";

import { useEffect, useRef, useState } from "react";

const fontStack =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "0.5px solid #E5E7EB",
  borderRadius: 12,
};

type ChatMsg = {
  id: number;
  dept: string;
  senderEmail: string;
  senderName: string | null;
  recipientEmail: string | null; // null = Everyone
  body: string;
  createdAt: string;
  edited: boolean;
};

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤩", "🥳",
  "😉", "🙂", "🙃", "😇", "🤔", "😅", "😭", "😡", "👍", "👎",
  "🙏", "👏", "🙌", "💪", "🔥", "✨", "🎉", "❤️", "💯", "✅",
  "❌", "👀", "😴", "🤝", "🫡", "🥺", "😢", "😤", "🤯", "💀",
];
type DeptMember = { name: string; email: string | null; role: string | null; online: boolean };

const EVERYONE = "all"; // convo key for the department-wide channel

interface DepartmentWidgetsProps {
  slug: string;
  departmentName: string;
  userName?: string | null;
  userEmail?: string | null;
}

/**
 * Floating Brain Dump + department Chat (bottom-right), shared across the
 * department dashboard and the member page. State is scoped per-department via
 * localStorage, so the same department shares one note + chat across its pages.
 *
 * Chat is local-only for now. To make it real multi-user later, replace the
 * localStorage load/save with a fetch to an API route backed by a
 * `department_message` table — the render logic stays the same.
 */
export default function DepartmentWidgets({
  slug,
  departmentName,
  userEmail,
}: DepartmentWidgetsProps) {
  const deptKey = departmentName.toLowerCase().replace(/\s+/g, "-");
  const myEmail = userEmail?.toLowerCase() ?? null;

  const [openPanel, setOpenPanel] = useState<"chat" | "brain" | null>(null);

  // ── Presence: who in this department is on the site right now ────────────────
  // Heartbeat marks me active; polling refreshes the roster. Online members are
  // shown at the top of the chat panel. (No messages are stored server-side yet.)
  const [members, setMembers] = useState<DeptMember[]>([]);
  const [showAllOnline, setShowAllOnline] = useState(false);
  useEffect(() => {
    let active = true;
    const beat = () => {
      fetch("/api/presence", { method: "POST" }).catch(() => { });
    };
    const load = () => {
      fetch(`/api/department/${slug}/members`)
        .then((r) => r.json())
        .then((d) => {
          if (active && Array.isArray(d?.members)) setMembers(d.members as DeptMember[]);
        })
        .catch(() => { });
    };
    beat();
    load();
    const beatId = setInterval(beat, 30_000);
    const loadId = setInterval(load, 20_000);
    return () => {
      active = false;
      clearInterval(beatId);
      clearInterval(loadId);
    };
  }, [slug]);

  // Only people currently online, by name. Collapsed to a couple of rows.
  const onlineMembers = members
    .filter((m) => m.online)
    .sort((a, b) => a.name.localeCompare(b.name));
  const onlineCount = onlineMembers.length;
  const COLLAPSED_ROWS = 2;
  const visibleOnline = showAllOnline
    ? onlineMembers
    : onlineMembers.slice(0, COLLAPSED_ROWS);
  const hiddenOnline = onlineCount - visibleOnline.length;

  // ── Brain dump (persisted on this device) ───────────────────────────────────
  const noteKey = `dept-braindump:${deptKey}`;
  const [note, setNote] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);
  useEffect(() => {
    try {
      setNote(localStorage.getItem(noteKey) ?? "");
    } catch {
      /* ignore */
    }
    setNoteLoaded(true);
  }, [noteKey]);
  useEffect(() => {
    if (!noteLoaded) return;
    try {
      localStorage.setItem(noteKey, note);
    } catch {
      /* ignore */
    }
  }, [note, noteKey, noteLoaded]);

  // ── Department chat (server-backed, stored in hrfs) ──────────────────────────
  // convo = EVERYONE (dept-wide) or a member email (private 1-on-1), Zoom-style.
  const [convo, setConvo] = useState<string>(EVERYONE);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ title: string; body: string; convoKey: string } | null>(null);
  // Unread model: a conversation is unread when its newest message FROM OTHERS
  // (latest[key]) is newer than the newest message I've read (readUpTo[key]).
  // readUpTo is persisted, so the red dot is correct across reloads and clears
  // the moment I open and read that conversation.
  const [latest, setLatest] = useState<Record<string, number>>({});
  const [readUpTo, setReadUpTo] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastInboxIdRef = useRef<number>(0);
  const convoRef = useRef(convo);
  const openRef = useRef(false);
  convoRef.current = convo;
  openRef.current = openPanel === "chat";

  const keyOf = (c: string) => (c === EVERYONE ? EVERYONE : c.toLowerCase());
  const readKey = `chat-read:${slug}:${myEmail ?? "anon"}`;

  // Load / persist read state.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(readKey);
      setReadUpTo(raw ? (JSON.parse(raw) as Record<string, number>) : {});
    } catch {
      setReadUpTo({});
    }
  }, [readKey]);
  useEffect(() => {
    try {
      localStorage.setItem(readKey, JSON.stringify(readUpTo));
    } catch {
      /* ignore */
    }
  }, [readKey, readUpTo]);

  const hasUnread = (key: string) => (latest[key] ?? 0) > (readUpTo[key] ?? 0);
  const totalUnread = Object.keys(latest).filter(hasUnread).length;

  function markRead(convoStr: string, uptoId: number) {
    const k = keyOf(convoStr);
    setReadUpTo((r) => ((r[k] ?? 0) >= uptoId ? r : { ...r, [k]: uptoId }));
  }

  // Record newest ids from others (drives the unread dot) + toast/notify on new arrivals.
  function applyInboxMessages(msgs: ChatMsg[], notify = true) {
    if (msgs.length === 0) return;
    setLatest((prev) => {
      const next = { ...prev };
      for (const m of msgs) {
        const key = m.recipientEmail == null ? EVERYONE : m.senderEmail.toLowerCase();
        if (m.id > (next[key] ?? 0)) next[key] = m.id;
      }
      return next;
    });
    if (!notify) return;
    for (const m of msgs) {
      const key = m.recipientEmail == null ? EVERYONE : m.senderEmail.toLowerCase();
      const viewing = openRef.current && keyOf(convoRef.current) === key;
      if (viewing) continue; // reading it now — the mark-read effect clears it
      const scope = m.recipientEmail == null ? `${departmentName} · Everyone` : "Private message";
      const title = `${m.senderName ?? "New message"} — ${scope}`;
      setToast({ title, body: m.body.slice(0, 140), convoKey: key });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(title, { body: m.body.slice(0, 140) });
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Load + poll the currently-open conversation.
  useEffect(() => {
    if (openPanel !== "chat") return;
    let active = true;
    const load = () => {
      fetch(`/api/department/${slug}/chat?with=${encodeURIComponent(convo)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!active || !Array.isArray(d?.messages)) return;
          const msgs = d.messages as ChatMsg[];
          setMessages(msgs);
          // Reading this conversation marks it read up to its newest message from others.
          const fromOthers = msgs.filter((m) => m.senderEmail.toLowerCase() !== myEmail);
          if (fromOthers.length > 0) markRead(convo, fromOthers[fromOthers.length - 1].id);
        })
        .catch(() => { });
    };
    setMessages([]);
    load();
    const id = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [slug, convo, openPanel, myEmail]);

  // While a conversation is open, keep marking it read as new messages arrive.
  useEffect(() => {
    if (openPanel !== "chat") return;
    const lt = latest[keyOf(convo)] ?? 0;
    if (lt > 0) markRead(convo, lt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPanel, convo, latest]);

  // Auto-dismiss the in-app toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  // Notification poller: detect new messages addressed to me, badge + notify.
  useEffect(() => {
    let active = true;

    const seed = () => {
      fetch(`/api/department/${slug}/chat/inbox?sinceId=0`)
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          const msgs: ChatMsg[] = Array.isArray(d?.messages) ? d.messages : [];
          if (msgs.length > 0) {
            applyInboxMessages(msgs, false);
            lastInboxIdRef.current = msgs.reduce((max, m) => Math.max(max, m.id), 0);
          }
        })
        .catch(() => { });
    };

    seed();

    const poll = () => {
      fetch(`/api/department/${slug}/chat/inbox?sinceId=${lastInboxIdRef.current}`)
        .then((r) => r.json())
        .then((d) => {
          const msgs: ChatMsg[] = Array.isArray(d?.messages) ? d.messages : [];
          if (!active || msgs.length === 0) return;
          for (const m of msgs) {
            lastInboxIdRef.current = Math.max(lastInboxIdRef.current, m.id);
          }
          applyInboxMessages(msgs);
        })
        .catch(() => { });
    };
    const id = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [slug, departmentName]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    setEmojiOpen(false);

    // Editing an existing message → PATCH; otherwise send a new one.
    if (editingId != null) {
      const id = editingId;
      setEditingId(null);
      setDraft("");
      fetch(`/api/department/${slug}/chat/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.message)
            setMessages((prev) => prev.map((m) => (m.id === id ? (d.message as ChatMsg) : m)));
        })
        .catch(() => { });
      return;
    }

    setDraft("");
    fetch(`/api/department/${slug}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: convo, body: text }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.message) setMessages((prev) => [...prev, d.message as ChatMsg]);
      })
      .catch(() => { });
  }

  function startEdit(m: ChatMsg) {
    setEditingId(m.id);
    setDraft(m.body);
    setEmojiOpen(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }

  function unsend(id: number) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (editingId === id) cancelEdit();
    fetch(`/api/department/${slug}/chat/${id}`, { method: "DELETE" }).catch(() => { });
  }

  // Name to show for the current conversation target.
  const convoMember = members.find((m) => m.email?.toLowerCase() === convo.toLowerCase());
  const convoLabel = convo === EVERYONE ? "Everyone" : convoMember?.name ?? convo;

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 12,
        fontFamily: fontStack,
      }}
    >
      {openPanel === "chat" && (
        <div
          style={{
            ...card,
            width: 340,
            boxShadow: "0 12px 28px rgba(15,23,42,0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "0.5px solid #F1F1F1",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#374151",
              }}
            >
              <i className="ti ti-message-circle" style={{ color: "#6B7280" }} />
              {departmentName} Chat
            </span>
            <button
              type="button"
              onClick={() => setOpenPanel(null)}
              aria-label="Close chat"
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#94A3B8",
                display: "inline-flex",
                fontSize: 16,
              }}
            >
              <i className="ti ti-x" />
            </button>
          </header>
          {/* Active now — who in this department currently has the site open */}
          <div
            style={{
              borderBottom: "0.5px solid #F1F1F1",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#374151",
              }}
            >
              Active now · {onlineCount}
            </span>
            {onlineCount === 0 ? (
              <span style={{ fontSize: 12, color: "#94A3B8" }}>
                No one from {departmentName} is online right now.
              </span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {visibleOnline.map((m) => {
                  const isMe = !!m.email && m.email.toLowerCase() === myEmail;
                  const initials = m.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() ?? "")
                    .join("");
                  return (
                    <div
                      key={m.email ?? m.name}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span style={{ position: "relative", display: "inline-flex" }}>
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 999,
                            background: "#E2E8F0",
                            color: "#475569",
                            fontSize: 11,
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {initials || "?"}
                        </span>
                        <span
                          style={{
                            position: "absolute",
                            right: -1,
                            bottom: -1,
                            width: 9,
                            height: 9,
                            borderRadius: 999,
                            border: "1.5px solid #FFFFFF",
                            background: "#22C55E",
                          }}
                        />
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: "#1F2937",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {m.name}
                        {isMe && <span style={{ color: "#94A3B8", fontWeight: 600 }}> · you</span>}
                      </span>
                    </div>
                  );
                })}

                {onlineCount > COLLAPSED_ROWS && (
                  <button
                    type="button"
                    onClick={() => setShowAllOnline((v) => !v)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      alignSelf: "flex-start",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      padding: "2px 0",
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#185FA5",
                    }}
                  >
                    {showAllOnline ? "Show less" : `Show ${hiddenOnline} more`}
                    <i className={showAllOnline ? "ti ti-chevron-up" : "ti ti-chevron-down"} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
            {/* To: selector — Everyone (default) or a private 1-on-1 */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  padding: "7px 10px",
                  border: "0.5px solid #E5E7EB",
                  borderRadius: 8,
                  background: "#F8FAFC",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  color: "#1F2937",
                }}
              >
                <span style={{ color: "#6B7280" }}>To:</span>
                <i
                  className={convo === EVERYONE ? "ti ti-users" : "ti ti-user"}
                  style={{ color: "#185FA5" }}
                />
                <span style={{ fontWeight: 600 }}>{convoLabel}</span>
                <i className="ti ti-chevron-down" style={{ marginLeft: "auto", color: "#94A3B8" }} />
              </button>
              {pickerOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    zIndex: 5,
                    background: "#FFFFFF",
                    border: "0.5px solid #E5E7EB",
                    borderRadius: 8,
                    boxShadow: "0 10px 24px rgba(15,23,42,0.16)",
                    maxHeight: 220,
                    overflowY: "auto",
                    padding: 4,
                  }}
                >
                  <PickerRow
                    icon="ti ti-users"
                    label="Everyone"
                    active={convo === EVERYONE}
                    unread={hasUnread(EVERYONE)}
                    online
                    onClick={() => {
                      setConvo(EVERYONE);
                      setPickerOpen(false);
                    }}
                  />
                  {members
                    .filter((m) => m.email && m.email.toLowerCase() !== myEmail)
                    .map((m) => (
                      <PickerRow
                        key={m.email as string}
                        icon="ti ti-user"
                        label={m.name}
                        active={convo.toLowerCase() === (m.email as string).toLowerCase()}
                        unread={hasUnread((m.email as string).toLowerCase())}
                        online={m.online}
                        onClick={() => {
                          setConvo(m.email as string);
                          setPickerOpen(false);
                        }}
                      />
                    ))}
                </div>
              )}
            </div>

            <div
              ref={scrollRef}
              style={{
                flex: 1,
                minHeight: 200,
                maxHeight: 320,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: "4px 2px",
              }}
            >
              {messages.length === 0 ? (
                <div
                  style={{ margin: "auto", fontSize: 13, color: "#94A3B8", textAlign: "center" }}
                >
                  {convo === EVERYONE
                    ? `No messages yet — say hello to ${departmentName} 👋`
                    : `No messages yet with ${convoLabel} 👋`}
                </div>
              ) : (
                messages.map((m) => {
                  const mine = !!myEmail && m.senderEmail.toLowerCase() === myEmail;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: mine ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2, padding: "0 4px" }}
                      >
                        {mine ? "You" : m.senderName ?? m.senderEmail} · {formatTime(m.createdAt)}
                        {m.edited && " · edited"}
                      </div>
                      <div
                        style={{
                          maxWidth: "75%",
                          padding: "8px 12px",
                          borderRadius: 12,
                          fontSize: 13,
                          lineHeight: 1.4,
                          background: mine ? "#185FA5" : "#F1F5F9",
                          color: mine ? "#FFFFFF" : "#1F2937",
                          borderTopRightRadius: mine ? 4 : 12,
                          borderTopLeftRadius: mine ? 12 : 4,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {m.body}
                      </div>
                      {mine && (
                        <div style={{ display: "flex", gap: 10, marginTop: 3, padding: "0 4px" }}>
                          <button
                            type="button"
                            onClick={() => startEdit(m)}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              fontSize: 11,
                              color: "#94A3B8",
                              padding: 0,
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => unsend(m.id)}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              fontSize: 11,
                              color: "#DC2626",
                              padding: 0,
                            }}
                          >
                            Unsend
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ position: "relative", borderTop: "0.5px solid #F1F1F1", paddingTop: 10 }}>
              {editingId != null && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                    padding: "5px 10px",
                    background: "#EFF6FF",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#185FA5",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <i className="ti ti-pencil" /> Editing message
                  </span>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 12,
                      color: "#64748B",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {emojiOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% - 2px)",
                    left: 0,
                    right: 0,
                    zIndex: 6,
                    background: "#FFFFFF",
                    border: "0.5px solid #E5E7EB",
                    borderRadius: 10,
                    boxShadow: "0 10px 24px rgba(15,23,42,0.16)",
                    padding: 8,
                    display: "grid",
                    gridTemplateColumns: "repeat(8, 1fr)",
                    gap: 2,
                    maxHeight: 168,
                    overflowY: "auto",
                  }}
                >
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setDraft((d) => d + e)}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: 18,
                        padding: 4,
                        borderRadius: 6,
                        lineHeight: 1,
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setEmojiOpen((v) => !v)}
                  aria-label="Emoji"
                  title="Emoji"
                  style={{
                    border: "none",
                    background: emojiOpen ? "#EFF6FF" : "transparent",
                    cursor: "pointer",
                    color: "#64748B",
                    fontSize: 20,
                    display: "inline-flex",
                    padding: 6,
                    borderRadius: 8,
                  }}
                >
                  <i className="ti ti-mood-smile" />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                    if (e.key === "Escape" && editingId != null) cancelEdit();
                  }}
                  placeholder={
                    editingId != null
                      ? "Edit your message…"
                      : convo === EVERYONE
                        ? `Message ${departmentName}…`
                        : `Message ${convoLabel}…`
                  }
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    border: "0.5px solid #E5E7EB",
                    borderRadius: 8,
                    outline: "none",
                    fontFamily: "inherit",
                    fontSize: 13,
                    color: "#1F2937",
                  }}
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!draft.trim()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 16px",
                    border: "none",
                    borderRadius: 8,
                    background: draft.trim() ? "#185FA5" : "#CBD5E1",
                    color: "#FFFFFF",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    cursor: draft.trim() ? "pointer" : "default",
                  }}
                >
                  <i className={editingId != null ? "ti ti-check" : "ti ti-send"} />
                  {editingId != null ? "Save" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {openPanel === "brain" && (
        <div
          style={{
            ...card,
            width: 300,
            boxShadow: "0 12px 28px rgba(15,23,42,0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "0.5px solid #F1F1F1",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#374151",
              }}
            >
              <i className="ti ti-notes" style={{ color: "#6B7280" }} />
              Brain Dump
            </span>
            <button
              type="button"
              onClick={() => setOpenPanel(null)}
              aria-label="Close brain dump"
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#94A3B8",
                display: "inline-flex",
                fontSize: 16,
              }}
            >
              <i className="ti ti-x" />
            </button>
          </header>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Jot anything down — saved automatically on this device."
            style={{
              width: "100%",
              minHeight: 170,
              resize: "vertical",
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: fontStack,
              fontSize: 13,
              lineHeight: 1.5,
              color: "#1F2937",
              padding: 14,
            }}
          />
        </div>
      )}

      {/* In-app notification toast (shows even without browser permission) */}
      {toast && (
        <button
          type="button"
          onClick={() => {
            // Opening the conversation marks it read (handled by the effects).
            setConvo(toast.convoKey);
            setOpenPanel("chat");
            setToast(null);
          }}
          style={{
            ...card,
            width: 300,
            textAlign: "left",
            cursor: "pointer",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 3,
            boxShadow: "0 12px 28px rgba(15,23,42,0.2)",
            borderLeft: "3px solid #185FA5",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "#185FA5",
            }}
          >
            <i className="ti ti-message-circle" />
            {toast.title}
          </span>
          <span
            style={{
              fontSize: 13,
              color: "#1F2937",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {toast.body}
          </span>
        </button>
      )}

      {/* Buttons: chat + brain dump, side by side */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={() => {
            setOpenPanel((p) => (p === "chat" ? null : "chat"));
            // Ask for notification permission here — a user gesture, which
            // browsers require (an effect-based request is silently ignored).
            if (typeof Notification !== "undefined" && Notification.permission === "default") {
              Notification.requestPermission().catch(() => { });
            }
          }}
          aria-label="Department chat"
          title="Department chat"
          style={{
            position: "relative",
            width: 48,
            height: 48,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: openPanel === "chat" ? "#0F4C81" : "#185FA5",
            color: "#fff",
            boxShadow: "0 8px 20px rgba(24,95,165,0.4)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          <i className={openPanel === "chat" ? "ti ti-x" : "ti ti-message-circle"} />
          {totalUnread > 0 && (
            <span
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "#DC2626",
                border: "2px solid #fff",
              }}
            />
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpenPanel((p) => (p === "brain" ? null : "brain"))}
          aria-label="Brain dump"
          title="Brain dump"
          style={{
            width: 48,
            height: 48,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: openPanel === "brain" ? "#0F4C81" : "#185FA5",
            color: "#fff",
            boxShadow: "0 8px 20px rgba(24,95,165,0.4)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          <i className={openPanel === "brain" ? "ti ti-x" : "ti ti-notes"} />
        </button>
      </div>
    </div>
  );
}

// One row in the "To:" conversation picker (Everyone or a department member).
function PickerRow({
  icon,
  label,
  active,
  online,
  unread,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  online: boolean;
  unread: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "7px 10px",
        border: "none",
        borderRadius: 6,
        background: active ? "#EFF6FF" : "transparent",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 13,
        textAlign: "left",
      }}
    >
      <i className={icon} style={{ color: active ? "#185FA5" : "#94A3B8" }} />
      <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: online ? "#22C55E" : "#CBD5E1",
          }}
        />
      </span>
      <span
        style={{
          flex: 1,
          color: "#1F2937",
          fontWeight: active ? 600 : 400,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      {unread && (
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: "#DC2626",
          }}
        />
      )}
    </button>
  );
}
