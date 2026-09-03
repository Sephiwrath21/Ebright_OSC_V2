import React, { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, Save, ArrowLeft, ChevronRight, GitMerge, Plus, GitBranch } from "lucide-react";

// Same base as storage.js — same-origin /flowghan-embed when embedded in the portal.
const API_BASE = import.meta.env.VITE_API_BASE || "/flowghan-embed";
const GRID = 20;

const C = {
  ink: "#1A1A1A", paper: "#F5F5F5", card: "#FFFFFF",
  spotlight: "#E62427", line: "#E0E0E0", slate: "#6B6B6B",
  slateLight: "#9E9E9E", sage: "#4F8F6B", paperDim: "#EBEBEB",
  spotlightDeep: "#A8181B",
};

const DEPT_HEADS = {
  "Academy": "Athirah", "Marketing": "Didi", "Finance": "Alyaa",
  "Human Resources & Legal": "Najwa", "Operations": "Manjeet",
  "Industrial-Organisational Psychology": "Fazween",
  "Optimisation": "Iqbal", "MD Office": "Under MD",
};

function getToken() { return localStorage.getItem("cue-app:auth:token"); }
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

const SHAPES = [
  { type: "oval",    label: "Start / End", shortcut: "O", color: "#4F8F6B", bg: "#E7F1EB" },
  { type: "rect",    label: "Process",     shortcut: "R", color: "#1A1A1A", bg: "#FFFFFF" },
  { type: "diamond", label: "Decision",    shortcut: "D", color: "#E62427", bg: "#FBE7E9" },
  { type: "text",    label: "Text Label",  shortcut: "T", color: "#6B6B6B", bg: "transparent" },
];

const DEFAULT_W = 160, DEFAULT_H = 60, DIAMOND_W = 160, DIAMOND_H = 80;

function snap(v) { return Math.round(v / GRID) * GRID; }
function getBounds(s) { return { x: s.x, y: s.y, w: s.w || DEFAULT_W, h: s.h || DEFAULT_H }; }
function getPort(s, side) {
  const b = getBounds(s);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (side === "top")    return { x: cx, y: b.y };
  if (side === "bottom") return { x: cx, y: b.y + b.h };
  if (side === "left")   return { x: b.x, y: cy };
  if (side === "right")  return { x: b.x + b.w, y: cy };
  return { x: cx, y: cy };
}
function bestSides(from, to) {
  const fb = getBounds(from), tb = getBounds(to);
  const dx = (tb.x + tb.w / 2) - (fb.x + fb.w / 2);
  const dy = (tb.y + tb.h / 2) - (fb.y + fb.h / 2);
  if (Math.abs(dx) > Math.abs(dy))
    return dx > 0 ? { from: "right", to: "left" } : { from: "left", to: "right" };
  return dy > 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
}

function ShapePreview({ type, color, bg }) {
  const w = 44, h = type === "diamond" ? 30 : 24;
  const cx = w / 2, cy = h / 2;
  const fill = bg === "transparent" ? "none" : (bg || "#fff");
  if (type === "oval")
    return <svg width={w} height={h}><ellipse cx={cx} cy={cy} rx={cx-2} ry={cy-2} fill={fill} stroke={color} strokeWidth={1.5}/></svg>;
  if (type === "rect")
    return <svg width={w} height={h}><rect x={2} y={2} width={w-4} height={h-4} rx={4} fill={fill} stroke={color} strokeWidth={1.5}/></svg>;
  if (type === "diamond") {
    const pts = `${cx},2 ${w-2},${cy} ${cx},${h-2} 2,${cy}`;
    return <svg width={w} height={h}><polygon points={pts} fill={fill} stroke={color} strokeWidth={1.5}/></svg>;
  }
  return <svg width={w} height={h}><text x={4} y={h-4} style={{fontFamily:"sans-serif",fontSize:13,fill:color}}>T</text></svg>;
}

// Convert flowchart shapes+arrows → template steps
function convertToTemplate(shapes, arrows, department) {
  const hod = DEPT_HEADS[department] || "Unassigned";
  const steps = [];

  // Only convert rect and diamond shapes
  const convertible = shapes.filter(s => s.type === "rect" || s.type === "diamond");

  convertible.forEach((s, i) => {
    const isApproval = s.type === "diamond";
    // Find which steps this one depends on
    const dependsOn = arrows
      .filter(a => a.to === s.id)
      .map(a => {
        const fromShape = shapes.find(x => x.id === a.from);
        return fromShape && (fromShape.type === "rect" || fromShape.type === "diamond")
          ? `step-${fromShape.id}` : null;
      })
      .filter(Boolean);

    steps.push({
      id: `step-${s.id}`,
      title: s.label || (isApproval ? "Approval" : "Process"),
      description: "",
      stepType: isApproval ? "approval" : "task",
      dept: department,
      assignee: hod,
      week: 0,
      dependsOn,
      fields: [],
      subtasks: [],
      optionalCompletion: false,
    });
  });

  return steps;
}

function FlowchartCanvas({ flowchart, onSave, onBack, onConvert }) {
  const [shapes, setShapes] = useState(flowchart?.data?.shapes || []);
  const [arrows, setArrows] = useState(flowchart?.data?.arrows || []);
  const [selected, setSelected] = useState(null);
  const [tool, setTool] = useState("select");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [name, setName] = useState(flowchart?.name || "Untitled Flowchart");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertSuccess, setConvertSuccess] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [connectSrc, setConnectSrc] = useState(null);
  const [dragArrow, setDragArrow] = useState(null);
  const [history, setHistory] = useState([{ shapes: [], arrows: [] }]);
  const [histIdx, setHistIdx] = useState(0);

  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const resizeRef = useRef(null);

  const pushHistory = useCallback((s, a) => {
    setHistory(h => [...h.slice(0, histIdx + 1), { shapes: s, arrows: a }]);
    setHistIdx(i => i + 1);
  }, [histIdx]);

  const undo = useCallback(() => {
    if (histIdx <= 0) return;
    const snap = history[histIdx - 1];
    setShapes(snap.shapes); setArrows(snap.arrows);
    setHistIdx(i => i - 1);
  }, [histIdx, history]);

  const redo = useCallback(() => {
    if (histIdx >= history.length - 1) return;
    const snap = history[histIdx + 1];
    setShapes(snap.shapes); setArrows(snap.arrows);
    setHistIdx(i => i + 1);
  }, [histIdx, history]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); return; }
      if (e.key === "Escape") { setContextMenu(null); setConnectSrc(null); setDragArrow(null); setTool("select"); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        if (selected.type === "shape") {
          const ns = shapes.filter(s => s.id !== selected.id);
          const na = arrows.filter(a => a.from !== selected.id && a.to !== selected.id);
          setShapes(ns); setArrows(na); pushHistory(ns, na); setSelected(null);
        } else if (selected.type === "arrow") {
          const na = arrows.filter(a => a.id !== selected.id);
          setArrows(na); pushHistory(shapes, na); setSelected(null);
        }
        return;
      }
      const map = { o: "oval", r: "rect", d: "diamond", t: "text", s: "select", a: "connect" };
      if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, shapes, arrows, undo, redo, pushHistory]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const svgPoint = (e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  };

  const addShape = (type, x, y) => {
    const meta = SHAPES.find(s => s.type === type);
    const w = type === "diamond" ? DIAMOND_W : DEFAULT_W;
    const h = type === "diamond" ? DIAMOND_H : DEFAULT_H;
    const ns = {
      id: `s-${Date.now()}`, type,
      x: snap(x - w / 2), y: snap(y - h / 2), w, h,
      label: type === "oval" ? "Start" : type === "rect" ? "Process" : type === "diamond" ? "Decision?" : "Text",
      color: meta?.color || C.ink, bg: meta?.bg || C.card,
    };
    const next = [...shapes, ns];
    setShapes(next); pushHistory(next, arrows);
    setSelected({ type: "shape", id: ns.id });
    setTool("select");
  };

  const onCanvasClick = (e) => {
    if (e.target === svgRef.current || e.target.tagName === "svg") {
      setSelected(null); setContextMenu(null);
      if (["oval", "rect", "diamond", "text"].includes(tool)) {
        const pt = svgPoint(e);
        if (pt) addShape(tool, pt.x, pt.y);
      }
    }
  };

  const onShapeMouseDown = (id, e) => {
    e.stopPropagation(); setContextMenu(null);
    if (tool === "connect") {
      if (!connectSrc) { setConnectSrc(id); return; }
      if (connectSrc !== id) {
        const from = shapes.find(s => s.id === connectSrc);
        const to = shapes.find(s => s.id === id);
        const sides = bestSides(from, to);
        const na = [...arrows, {
          id: `a-${Date.now()}`, from: connectSrc, to: id,
          fromSide: sides.from, toSide: sides.to,
          label: from?.type === "diamond" ? "Yes" : "",
        }];
        setArrows(na); pushHistory(shapes, na);
        setConnectSrc(null); setTool("select");
      }
      return;
    }
    setSelected({ type: "shape", id });
    const shape = shapes.find(s => s.id === id);
    const pt = svgPoint(e);
    if (shape && pt) dragRef.current = { id, offX: pt.x - shape.x, offY: pt.y - shape.y };
  };

  const onPortDrag = (shapeId, side, e) => {
    e.stopPropagation();
    if (side.startsWith("resize-")) {
      const handle = side.replace("resize-", "");
      const shape = shapes.find(s => s.id === shapeId);
      const b = getBounds(shape);
      resizeRef.current = { id: shapeId, handle, ox: b.x, oy: b.y, ow: b.w, oh: b.h };
      return;
    }
    const pt = svgPoint(e);
    setDragArrow({ fromId: shapeId, fromSide: side, curX: pt?.x || 0, curY: pt?.y || 0 });
  };

  const onMouseMove = (e) => {
    if (resizeRef.current) {
      const pt = svgPoint(e); if (!pt) return;
      const { id, handle, ox, oy, ow, oh } = resizeRef.current;
      let nx = ox, ny = oy, nw = ow, nh = oh;
      if (handle.includes("e")) nw = Math.max(60, snap(pt.x - ox));
      if (handle.includes("s")) nh = Math.max(40, snap(pt.y - oy));
      if (handle.includes("w")) { nw = Math.max(60, snap(ox + ow - pt.x)); nx = snap(pt.x); }
      if (handle.includes("n")) { nh = Math.max(40, snap(oy + oh - pt.y)); ny = snap(pt.y); }
      setShapes(prev => prev.map(s => s.id === id ? { ...s, x: nx, y: ny, w: nw, h: nh } : s));
      return;
    }
    if (dragRef.current) {
      const pt = svgPoint(e); if (!pt) return;
      setShapes(prev => prev.map(s => s.id === dragRef.current.id
        ? { ...s, x: snap(pt.x - dragRef.current.offX), y: snap(pt.y - dragRef.current.offY) } : s));
      return;
    }
    if (dragArrow) {
      const pt = svgPoint(e);
      if (pt) setDragArrow(d => ({ ...d, curX: pt.x, curY: pt.y }));
      return;
    }
    if (panRef.current) {
      setPan({ x: panRef.current.px + (e.clientX - panRef.current.sx), y: panRef.current.py + (e.clientY - panRef.current.sy) });
    }
  };

  const onMouseUp = (e) => {
    if (resizeRef.current) { pushHistory(shapes, arrows); resizeRef.current = null; return; }
    if (dragRef.current) { pushHistory(shapes, arrows); dragRef.current = null; return; }
    if (dragArrow) {
      const pt = svgPoint(e);
      if (pt) {
        const target = shapes.find(s => {
          const b = getBounds(s);
          return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
        });
        if (target && target.id !== dragArrow.fromId) {
          const from = shapes.find(s => s.id === dragArrow.fromId);
          const sides = bestSides(from, target);
          const na = [...arrows, {
            id: `a-${Date.now()}`, from: dragArrow.fromId, to: target.id,
            fromSide: dragArrow.fromSide, toSide: sides.to,
            label: from?.type === "diamond" ? "Yes" : "",
          }];
          setArrows(na); pushHistory(shapes, na);
        }
      }
      setDragArrow(null); return;
    }
    panRef.current = null;
  };

  const onSvgMouseDown = (e) => {
    if (e.target === svgRef.current || e.target.tagName === "svg")
      panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  };

  const onWheel = (e) => {
    e.preventDefault();
    setZoom(z => Math.min(3, Math.max(0.2, z + (e.deltaY < 0 ? 0.1 : -0.1))));
  };

  const onShapeDoubleClick = (id, e) => {
    e.stopPropagation();
    const shape = shapes.find(s => s.id === id);
    if (shape) setEditingLabel({ id, type: "shape", value: shape.label || "" });
  };

  const onArrowDoubleClick = (id, e) => {
    e.stopPropagation();
    const arrow = arrows.find(a => a.id === id);
    if (arrow) setEditingLabel({ id, type: "arrow", value: arrow.label || "" });
  };

  const commitLabel = () => {
    if (!editingLabel) return;
    if (editingLabel.type === "shape") {
      const ns = shapes.map(s => s.id === editingLabel.id ? { ...s, label: editingLabel.value } : s);
      setShapes(ns); pushHistory(ns, arrows);
    } else {
      const na = arrows.map(a => a.id === editingLabel.id ? { ...a, label: editingLabel.value } : a);
      setArrows(na); pushHistory(shapes, na);
    }
    setEditingLabel(null);
  };

  const onShapeRightClick = (id, e) => {
    e.preventDefault(); e.stopPropagation();
    setSelected({ type: "shape", id });
    setContextMenu({ x: e.clientX, y: e.clientY, id, type: "shape" });
  };

  const onArrowRightClick = (id, e) => {
    e.preventDefault(); e.stopPropagation();
    setSelected({ type: "arrow", id });
    setContextMenu({ x: e.clientX, y: e.clientY, id, type: "arrow" });
  };

  const deleteSelected = () => {
    if (!selected) return;
    if (selected.type === "shape") {
      const ns = shapes.filter(s => s.id !== selected.id);
      const na = arrows.filter(a => a.from !== selected.id && a.to !== selected.id);
      setShapes(ns); setArrows(na); pushHistory(ns, na);
    } else {
      const na = arrows.filter(a => a.id !== selected.id);
      setArrows(na); pushHistory(shapes, na);
    }
    setSelected(null); setContextMenu(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/flowcharts/${flowchart.department}/${flowchart.id}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ name, data: { shapes, arrows } }),
      });
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleConvert = async () => {
    const convertible = shapes.filter(s => s.type === "rect" || s.type === "diamond");
    if (convertible.length === 0) {
      alert("Add at least one Process or Decision shape to convert.");
      return;
    }
    setConverting(true);
    try {
      const steps = convertToTemplate(shapes, arrows, flowchart.department);
      const templateId = `dept-tpl-${Date.now()}`;
      await fetch(`${API_BASE}/api/dept-templates/${encodeURIComponent(flowchart.department)}/${templateId}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({
          name: `${name} (Template)`,
          data: {
            isTemplate: true,
            steps,
            variables: [],
            sourceFlowchartId: flowchart.id,
          },
        }),
      });
      setConvertSuccess(true);
      setTimeout(() => setConvertSuccess(false), 3000);
      onConvert && onConvert();
    } catch (e) { console.error(e); }
    setConverting(false);
  };

  const selectedShape = selected?.type === "shape" ? shapes.find(s => s.id === selected.id) : null;
  const selectedArrow = selected?.type === "arrow" ? arrows.find(a => a.id === selected.id) : null;
  const COLORS = ["#1A1A1A","#E62427","#4F8F6B","#3B82C4","#E67E22","#7C4D9B","#6B6B6B"];

  return (
    <div style={{ display: "flex", height: "100vh", flexDirection: "column", overflow: "hidden" }}>
      {/* Top toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
        background: C.card, borderBottom: `1px solid ${C.line}`, flexShrink: 0, flexWrap: "wrap",
      }}>
        <button onClick={onBack} style={btn("sec")}><ArrowLeft size={14} /> Back</button>
        <input value={name} onChange={e => setName(e.target.value)} style={{
          fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 600, color: C.ink,
          border: "none", background: "transparent", outline: "none", minWidth: 160,
        }} />
        <div style={{ flex: 1 }} />
        <button onClick={undo} disabled={histIdx <= 0} style={{ ...btn("sec"), opacity: histIdx <= 0 ? 0.4 : 1 }}>↩ Undo</button>
        <button onClick={redo} disabled={histIdx >= history.length - 1} style={{ ...btn("sec"), opacity: histIdx >= history.length - 1 ? 0.4 : 1 }}>↪ Redo</button>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} style={btn("sec")}>+</button>
        <span style={{ fontSize: 12, color: C.slate, minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} style={btn("sec")}>−</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={btn("sec")}>Reset</button>
        <button onClick={handleConvert} style={{ ...btn("sage"), position: "relative" }}>
          <GitBranch size={14} />
          {converting ? "Converting..." : convertSuccess ? "✓ Converted!" : "Convert to Template"}
        </button>
        <button onClick={handleSave} style={btn("pri")}>
          <Save size={14} /> {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left panel */}
        <div style={{
          width: 180, background: C.card, borderRight: `1px solid ${C.line}`,
          padding: 12, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, overflowY: "auto",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Shapes</div>
          {SHAPES.map(s => (
            <button key={s.type} onClick={() => setTool(s.type)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
              borderRadius: 8, border: `1.5px solid ${tool === s.type ? C.spotlight : C.line}`,
              background: tool === s.type ? "#FBE7E9" : C.card, cursor: "pointer",
              fontFamily: "'Work Sans',sans-serif", fontSize: 13, fontWeight: 500,
              color: tool === s.type ? C.spotlight : C.ink,
            }}>
              <ShapePreview type={s.type} color={s.color} bg={s.bg} />
              <div>
                <div>{s.label}</div>
                <div style={{ fontSize: 10, color: C.slateLight }}>Key: {s.shortcut}</div>
              </div>
            </button>
          ))}
          <div style={{ height: 1, background: C.line, margin: "8px 0" }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Tools</div>
          {[{ key: "select", label: "Select", shortcut: "S" }, { key: "connect", label: "Connect", shortcut: "A" }].map(t => (
            <button key={t.key} onClick={() => { setTool(t.key); setConnectSrc(null); }} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 10px", borderRadius: 8,
              border: `1.5px solid ${tool === t.key ? C.spotlight : C.line}`,
              background: tool === t.key ? "#FBE7E9" : C.card, cursor: "pointer",
              fontFamily: "'Work Sans',sans-serif", fontSize: 13, fontWeight: 500,
              color: tool === t.key ? C.spotlight : C.ink,
            }}>
              <span>{t.label}</span>
              <kbd style={{ fontSize: 10, background: C.paperDim, borderRadius: 4, padding: "1px 5px" }}>{t.shortcut}</kbd>
            </button>
          ))}
          <div style={{ height: 1, background: C.line, margin: "8px 0" }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Legend</div>
          <div style={{ fontSize: 11, color: C.slate, display: "flex", flexDirection: "column", gap: 4 }}>
            <div>🟢 Oval → Start/End</div>
            <div>⬜ Rect → Task step</div>
            <div>🔴 Diamond → Approval</div>
            <div>→ Arrow → Flow</div>
          </div>
          <div style={{ height: 1, background: C.line, margin: "8px 0" }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Shortcuts</div>
          {[["O","Start/End"],["R","Process"],["D","Decision"],["T","Text"],["S","Select"],["A","Connect"],["Del","Delete"],["Ctrl+Z","Undo"],["Ctrl+Y","Redo"]].map(([k,v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <kbd style={{ background: C.paperDim, borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>{k}</kbd>
              <span style={{ color: C.slate }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <svg ref={svgRef} style={{
            width: "100%", height: "100%",
            background: `radial-gradient(circle, #d0d0d0 1px, transparent 1px)`,
            backgroundSize: `${GRID * zoom}px ${GRID * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            cursor: tool === "select" ? "default" : tool === "connect" ? "crosshair" : "copy",
          }}
            onClick={onCanvasClick} onMouseDown={onSvgMouseDown}
            onMouseMove={onMouseMove} onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp} onWheel={onWheel}>
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {arrows.map(a => {
                const from = shapes.find(s => s.id === a.from);
                const to = shapes.find(s => s.id === a.to);
                if (!from || !to) return null;
                const fp = getPort(from, a.fromSide || "bottom");
                const tp = getPort(to, a.toSide || "top");
                const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2;
                const d = `M ${fp.x} ${fp.y} C ${fp.x} ${my}, ${tp.x} ${my}, ${tp.x} ${tp.y}`;
                const sel = selected?.type === "arrow" && selected.id === a.id;
                const col = sel ? C.spotlight : C.ink;
                const markId = `arr-${a.id}`;
                return (
                  <g key={a.id} onClick={(e) => { e.stopPropagation(); setSelected({ type: "arrow", id: a.id }); }}
                    onDoubleClick={(e) => onArrowDoubleClick(a.id, e)}
                    onContextMenu={(e) => onArrowRightClick(a.id, e)} style={{ cursor: "pointer" }}>
                    <defs>
                      <marker id={markId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 1 L 9 5 L 0 9 z" fill={col} />
                      </marker>
                    </defs>
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                    <path d={d} fill="none" stroke={col} strokeWidth={sel ? 2.5 : 1.8} markerEnd={`url(#${markId})`} />
                    {a.label && (
                      <g>
                        <rect x={mx-28} y={my-12} width={56} height={24} rx={6} fill={C.card} stroke={sel ? C.spotlight : C.line} strokeWidth={1} />
                        <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle"
                          style={{ fontFamily:"'Work Sans',sans-serif", fontSize:11, fontWeight:600, fill: sel ? C.spotlight : C.ink, pointerEvents:"none" }}>
                          {a.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              {dragArrow && (() => {
                const from = shapes.find(s => s.id === dragArrow.fromId);
                if (!from) return null;
                const fp = getPort(from, dragArrow.fromSide);
                return <line x1={fp.x} y1={fp.y} x2={dragArrow.curX} y2={dragArrow.curY} stroke={C.spotlight} strokeWidth={1.5} strokeDasharray="6 4" />;
              })()}
              {shapes.map(s => {
                const b = getBounds(s);
                const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
                const sel = selected?.type === "shape" && selected.id === s.id;
                const stroke = sel ? C.spotlight : (s.color || C.ink);
                const sw = sel ? 2.5 : 1.5;
                const filter = sel ? "drop-shadow(0 0 6px rgba(230,36,39,0.35))" : "none";
                const sp = {
                  fill: s.bg || C.card, stroke, strokeWidth: sw,
                  style: { cursor: "move", filter },
                  onMouseDown: (e) => onShapeMouseDown(s.id, e),
                  onDoubleClick: (e) => onShapeDoubleClick(s.id, e),
                  onContextMenu: (e) => onShapeRightClick(s.id, e),
                };
                return (
                  <g key={s.id}>
                    {s.type === "oval" && <ellipse cx={cx} cy={cy} rx={b.w/2} ry={b.h/2} {...sp} />}
                    {s.type === "rect" && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8} {...sp} />}
                    {s.type === "diamond" && <polygon points={`${cx},${b.y} ${b.x+b.w},${cy} ${cx},${b.y+b.h} ${b.x},${cy}`} {...sp} />}
                    {s.type !== "text" ? (
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                        style={{ fontFamily:"'Work Sans',sans-serif", fontSize:13, fontWeight:500, fill:C.ink, pointerEvents:"none", userSelect:"none" }}>
                        {s.label || s.type}
                      </text>
                    ) : (
                      <text x={b.x} y={b.y}
                        style={{ fontFamily:"'Work Sans',sans-serif", fontSize:14, fill:s.color||C.ink, pointerEvents:"none", userSelect:"none" }}>
                        {s.label || "Text"}
                      </text>
                    )}
                    {(sel || tool === "connect") && ["top","bottom","left","right"].map(side => {
                      const p = getPort(s, side);
                      return (
                        <circle key={side} cx={p.x} cy={p.y} r={6}
                          fill={connectSrc === s.id ? C.sage : C.spotlight}
                          stroke={C.card} strokeWidth={2}
                          style={{ cursor: "crosshair", pointerEvents: "all" }}
                          onMouseDown={(e) => { e.stopPropagation(); onPortDrag(s.id, side, e); }}
                        />
                      );
                    })}
                    {sel && tool === "select" && (() => {
                      const HS = 8;
                      const l=b.x, t=b.y, r=b.x+b.w, bot=b.y+b.h, mx2=cx, my2=cy;
                      return [
                        [l,t,"nw-resize","nw"],[mx2,t,"n-resize","n"],[r,t,"ne-resize","ne"],
                        [r,my2,"e-resize","e"],[r,bot,"se-resize","se"],[mx2,bot,"s-resize","s"],
                        [l,bot,"sw-resize","sw"],[l,my2,"w-resize","w"],
                      ].map(([hx,hy,cur,id]) => (
                        <rect key={id} x={hx-HS/2} y={hy-HS/2} width={HS} height={HS}
                          fill={C.card} stroke={C.spotlight} strokeWidth={1.5} rx={2}
                          style={{ cursor: cur, pointerEvents:"all" }}
                          onMouseDown={(e) => { e.stopPropagation(); onPortDrag(s.id, "resize-"+id, e); }}
                        />
                      ));
                    })()}
                  </g>
                );
              })}
            </g>
          </svg>
          {tool === "connect" && (
            <div style={{
              position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
              background: C.spotlight, color: "#fff", borderRadius: 8, padding: "6px 16px",
              fontFamily: "'Work Sans',sans-serif", fontSize: 13, fontWeight: 600, pointerEvents: "none",
            }}>
              {connectSrc ? "Now click the target shape" : "Click a shape to start connecting"}
            </div>
          )}
          {convertSuccess && (
            <div style={{
              position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
              background: C.sage, color: "#fff", borderRadius: 8, padding: "10px 20px",
              fontFamily: "'Work Sans',sans-serif", fontSize: 13, fontWeight: 600,
            }}>
              ✓ Template created! Find it in the Library under {flowchart.department}.
            </div>
          )}
        </div>

        {/* Right properties panel */}
        {(selectedShape || selectedArrow) && (
          <div style={{
            width: 200, background: C.card, borderLeft: `1px solid ${C.line}`,
            padding: 14, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {selectedShape ? "Shape" : "Arrow"}
            </div>
            {selectedShape && (
              <>
                <div>
                  <label style={lbl}>Label</label>
                  <input value={selectedShape.label || ""}
                    onChange={e => setShapes(prev => prev.map(s => s.id === selectedShape.id ? { ...s, label: e.target.value } : s))}
                    onBlur={() => pushHistory(shapes, arrows)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Color</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {COLORS.map(color => (
                      <div key={color} onClick={() => {
                        const ns = shapes.map(s => s.id === selectedShape.id ? { ...s, color } : s);
                        setShapes(ns); pushHistory(ns, arrows);
                      }} style={{
                        width: 22, height: 22, borderRadius: "50%", background: color, cursor: "pointer",
                        border: selectedShape.color === color ? `3px solid ${C.spotlight}` : "2px solid transparent",
                      }} />
                    ))}
                  </div>
                </div>
                <button onClick={deleteSelected} style={{ ...btn("danger"), marginTop: "auto" }}>
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}
            {selectedArrow && (
              <>
                <div>
                  <label style={lbl}>Label (Yes / No / Approved…)</label>
                  <input value={selectedArrow.label || ""}
                    onChange={e => setArrows(prev => prev.map(a => a.id === selectedArrow.id ? { ...a, label: e.target.value } : a))}
                    onBlur={() => pushHistory(shapes, arrows)} style={inp} />
                </div>
                <button onClick={deleteSelected} style={{ ...btn("danger"), marginTop: "auto" }}>
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {contextMenu && (
        <div style={{
          position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 200,
          background: C.card, border: `1px solid ${C.line}`, borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, minWidth: 160,
        }} onClick={e => e.stopPropagation()}>
          <button onClick={() => {
            const item = contextMenu.type === "shape"
              ? shapes.find(s => s.id === contextMenu.id)
              : arrows.find(a => a.id === contextMenu.id);
            setEditingLabel({ id: contextMenu.id, type: contextMenu.type, value: item?.label || "" });
            setContextMenu(null);
          }} style={menuItem}>✏️ Edit label</button>
          <button onClick={deleteSelected} style={{ ...menuItem, color: C.spotlight }}>🗑️ Delete</button>
        </div>
      )}

      {editingLabel && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
        }}>
          <div style={{ background: C.card, borderRadius: 12, padding: 20, width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Edit Label</div>
            <input autoFocus value={editingLabel.value}
              onChange={e => setEditingLabel(l => ({ ...l, value: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") commitLabel(); if (e.key === "Escape") setEditingLabel(null); }}
              style={{ ...inp, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditingLabel(null)} style={btn("sec")}>Cancel</button>
              <button onClick={commitLabel} style={btn("pri")}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FlowchartList({ department, onOpen, onBack }) {
  const [flowcharts, setFlowcharts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/flowcharts/${encodeURIComponent(department)}`, { headers: authHeaders() });
      setFlowcharts(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [department]);

  const createNew = async () => {
    const id = `fc-${Date.now()}`;
    const name = "Untitled Flowchart";
    await fetch(`${API_BASE}/api/flowcharts/${encodeURIComponent(department)}/${id}`, {
      method: "PUT", headers: authHeaders(),
      body: JSON.stringify({ name, data: { shapes: [], arrows: [] } }),
    });
    onOpen({ id, department, name, data: { shapes: [], arrows: [] } });
  };

  const deleteFlowchart = async (id) => {
    if (!window.confirm("Delete this flowchart?")) return;
    await fetch(`${API_BASE}/api/flowcharts/${encodeURIComponent(department)}/${id}`, {
      method: "DELETE", headers: authHeaders(),
    });
    load();
  };

  const openFlowchart = async (fc) => {
    const res = await fetch(`${API_BASE}/api/flowcharts/${encodeURIComponent(department)}/${fc.id}`, { headers: authHeaders() });
    const data = await res.json();
    onOpen({ ...data, data: typeof data.data === "string" ? JSON.parse(data.data) : data.data });
  };

  return (
    <div>
      <button onClick={onBack} style={{ ...btn("sec"), marginBottom: 20 }}><ArrowLeft size={14} /> Library</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 600, color: C.ink, margin: 0 }}>
            {department} — Workflow Builder
          </h1>
          <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 13, color: C.slate, margin: "4px 0 0" }}>
            Draw flowcharts and convert them to runnable templates.
          </p>
        </div>
        <button onClick={createNew} style={btn("pri")}><Plus size={14} /> New Flowchart</button>
      </div>
      {loading ? (
        <p style={{ fontFamily: "'Work Sans',sans-serif", color: C.slate }}>Loading...</p>
      ) : flowcharts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14 }}>
          <GitMerge size={28} color={C.spotlight} />
          <p style={{ fontFamily: "'Fraunces',serif", fontSize: 18, color: C.ink, margin: "12px 0 4px" }}>No flowcharts yet</p>
          <p style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 13, color: C.slate, margin: 0 }}>Create one to start mapping your workflow.</p>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
          {flowcharts.map((fc, i) => (
            <div key={fc.id} style={{
              display: "flex", alignItems: "center", padding: "14px 18px",
              borderBottom: i === flowcharts.length - 1 ? "none" : `1px solid ${C.line}`,
            }}>
              <GitMerge size={16} color={C.spotlight} style={{ marginRight: 12, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 14, fontWeight: 500, color: C.ink }}>{fc.name}</div>
                <div style={{ fontFamily: "'Work Sans',sans-serif", fontSize: 12, color: C.slate, marginTop: 2 }}>
                  Created {new Date(fc.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              </div>
              <button onClick={() => deleteFlowchart(fc.id)} style={{ ...btn("sec"), padding: "6px 8px", marginRight: 8 }}><Trash2 size={13} /></button>
              <button onClick={() => openFlowchart(fc)} style={btn("sec")}>Open <ChevronRight size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function btn(v) {
  const base = { display:"inline-flex", alignItems:"center", gap:6, border:"none", borderRadius:8, padding:"7px 12px", cursor:"pointer", fontFamily:"'Work Sans',sans-serif", fontSize:13, fontWeight:500 };
  if (v === "pri")   return { ...base, background: C.spotlight, color: "#fff" };
  if (v === "sage")  return { ...base, background: C.sage, color: "#fff" };
  if (v === "danger")return { ...base, background: "#FBE7E9", color: C.spotlightDeep };
  return { ...base, background: "transparent", color: C.ink, border: `1px solid ${C.line}` };
}
const lbl = { fontFamily:"'Work Sans',sans-serif", fontSize:12, fontWeight:600, color:C.slate, display:"block", marginBottom:4 };
const inp = { fontFamily:"'Work Sans',sans-serif", fontSize:13, color:C.ink, background:C.paper, border:`1px solid ${C.line}`, borderRadius:8, padding:"7px 10px", width:"100%", boxSizing:"border-box" };
const menuItem = { display:"block", width:"100%", textAlign:"left", background:"none", border:"none", cursor:"pointer", padding:"8px 10px", borderRadius:6, fontFamily:"'Work Sans',sans-serif", fontSize:13, color:C.ink };

export function WorkflowBuilder({ department, onBack }) {
  const [openFlowchart, setOpenFlowchart] = useState(null);
  return openFlowchart ? (
    <FlowchartCanvas
      flowchart={openFlowchart}
      onBack={() => setOpenFlowchart(null)}
      onSave={() => {}}
      onConvert={() => {}}
    />
  ) : (
    <FlowchartList department={department} onOpen={setOpenFlowchart} onBack={onBack} />
  );
}