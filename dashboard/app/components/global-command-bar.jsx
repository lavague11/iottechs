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

  const interpret = (text, opts) => aiGlobalInterpretAction(text, { currentAccessId, recent: opts?.recent });
  const onNavigate = (res) => {
    setOpen(false);
    // In-project deep links (?stage=/?open=) need a hard nav so the deck re-reads them; everything else is a push.
    if (typeof window !== "undefined" && res.href.startsWith(window.location.pathname)) window.location.assign(res.href);
    else router.push(res.href);
  };
  const noWrite = async () => ({ error: "Open the project to make that change." });

  return (
    <>
      <button type="button" className="gcb-launch" title="Command center (Ctrl/⌘ K)" aria-label="Open the command center" onClick={() => setOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>
        <span className="gcb-kbd">⌘K</span>
      </button>
      {open && createPortal(
        <div className="gcb-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="gcb-modal" role="dialog" aria-modal="true" aria-label="Command center" ref={modalRef}>
            <div className="gcb-head"><span className="gcb-title">Command center</span><button type="button" className="gcb-x" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
            <CommandSurface enabled placeholder="Where to? “open Crazy Cars”, “go to Tickets”, “show receivables”, “inventory”…"
              interpret={interpret} onNavigate={onNavigate} onApply={noWrite} onPick={noWrite} />
            <div className="gcb-hint">Navigate anywhere. To edit a proposal, open the project and use the bar on its proposal.</div>
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
.gcb-launch{position:fixed;left:16px;bottom:16px;z-index:40;display:inline-flex;align-items:center;gap:7px;background:#10204a;color:#fff;border:0;border-radius:999px;padding:9px 14px;font-size:12.5px;cursor:pointer;box-shadow:0 6px 20px rgba(16,32,74,.28)}
.gcb-launch:hover{background:#17306b}
.gcb-launch svg{color:#C9A96E}
.gcb-kbd{font-size:10.5px;background:rgba(255,255,255,.16);border-radius:5px;padding:1px 5px;letter-spacing:.5px}
@media (max-width:640px){.gcb-launch .gcb-kbd{display:none}}
`;
const CSS = `
.gcb-overlay{position:fixed;inset:0;z-index:60;background:rgba(14,18,30,.42);display:flex;align-items:flex-start;justify-content:center;padding:12vh 16px 16px}
.gcb-modal{width:100%;max-width:560px;background:var(--dv-bg,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;box-shadow:0 24px 60px rgba(14,18,30,.3);padding:12px 14px 14px}
.gcb-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px}
.gcb-title{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#9aa0ab;font-weight:600}
.gcb-x{border:0;background:transparent;color:#6a7085;font-size:18px;line-height:1;cursor:pointer;padding:2px 6px}
.gcb-hint{font-size:11.5px;color:#9aa0ab;padding:6px 2px 0}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .gcb-modal{background:#14171f}}
`;
