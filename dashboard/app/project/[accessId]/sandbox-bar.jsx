"use client";
import { useState, useEffect, useRef } from "react";
import { SANDBOX_ROLES, SANDBOX_ROLE_LABEL } from "../../../lib/sandbox";
import { roleColor } from "../../../lib/roles";
import { discardSandboxAction, resetSandboxAction } from "./actions";

// The bar that sits above a sandbox ("Demo") project. Two jobs: make it impossible to mistake a demo for
// the live job, and let an admin step between roles while they walk it.
//
// Switching role is a NAVIGATION (?as=<role>), not client state — the server resolves the view, so the
// page that renders is genuinely that role's page, built by the same loader and stripped by the same
// server-side sanitizers. A client-side toggle would only be able to fake it.
//
// Admin-only by construction: the host renders this only when the viewer is an admin on a sandbox row.
export default function SandboxBar({ sourceAccessId, as = "admin", accessId }) {
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [err, setErr] = useState("");
  const barRef = useRef(null);
  const active = roleColor(as);   // tints the bar's underline, so the whole strip states the role

  // Publish the bar's height as --sbx-h so the FIXED tool overlays (.cpv-ovl, inset:0) can start below
  // it instead of underneath it. Without this the bar covers an overlay's own title row and × button,
  // which is unreachable — there is no other way out of a tool. Measured rather than hard-coded because
  // the bar wraps to two lines on a narrow window.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--sbx-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    window.addEventListener("resize", apply);
    return () => { ro?.disconnect(); window.removeEventListener("resize", apply); root.style.removeProperty("--sbx-h"); };
  }, []);

  const go = (role) => {
    const u = new URL(window.location.href);
    if (role === "admin") u.searchParams.delete("as"); else u.searchParams.set("as", role);
    // Role-scoped view params from the previous role would be meaningless in the next one.
    ["preview", "pt", "view", "open", "sign"].forEach((k) => u.searchParams.delete(k));
    window.location.assign(u.toString());
  };

  async function reset() {
    if (busy) return;
    setBusy(true); setErr("");
    const r = await resetSandboxAction(accessId).catch(() => null);
    if (r?.ok) { window.location.assign(`/project/${r.accessId}`); return; }
    setBusy(false);
    setErr(r?.error || "Could not reset.");
    if (r?.sourceAccessId) window.location.assign(`/project/${r.sourceAccessId}`);
  }

  async function discard() {
    if (busy) return;
    setBusy(true); setErr("");
    const r = await discardSandboxAction(accessId).catch(() => null);
    if (r?.ok) { window.location.assign(`/project/${r.sourceAccessId || sourceAccessId}`); return; }
    setBusy(false); setConfirmDiscard(false);
    setErr(r?.error || "Could not discard.");
  }

  return (
    <div className="sbx" ref={barRef} role="region" aria-label="Demo"
         style={{ "--sbx-role": active.bg, "--sbx-role-fg": active.fg }}>
      <span className="sbx-tag">Demo</span>
      <span className="sbx-src">copy of {sourceAccessId}</span>

      <span className="sbx-roles" role="group" aria-label="View as">
        {["admin", ...SANDBOX_ROLES].map((r) => {
          const on = as === r;
          // Each pill carries its OWN role colour when active, from the same map the role pill and the
          // progress tint read — so green always means field, blue always means customer.
          const c = roleColor(r);
          return (
            <button key={r} type="button" className={on ? "on" : ""} aria-pressed={on} disabled={busy}
                    style={on ? { background: c.bg, color: c.fg } : undefined}
                    onClick={() => go(r)}>{r === "admin" ? "Admin" : SANDBOX_ROLE_LABEL[r]}</button>
          );
        })}
      </span>

      <span className="sbx-acts">
        {err && <span className="sbx-err" role="alert">{err}</span>}
        <button type="button" disabled={busy} onClick={reset}>Reset</button>
        {confirmDiscard ? (
          <>
            <span className="sbx-ask">Delete this demo?</span>
            <button type="button" className="sbx-danger" disabled={busy} onClick={discard}>Delete</button>
            <button type="button" disabled={busy} onClick={() => setConfirmDiscard(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="sbx-danger" disabled={busy} onClick={() => setConfirmDiscard(true)}>Discard</button>
        )}
        <a className="sbx-exit" href={`/project/${sourceAccessId}`} aria-label="Exit to the real project">Exit</a>
      </span>
      <style>{SBX_CSS}</style>
    </div>
  );
}

/* A quiet light-grey utility strip, not a second brand bar: the page below is the thing being demoed,
   so the bar states the role and gets out of the way. The only colour is the ACTIVE role's — its pill
   and the 3px underline — which is what makes "whose view is this" readable at a glance.
   font-family is set EXPLICITLY: this strip renders outside the portal's token scope, so `inherit`
   fell through to the browser's default serif and looked unlike every other surface in the app. */
const SBX_CSS = `
.sbx{position:sticky;top:0;z-index:90;display:flex;flex-wrap:wrap;align-items:center;gap:7px 14px;
  padding:7px 14px;background:var(--dv-raise,#F2F2F0);
  border-bottom:1px solid var(--dv-line,#E4E4DF);box-shadow:inset 0 -3px 0 var(--sbx-role,#C9A96E);
  color:var(--dv-ink,#101418);
  font-family:var(--font-sans),"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:12.5px;line-height:1.25;-webkit-font-smoothing:antialiased}
.sbx-tag{font-weight:700;letter-spacing:.09em;text-transform:uppercase;font-size:10px;
  background:var(--dv-ink,#101418);color:var(--dv-raise,#F2F2F0);border-radius:4px;padding:3px 7px}
.sbx-src{color:var(--dv-meta,#787D84);font-variant-numeric:tabular-nums}
.sbx-roles{display:inline-flex;flex-wrap:wrap;gap:3px;margin-left:2px}
.sbx-roles button{border:0;background:none;color:var(--dv-meta,#787D84);font:600 12.5px/1.25 inherit;
  cursor:pointer;padding:5px 10px;border-radius:999px;transition:background .12s,color .12s}
.sbx-roles button:hover:not(:disabled):not(.on){background:rgba(16,20,24,.06);color:var(--dv-ink,#101418)}
.sbx-roles button.on{font-weight:700}
.sbx-acts{display:inline-flex;flex-wrap:wrap;align-items:center;gap:14px;margin-left:auto}
.sbx-acts button,.sbx-exit{border:0;background:none;color:var(--dv-meta,#787D84);font:600 12.5px/1.25 inherit;
  cursor:pointer;padding:0;text-decoration:none}
.sbx-acts button:hover,.sbx-exit:hover{color:var(--dv-ink,#101418)}
.sbx-acts .sbx-danger{color:#9d3b3b}
.sbx-acts .sbx-danger:hover{color:#7d2b2b}
.sbx-ask{color:var(--dv-ink,#101418);font-weight:600}
.sbx-err{color:#9d3b3b}
.sbx button:disabled{opacity:.45;cursor:default}
@media (max-width:560px){.sbx-src{display:none}.sbx-acts{margin-left:0;width:100%}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .sbx{background:#171a21;border-bottom-color:#2b303a;color:#e8eaee}
  :root:not([data-theme="light"]) .sbx-tag{background:#e8eaee;color:#171a21}
  :root:not([data-theme="light"]) .sbx-roles button:hover:not(:disabled):not(.on){background:rgba(255,255,255,.08);color:#e8eaee}
  :root:not([data-theme="light"]) .sbx-acts button:hover,:root:not([data-theme="light"]) .sbx-exit:hover{color:#e8eaee}
  :root:not([data-theme="light"]) .sbx-acts .sbx-danger{color:#e49a9a}}
`;
