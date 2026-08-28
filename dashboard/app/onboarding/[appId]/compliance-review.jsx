"use client";

import { useState } from "react";
import { COMPLIANCE_ITEMS, COMPLIANCE_CHECKS, complianceProgress } from "../../../lib/hiring";
import { verifyComplianceAction, setComplianceCheckAction, clearForTrainingAction } from "../../compliance/[appId]/actions";

const CHECK_STATES = [["not_started", "Not started"], ["pending", "Pending"], ["clear", "Clear"], ["flag", "Flagged"]];

export default function ComplianceReview({ appId, status, compliance }) {
  const [items, setItems] = useState(compliance?.items || {});
  const [checks, setChecks] = useState(compliance?.checks || {});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const prog = complianceProgress({ items });
  const checksClear = COMPLIANCE_CHECKS.every((c) => checks[c.key]?.status === "clear");

  async function verify(key, ok) {
    let reason = "";
    if (!ok) { reason = prompt("What needs fixing? (sent back to the candidate)") || ""; if (!reason.trim()) return; }
    setBusy(key);
    const r = await verifyComplianceAction(appId, key, ok, reason);
    if (r?.ok) setItems((p) => ({ ...p, [key]: { ...(p[key] || {}), status: ok ? "verified" : "rejected", reject_reason: ok ? null : reason } }));
    setBusy("");
  }
  async function setCheck(key, cs) {
    setBusy(key);
    const r = await setComplianceCheckAction(appId, key, cs, checks[key]?.note || "");
    if (r?.ok) setChecks((p) => ({ ...p, [key]: { ...(p[key] || {}), status: cs } }));
    setBusy("");
  }
  async function clear() {
    setBusy("clear"); setMsg("");
    const r = await clearForTrainingAction(appId);
    if (r?.ok) location.reload(); else setMsg(r?.error || "Could not clear.");
    setBusy("");
  }

  return (
    <div className="cr">
      <div className="cr-h"><h3>Compliance</h3><span className="cr-prog">{prog.verified}/{prog.total} verified</span></div>

      <div className="cr-items">
        {COMPLIANCE_ITEMS.map((item) => {
          const s = items[item.key] || {}; const st = s.status || "not_started";
          return (
            <div className={`cr-item st-${st}`} key={item.key}>
              <div className="cr-item-l">
                <span className="cr-item-name">{item.label}</span>
                <Preview item={item} s={s} />
              </div>
              <div className="cr-item-r">
                <span className={`cr-pill st-${st}`}>{st.replace("_", " ")}</span>
                {["submitted", "rejected"].includes(st) && <>
                  <button className="cr-v ok" disabled={busy === item.key} onClick={() => verify(item.key, true)}>Verify</button>
                  <button className="cr-v no" disabled={busy === item.key} onClick={() => verify(item.key, false)}>Reject</button>
                </>}
                {st === "verified" && <button className="cr-v no ghost" disabled={busy === item.key} onClick={() => verify(item.key, false)}>Undo</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="cr-checks">
        <div className="cr-sub">Office checks</div>
        {COMPLIANCE_CHECKS.map((c) => {
          const cs = checks[c.key]?.status || "not_started";
          return (
            <div className="cr-check" key={c.key}>
              <span>{c.label}</span>
              <div className="cr-seg">
                {CHECK_STATES.map(([k, l]) => <button key={k} className={`${k} ${cs === k ? "on" : ""}`} disabled={busy === c.key} onClick={() => setCheck(c.key, k)}>{l}</button>)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="cr-clear">
        <button className="cr-clear-b" disabled={busy === "clear" || !prog.allVerified || !checksClear || status === "cleared"} onClick={clear}>
          {status === "cleared" ? "✓ Cleared for Training" : "Clear for Training"}
        </button>
        {(!prog.allVerified || !checksClear) && status !== "cleared" && <span className="cr-clear-n">Verify every document and clear both office checks first.</span>}
        {msg && <span className="cr-clear-n err">{msg}</span>}
      </div>
      <style>{CSS}</style>
    </div>
  );
}

function Preview({ item, s }) {
  if (s.status === "not_started" || !s.status) return null;
  if (item.type === "form" && s.data) return <span className="cr-prev">{Object.values(s.data).filter(Boolean).join(" · ")}</span>;
  if (item.type === "sign") return <span className="cr-prev">Signed {s.signed_name}{s.signed_at ? ` · ${new Date(s.signed_at).toLocaleDateString()}` : ""}</span>;
  if (item.type === "w9") return <span className="cr-prev">{s.data?.legal_name || ""} · {s.data?.tin_type === "ein" ? "EIN" : "SSN"} •••{s.tin_last4 || "????"}</span>;
  if (item.type === "deposit") return <span className="cr-prev">{s.data?.bank_name || ""} · {s.data?.account_type} •••{s.account_last4 || "????"}</span>;
  if (item.type === "upload") return <span className="cr-prev cr-thumbs">{(s.refs || []).map((r) => <a key={r.id} href={r.url} target="_blank" rel="noreferrer"><img src={r.url} alt={r.part} /></a>)}{s.expires_at && <em>exp {s.expires_at}</em>}</span>;
  return null;
}

const CSS = `
.cr{--gold-deep:#A8842F;--green:#2E7D5B;--red:#C4553D;--amber:#B0801F;--line:#E4E4DF;--muted:#787D84;--ink:#101418;--paper:#F4F4F2;
  border:1px solid var(--line);border-radius:14px;background:#fff;padding:16px 18px;font-family:var(--font-sans,'Instrument Sans',sans-serif);margin-top:14px}
.cr-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.cr-h h3{margin:0;font-size:1.05rem;font-weight:800;color:var(--ink)}
.cr-prog{font-size:.8rem;color:var(--muted);font-variant-numeric:tabular-nums}
.cr-items{display:flex;flex-direction:column;gap:6px}
.cr-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:var(--paper)}
.cr-item.st-verified{border-color:#CBE0D3;background:#F1F7F3}
.cr-item.st-rejected{border-color:#E7C6BC}
.cr-item-l{min-width:0}
.cr-item-name{display:block;font-weight:600;font-size:.9rem;color:var(--ink)}
.cr-prev{font-size:.78rem;color:var(--muted);display:block;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}
.cr-thumbs{display:flex;gap:5px;align-items:center;white-space:normal}
.cr-thumbs img{width:34px;height:26px;object-fit:cover;border-radius:5px;border:1px solid var(--line)}
.cr-thumbs em{font-style:normal;color:var(--muted)}
.cr-item-r{display:flex;align-items:center;gap:6px;flex:none}
.cr-pill{font-family:var(--font-mono,ui-monospace);font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.03em;padding:3px 8px;border-radius:999px}
.cr-pill.st-not_started{color:var(--muted);background:#EEEEEA}.cr-pill.st-submitted{color:var(--gold-deep);background:#F3ECDD}
.cr-pill.st-verified{color:var(--green);background:#E6F0EA}.cr-pill.st-rejected{color:var(--red);background:#F6E7E2}
.cr-v{border:none;border-radius:7px;padding:5px 11px;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer}
.cr-v.ok{background:var(--green);color:#fff}.cr-v.no{background:#fff;color:var(--red);border:1px solid #E7C6BC}
.cr-v.ghost{color:var(--muted);border-color:var(--line)}
.cr-v:disabled{opacity:.5}
.cr-checks{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
.cr-sub{font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.cr-check{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;font-size:.88rem;color:var(--ink)}
.cr-seg{display:inline-flex;border:1px solid var(--line);border-radius:7px;overflow:hidden}
.cr-seg button{border:none;background:#fff;padding:5px 10px;font:inherit;font-size:.72rem;font-weight:600;color:var(--muted);cursor:pointer;border-left:1px solid var(--line)}
.cr-seg button:first-child{border-left:none}
.cr-seg button.clear.on{background:var(--green);color:#fff}.cr-seg button.pending.on{background:#F6EEDC;color:var(--amber)}
.cr-seg button.flag.on{background:#F6E7E2;color:var(--red)}.cr-seg button.not_started.on{background:#EEEEEA;color:var(--ink)}
.cr-clear{margin-top:14px;display:flex;align-items:center;gap:12px}
.cr-clear-b{background:var(--green);color:#fff;border:none;border-radius:9px;padding:11px 20px;font:inherit;font-weight:700;font-size:.9rem;cursor:pointer}
.cr-clear-b:disabled{opacity:.45;cursor:not-allowed}
.cr-clear-n{font-size:.8rem;color:var(--muted)}.cr-clear-n.err{color:var(--red)}
`;
