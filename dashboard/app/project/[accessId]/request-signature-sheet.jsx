"use client";
import { useState } from "react";
import { requestSignatureEmailAction, overrideSignatureAction } from "./proposal-actions";

// The staff "Request Signature" share sheet — Copy Link · Share · Request via Email · (admin/manager)
// Override. Extracted from the proposal builder so it can open on its OWN, directly from the project hub,
// instead of having to open the whole proposal page first (bug #84). Self-contained: its own busy/toast
// state and styles. `onClose` dismisses it; `onDone(kind)` lets a host refresh after email/override.
export default function RequestSignatureSheet({ accessId, optionId = "", role = "", onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(null);
  const canOverride = ["admin", "manager"].includes(role);
  const show = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const signingUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/project/${accessId}?open=proposal&sign=${optionId ?? ""}`;

  async function copyLink() {
    try { await navigator.clipboard.writeText(signingUrl); show("Signing link copied"); }
    catch { try { window.prompt("Copy this signing link:", signingUrl); } catch { /* noop */ } }
    onClose?.();
  }
  async function shareLink() {
    try { if (navigator.share) { await navigator.share({ title: "Review & sign your IOT TECHS proposal", url: signingUrl }); return; } } catch { /* cancelled → copy */ }
    try { await navigator.clipboard.writeText(signingUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this signing link:", signingUrl); }
  }
  async function email() {
    if (busy) return;
    setBusy(true);
    const r = await requestSignatureEmailAction(accessId, optionId).catch(() => null);
    setBusy(false);
    onClose?.();
    if (r?.error) { show(r.error); return; }
    show(r?.sent ? "Signature request emailed" : (r?.note || "Email isn’t configured yet"));
    onDone?.("email");
  }
  async function override() {
    if (busy) return;
    if (!window.confirm("Override the signature? The project will progress and can be scheduled now. The customer's signature is still required.")) return;
    setBusy(true);
    const r = await overrideSignatureAction(accessId).catch(() => null);
    setBusy(false);
    onClose?.();
    if (r?.error) { show(r.error); return; }
    onDone?.("override");
    try { const u = new URL(window.location.href); ["view", "reqsign", "sign"].forEach((k) => u.searchParams.delete(k)); window.location.assign(u.toString()); } catch { window.location.reload(); }
  }

  return (
    <div className="prop-sig-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="prop-sig-sheet" role="dialog" aria-modal="true" aria-label="Request signature">
        <div className="prop-sig-head">
          <span className="prop-sig-title">Request Signature</span>
          <button type="button" className="prop-sig-x" onClick={() => onClose?.()} aria-label="Close">×</button>
        </div>
        <button type="button" className="prop-sig-act" onClick={copyLink}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>Copy Link</span>
        </button>
        <button type="button" className="prop-sig-act" onClick={shareLink}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>
          <span>{copied ? "Link copied" : "Share Signing Link"}</span>
        </button>
        <button type="button" className="prop-sig-act" disabled={busy} onClick={email}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
          <span>{busy ? "Sending…" : "Request via Email"}</span>
        </button>
        {canOverride && (
          <button type="button" className="prop-sig-act prop-sig-override" disabled={busy} onClick={override}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><path d="M12 3a9 9 0 1 0 9 9"/></svg>
            <span className="prop-sig-override-wrap"><span>{busy ? "Working…" : "Override signature"}</span><small>Progress &amp; schedule now — signature still required.</small></span>
          </button>
        )}
        {toast && <div className="prop-sig-note" role="status">{toast}</div>}
      </div>
      <style>{SIG_SHEET_CSS}</style>
    </div>
  );
}

const SIG_SHEET_CSS = `
.prop-sig-overlay{position:fixed;inset:0;z-index:70;background:rgba(14,18,30,.46);display:flex;align-items:flex-end;justify-content:center;padding:0}
.prop-sig-sheet{width:100%;max-width:460px;background:var(--dv-bg,#fff);border:1px solid var(--dv-line,#E4E4DF);border-bottom:0;border-radius:16px 16px 0 0;box-shadow:0 -12px 40px rgba(14,18,30,.3);padding:14px 16px calc(16px + env(safe-area-inset-bottom))}
@media (min-width:560px){.prop-sig-overlay{align-items:center}.prop-sig-sheet{border-radius:16px;border-bottom:1px solid var(--dv-line,#E4E4DF)}}
.prop-sig-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.prop-sig-title{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:var(--dv-meta,#787D84);font-weight:700}
.prop-sig-x{border:0;background:transparent;color:var(--dv-meta,#787D84);font-size:20px;line-height:1;cursor:pointer;padding:2px 6px}
.prop-sig-act{display:flex;align-items:center;gap:12px;width:100%;margin:8px 0 0;padding:14px 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.9rem;font-weight:600;font-family:inherit;cursor:pointer;text-align:left}
.prop-sig-act:hover{border-color:#C9A96E}
.prop-sig-act:disabled{opacity:.5;cursor:default}
.prop-sig-act svg{color:#C9A96E;flex-shrink:0}
.prop-sig-note{font-size:11.5px;color:var(--dv-meta,#787D84);padding:10px 2px 2px}
.prop-sig-override{margin-top:12px;border-top:1px solid var(--dv-line,#E4E4DF);border-radius:12px}
.prop-sig-override-wrap{display:flex;flex-direction:column;gap:2px}
.prop-sig-override-wrap small{font-weight:500;font-size:11.5px;color:var(--dv-meta,#787D84)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .prop-sig-sheet{background:#14171f}}
`;
