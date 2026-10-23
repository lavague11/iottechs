"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import CommandSurface from "../project/[accessId]/command-surface";
import { aiStatusAction, aiGlobalInterpretAction } from "../project/[accessId]/ai-actions";

// The app-wide AI command center. Mounted in the staff shell(s), it opens on ⌘K / Ctrl-K (or the launcher)
// anywhere, reuses the SAME CommandSurface (text + the three voice modes) and the SAME authorization, and
// drives NAVIGATION: open a customer/project, jump to an app area, or — when a project is in context — to
// one of its sections. It never writes data; a proposal-edit phrasing is pointed back to the project's bar.
// Renders nothing unless AI_COMMANDS is on and the caller is staff (aiStatusAction decides).
export default function GlobalCommandBar({ currentAccessId = null }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => { let live = true; aiStatusAction().then((s) => live && setEnabled(!!s?.enabled)).catch(() => {}); return () => { live = false; }; }, []);
  // A conversation that navigated here (persistConvo) left a fresh hand-off — reopen the assistant so it can
  // resume listening. We only PEEK; CommandSurface consumes the stash and restores the thread.
  useEffect(() => {
    if (!enabled) return;
    try { const raw = sessionStorage.getItem("iot_ai_convo"); if (!raw) return; const d = JSON.parse(raw); if (d && d.mode === "chat" && Date.now() - (d.ts || 0) < 60000) setOpen(true); } catch {}
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
  useEffect(() => { if (open) setTimeout(() => modalRef.current?.querySelector(".aicb-in")?.focus(), 30); }, [open]);
  if (!enabled) return null;

  const interpret = (text, opts) => aiGlobalInterpretAction(text, { currentAccessId, recent: opts?.recent, memory: opts?.memory });
  const onNavigate = (res) => {
    setOpen(false);
    // In-project deep links (?stage=/?open=) need a hard nav so the deck re-reads them; everything else is a push.
    if (typeof window !== "undefined" && res.href.startsWith(window.location.pathname)) window.location.assign(res.href);
    else router.push(res.href);
  };
  const noWrite = async () => ({ error: "Open the project to make that change." });

  return (
    <>
      <button type="button" className="gcb-launch" title="Assistant (Ctrl/⌘ K)" aria-label="Open the assistant" onClick={() => setOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>
        <span className="gcb-lbl">Assistant</span>
        <span className="gcb-kbd">⌘K</span>
      </button>
      {open && createPortal(
        <div className="gcb-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="gcb-modal" role="dialog" aria-modal="true" aria-label="Assistant" ref={modalRef}>
            <div className="gcb-head">
              <span className="gcb-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>Assistant</span>
              <button type="button" className="gcb-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>
            <CommandSurface enabled placeholder="Ask anything…"
              interpret={interpret} onNavigate={onNavigate} onApply={noWrite} onPick={noWrite} />
          </div>
          <style>{CSS}</style>
        </div>,
        document.body
      )}
      <style>{LAUNCH_CSS}</style>
    </>
  );
}

const LAUNCH_CSS = `
.gcb-launch{position:fixed;left:16px;bottom:16px;z-index:40;display:inline-flex;align-items:center;gap:7px;background:var(--dv-bg,#fff);color:var(--dv-ink,#10204a);border:1px solid var(--dv-line,#E4E4DF);border-radius:999px;padding:8px 13px;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(16,32,74,.14);transition:transform .14s,box-shadow .14s,border-color .14s}
.gcb-launch:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(16,32,74,.2);border-color:#C9A96E}
.gcb-launch svg{color:#C9A96E}
.gcb-kbd{font-size:10px;color:#9aa0ab;border:1px solid var(--dv-line,#E4E4DF);border-radius:5px;padding:1px 5px;letter-spacing:.5px}
@media (max-width:640px){.gcb-launch{padding:10px}.gcb-launch .gcb-lbl,.gcb-launch .gcb-kbd{display:none}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .gcb-launch{background:#14171f;color:#e7e9ee}}
`;
const CSS = `
.gcb-overlay{position:fixed;inset:0;z-index:60;background:rgba(14,18,30,.4);display:flex;align-items:flex-start;justify-content:center;padding:11vh 16px 16px;backdrop-filter:saturate(1.1) blur(1px)}
.gcb-modal{width:100%;max-width:540px;background:var(--dv-bg,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:16px;box-shadow:0 24px 64px rgba(14,18,30,.32);padding:11px 14px 14px}
.gcb-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.gcb-title{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;letter-spacing:.5px;text-transform:uppercase;color:#9aa0ab;font-weight:600}
.gcb-title svg{color:#C9A96E}
.gcb-x{border:0;background:transparent;color:#9aa0ab;font-size:19px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px}
.gcb-x:hover{background:var(--dv-paper,#F1F1EE);color:var(--dv-ink,#1b1f2a)}
@media (max-width:560px){
  .gcb-overlay{align-items:flex-end;padding:0}
  .gcb-modal{max-width:none;border-radius:18px 18px 0 0;border-bottom:0;padding:12px 14px calc(14px + env(safe-area-inset-bottom))}
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .gcb-modal{background:#14171f}}
`;
