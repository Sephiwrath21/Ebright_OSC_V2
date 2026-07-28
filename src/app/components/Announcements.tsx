"use client";

import { useEffect, useRef, useState } from "react";

const fontStack =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const RED = "#DC2626";
const MAX_FILE_BYTES = 1_500_000; // ~1.5MB

type Announcement = {
  id: number;
  title: string;
  body: string;
  imageData: string | null;
  createdByName: string | null;
  createdAt: string;
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * Company-wide announcements. Compact "Highlights" cards in the dashboard panel;
 * clicking opens the full "Bulletin Board" modal. Admins/HODs get an Add button.
 */
export default function Announcements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);

  const load = () => {
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.announcements)) setItems(d.announcements as Announcement[]);
        setCanPost(!!d?.canPost);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  };
  useEffect(load, []);

  const openBoard = (id: number | null) => {
    setFocusId(id);
    setBoardOpen(true);
  };

  return (
    <div style={{ fontFamily: fontStack, display: "flex", flexDirection: "column", gap: 10 }}>
      {canPost && (
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          style={{
            alignSelf: "flex-end",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            border: "none",
            borderRadius: 8,
            background: RED,
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          <i className="ti ti-plus" /> Add
        </button>
      )}

      {/* Compact highlight cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxHeight: 320,
          overflowY: "auto",
          paddingRight: 2,
        }}
      >
        {!loaded ? (
          <span style={{ fontSize: 13, color: "#94A3B8" }}>Loading…</span>
        ) : items.length === 0 ? (
          <span style={{ fontSize: 13, color: "#94A3B8" }}>No announcements yet.</span>
        ) : (
          items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openBoard(a.id)}
              style={{
                textAlign: "left",
                cursor: "pointer",
                background: "#FFFFFF",
                border: "0.5px solid #E5E7EB",
                borderLeft: `3px solid ${RED}`,
                borderRadius: 10,
                overflow: "hidden",
                padding: 0,
                fontFamily: "inherit",
              }}
            >
              {a.imageData && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.imageData}
                  alt=""
                  style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }}
                />
              )}
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: RED, lineHeight: 1.3 }}>
                    {a.title}
                  </span>
                  <span style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>
                    {fmtDate(a.createdAt)}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 13,
                    color: "#475569",
                    lineHeight: 1.45,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {a.body}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {boardOpen && (
        <BulletinBoard
          items={items}
          focusId={focusId}
          canPost={canPost}
          onClose={() => setBoardOpen(false)}
          onAdd={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          onEdit={(a) => {
            setEditing(a);
            setFormOpen(true);
          }}
          onDeleted={(id) => setItems((prev) => prev.filter((x) => x.id !== id))}
        />
      )}

      {formOpen && (
        <AnnouncementForm
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={(a, isNew) => {
            setItems((prev) => (isNew ? [a, ...prev] : prev.map((x) => (x.id === a.id ? a : x))));
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Full bulletin board modal ────────────────────────────────────────────────
function BulletinBoard({
  items,
  focusId,
  canPost,
  onClose,
  onAdd,
  onEdit,
  onDeleted,
}: {
  items: Announcement[];
  focusId: number | null;
  canPost: boolean;
  onClose: () => void;
  onAdd: () => void;
  onEdit: (a: Announcement) => void;
  onDeleted: (id: number) => void;
}) {
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "start" });
  }, []);

  const remove = (id: number) => {
    fetch(`/api/announcements/${id}`, { method: "DELETE" })
      .then((r) => {
        if (r.ok) onDeleted(id);
      })
      .catch(() => {});
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        fontFamily: fontStack,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          width: "min(760px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "0.5px solid #E5E7EB",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: RED, letterSpacing: "0.02em" }}>
            BULLETIN BOARD
          </h2>
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            {canPost && (
              <button
                type="button"
                onClick={onAdd}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  border: "none",
                  borderRadius: 8,
                  background: RED,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                <i className="ti ti-plus" /> Add
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8", fontSize: 18 }}
            >
              <i className="ti ti-x" />
            </button>
          </div>
        </header>

        <div style={{ overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {items.length === 0 && (
            <span style={{ fontSize: 14, color: "#94A3B8" }}>No announcements yet.</span>
          )}
          {items.map((a) => (
            <article
              key={a.id}
              ref={a.id === focusId ? focusRef : undefined}
              style={{
                border: "0.5px solid #E5E7EB",
                borderLeft: `4px solid ${RED}`,
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: RED }}>{a.title}</h3>
                <span style={{ display: "inline-flex", gap: 10, alignItems: "center", whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: "#64748B",
                      background: "#F1F5F9",
                      borderRadius: 999,
                      padding: "3px 10px",
                    }}
                  >
                    {fmtDate(a.createdAt)}
                  </span>
                  {canPost && (
                    <button
                      type="button"
                      onClick={() => onEdit(a)}
                      aria-label="Edit announcement"
                      title="Edit"
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8", fontSize: 16 }}
                    >
                      <i className="ti ti-pencil" />
                    </button>
                  )}
                  {canPost && (
                    <button
                      type="button"
                      onClick={() => remove(a.id)}
                      aria-label="Delete announcement"
                      title="Delete"
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8", fontSize: 16 }}
                    >
                      <i className="ti ti-trash" />
                    </button>
                  )}
                </span>
              </div>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 14,
                  color: "#1F2937",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {a.body}
              </p>
              {a.imageData && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.imageData}
                  alt=""
                  style={{ width: "100%", marginTop: 12, borderRadius: 8, display: "block" }}
                />
              )}
              {a.createdByName && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#94A3B8" }}>
                  Posted by {a.createdByName}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Add / edit announcement form modal ───────────────────────────────────────
function AnnouncementForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: Announcement | null;
  onClose: () => void;
  onSaved: (a: Announcement, isNew: boolean) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [imageData, setImageData] = useState<string | null>(editing?.imageData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the content box to fit whatever is typed.
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 520)}px`;
  };
  useEffect(() => grow(bodyRef.current), []);

  const pickFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose an image file.");
    if (file.size > MAX_FILE_BYTES) return setError("Image too large (max ~1.5MB).");
    try {
      setImageData(await fileToDataUrl(file));
    } catch {
      setError("Could not read that image.");
    }
  };

  // Paste an image straight from the clipboard (e.g. "Copy image" from Google).
  // Only intercepts when the clipboard holds an image — text paste is untouched.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            void pickFile(file);
          }
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (!title.trim() || !body.trim()) return setError("Title and content are required.");
    setSaving(true);
    setError(null);
    const isNew = !editing;
    fetch(isNew ? "/api/announcements" : `/api/announcements/${editing!.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim(), imageData }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Failed to save");
        onSaved(d.announcement as Announcement, isNew);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to save"))
      .finally(() => setSaving(false));
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "0.5px solid #E5E7EB",
    borderRadius: 8,
    outline: "none",
    fontFamily: "inherit",
    fontSize: 14,
    color: "#1F2937",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 110,
        fontFamily: fontStack,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          width: "min(520px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>
            {editing ? "Edit announcement" : "New announcement"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8", fontSize: 18 }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          style={inputStyle}
        />
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            grow(e.target);
          }}
          placeholder="Write the announcement…"
          style={{ ...inputStyle, minHeight: 120, resize: "none", overflow: "hidden", lineHeight: 1.5 }}
        />

        {/* Image picker — a compact styled button, not the raw file input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => pickFile(e.target.files?.[0])}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              border: `1px solid ${RED}`,
              borderRadius: 8,
              background: "#FEF2F2",
              color: RED,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <i className="ti ti-photo" />
            {imageData ? "Change image" : "Choose image"}
          </button>
          <span style={{ fontSize: 12, color: "#94A3B8" }}>or paste (Ctrl+V) · optional · max ~1.5MB</span>
        </div>
        {imageData && (
          <div style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageData}
              alt="preview"
              style={{ width: "100%", borderRadius: 8, display: "block" }}
            />
            <button
              type="button"
              onClick={() => setImageData(null)}
              aria-label="Remove image"
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                border: "none",
                borderRadius: 999,
                width: 26,
                height: 26,
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <i className="ti ti-x" />
            </button>
          </div>
        )}

        {error && <span style={{ fontSize: 13, color: RED }}>{error}</span>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 16px",
              border: "0.5px solid #E5E7EB",
              borderRadius: 8,
              background: "#fff",
              color: "#475569",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            style={{
              padding: "9px 18px",
              border: "none",
              borderRadius: 8,
              background: saving ? "#CBD5E1" : RED,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Saving…" : editing ? "Save" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
