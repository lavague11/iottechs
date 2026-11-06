"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

// Shared right-click / long-press context-menu primitive (project cards, stage steps, …).
// useContextMenu() gives trigger props + the open state; <ContextMenu> renders a viewport-clamped menu.
//
// Mobile: a 500ms long-press opens the menu. We suppress the browser's native menu, text selection, the
// iOS touch-callout and link preview, and cancel the press if the finger moves (so scrolling still works).
// A light haptic buzz fires when it opens (where supported).

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;

export function useContextMenu() {
  const [menu, setMenu] = useState(null);   // { x, y } | null
  const press = useRef(null);                // { timer, x, y, opened }
  const close = useCallback(() => setMenu(null), []);

  const openAt = useCallback((x, y) => {
    try { if (navigator?.vibrate) navigator.vibrate(8); } catch { /* no haptics */ }
    setMenu({ x, y });
  }, []);

  const onContextMenu = useCallback((e) => { e.preventDefault(); e.stopPropagation(); openAt(e.clientX, e.clientY); }, [openAt]);

  const clearPress = () => { if (press.current?.timer) clearTimeout(press.current.timer); press.current = null; };
  const onTouchStart = useCallback((e) => {
    if (e.touches?.length !== 1) return;
    const t = e.touches[0];
    const p = { x: t.clientX, y: t.clientY, opened: false, timer: null };
    p.timer = setTimeout(() => { p.opened = true; openAt(p.x, p.y); }, LONG_PRESS_MS);
    press.current = p;
  }, [openAt]);
  const onTouchMove = useCallback((e) => {
    const p = press.current; if (!p || p.opened) return;
    const t = e.touches?.[0]; if (!t) return;
    if (Math.abs(t.clientX - p.x) > MOVE_CANCEL_PX || Math.abs(t.clientY - p.y) > MOVE_CANCEL_PX) clearPress();
  }, []);
  const onTouchEnd = useCallback((e) => {
    const p = press.current;
    if (p?.opened) { e.preventDefault(); }   // we handled it as a long-press — swallow the trailing click
    clearPress();
  }, []);

  // Props spread onto the trigger element. The inline styles stop selection / iOS callout on the card.
  const triggerProps = {
    onContextMenu, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: clearPress,
    style: { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" },
  };
  return { open: !!menu, point: menu, openAt, close, triggerProps };
}

// Viewport-clamped menu rendered in a portal. `items`: array of
//   { type:"header"|"divider" } | { label, icon?, onClick, danger?, checked?, disabled?, sub? }
export function ContextMenu({ open, point, onClose, items = [], title = null }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("touchstart", onDown, true);
    window.addEventListener("scroll", () => onClose?.(), true);
    window.addEventListener("resize", () => onClose?.());
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("touchstart", onDown, true);
    };
  }, [open, onClose]);
  // Clamp inside the viewport once measured.
  useEffect(() => {
    if (!open || !point || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const pad = 8, vw = window.innerWidth, vh = window.innerHeight;
    setPos({
      left: Math.max(pad, Math.min(point.x, vw - r.width - pad)),
      top: Math.max(pad, Math.min(point.y, vh - r.height - pad)),
    });
  }, [open, point]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="ctx-menu" ref={ref} role="menu" style={{ left: pos.left, top: pos.top }} onContextMenu={(e) => e.preventDefault()}>
      <style>{CTX_CSS}</style>
      {title && <div className="ctx-title">{title}</div>}
      {items.filter(Boolean).map((it, i) => {
        if (it.type === "divider") return <div key={i} className="ctx-div" />;
        if (it.type === "header") return <div key={i} className="ctx-head">{it.label}</div>;
        return (
          <button key={i} type="button" role="menuitem" className={`ctx-item${it.danger ? " danger" : ""}${it.disabled ? " disabled" : ""}`}
            disabled={it.disabled}
            onClick={() => { if (it.disabled) return; onClose?.(); Promise.resolve().then(() => it.onClick?.()); }}>
            <span className="ctx-ic">{it.checked ? <CheckIcon /> : it.icon || null}</span>
            <span className="ctx-lbl">{it.label}</span>
            {it.sub && <span className="ctx-sub">{it.sub}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>;
}

const CTX_CSS = `
.ctx-menu{position:fixed;z-index:2147483600;min-width:214px;max-width:280px;background:#fff;border:1px solid var(--dv-line,#E4E4DF);
  border-radius:12px;padding:5px;box-shadow:0 16px 42px -12px rgba(16,20,24,.34),0 3px 10px -4px rgba(16,20,24,.18);
  font-family:system-ui,-apple-system,Segoe UI,sans-serif;animation:ctxin .12s ease;user-select:none;-webkit-user-select:none}
@keyframes ctxin{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
.ctx-title{padding:7px 11px 6px;font-size:.72rem;font-weight:700;color:var(--dv-ink,#101418);border-bottom:1px solid var(--dv-line-soft,#EDEDE9);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ctx-head{padding:7px 11px 3px;font-size:.62rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--dv-meta,#9AA0A6)}
.ctx-div{height:1px;background:var(--dv-line-soft,#EDEDE9);margin:4px 2px}
.ctx-item{display:flex;align-items:center;gap:9px;width:100%;box-sizing:border-box;padding:8px 10px;border:0;border-radius:8px;background:none;
  cursor:pointer;font:inherit;font-size:.86rem;color:var(--dv-ink,#101418);text-align:left;line-height:1.1}
.ctx-item:hover:not(.disabled){background:var(--dv-paper,#F4F4F2)}
.ctx-item.danger{color:#c0392b}
.ctx-item.danger:hover:not(.disabled){background:#fbe9e6}
.ctx-item.disabled{opacity:.42;cursor:default}
.ctx-ic{flex:0 0 18px;display:inline-flex;align-items:center;justify-content:center;color:var(--dv-meta,#787D84)}
.ctx-item.danger .ctx-ic{color:#c0392b}
.ctx-lbl{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ctx-sub{flex:0 0 auto;font-size:.72rem;color:var(--dv-meta,#9AA0A6);font-weight:600}
`;
