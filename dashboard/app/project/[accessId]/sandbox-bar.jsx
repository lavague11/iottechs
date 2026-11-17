"use client";
import { useState } from "react";
import { SANDBOX_ROLES, SANDBOX_ROLE_LABEL } from "../../../lib/sandbox";
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
    <div className="sbx" role="region" aria-label="Demo">
      <span className="sbx-tag">Demo</span>
      <span className="sbx-src">copy of {sourceAccessId}</span>

      <span className="sbx-roles" role="group" aria-label="View as">
        <button type="button" className={as === "admin" ? "on" : ""} aria-pressed={as === "admin"}
                disabled={busy} onClick={() => go("admin")}>Admin</button>
        {SANDBOX_ROLES.map((r) => (
          <button key={r} className={as === r ? "on" : ""} aria-pressed={as === r}
                  disabled={busy} onClick={() => go(r)}>{SANDBOX_ROLE_LABEL[r]}</button>
        ))}
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

const SBX_CSS = `
.sbx{position:sticky;top:0;z-index:90;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;
  padding:8px 14px;background:#2a2412;border-bottom:1px solid #5a4c22;color:#e7cf96;font-size:12.5px}
.sbx-tag{font-weight:800;letter-spacing:.8px;text-transform:uppercase;font-size:11px;
  background:#C9A96E;color:#1b1710;border-radius:999px;padding:3px 9px}
.sbx-src{opacity:.75}
.sbx-roles{display:inline-flex;flex-wrap:wrap;gap:4px;margin-left:4px}
.sbx-roles button{border:1px solid transparent;background:none;color:#e7cf96;font:600 12.5px/1 inherit;
  cursor:pointer;padding:5px 9px;border-radius:999px}
.sbx-roles button:hover:not(:disabled){border-color:#5a4c22}
.sbx-roles button.on{background:#C9A96E;color:#1b1710;font-weight:800}
.sbx-acts{display:inline-flex;flex-wrap:wrap;align-items:center;gap:12px;margin-left:auto}
.sbx-acts button,.sbx-exit{border:0;background:none;color:#e7cf96;font:600 12.5px/1 inherit;cursor:pointer;padding:0;text-decoration:none}
.sbx-acts button:hover,.sbx-exit:hover{text-decoration:underline}
.sbx-acts .sbx-danger{color:#eba0a0}
.sbx-ask{opacity:.85}
.sbx-err{color:#eba0a0}
.sbx button:disabled{opacity:.5;cursor:default}
@media (max-width:560px){.sbx-src{display:none}.sbx-acts{margin-left:0;width:100%}}
`;
