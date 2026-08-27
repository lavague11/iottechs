"use client";

import { useState } from "react";
import { Wordmark } from "../../components/brand";
import { COMPLIANCE_ITEMS } from "../../../lib/hiring";
import { saveComplianceFormAction, signComplianceAction, saveW9Action, saveDepositAction, recordComplianceUploadAction } from "./actions";

const STATUS = {
  not_started: ["To do", "s-todo"], submitted: ["Submitted", "s-sub"], verified: ["Verified", "s-ok"], rejected: ["Needs redo", "s-bad"],
};
const GROUPS = [...new Set(COMPLIANCE_ITEMS.map((i) => i.group))];

async function uploadFile(appId, key, part, file) {
  const fd = new FormData();
  fd.append("file", file); fd.append("project", appId); fd.append("kind", `compliance:${key}:${part || ""}`);
  const r = await fetch("/api/media", { method: "POST", body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "upload failed");
  return { part: part || "", id: j.id, url: j.url };
}

export default function ComplianceClient({ appId, firstName, status, compliance, staff }) {
  const [items, setItems] = useState(compliance?.items || {});
  const done = COMPLIANCE_ITEMS.filter((i) => ["submitted", "verified"].includes(items[i.key]?.status)).length;
  const total = COMPLIANCE_ITEMS.length;
  const allIn = done === total;
  const setSaved = (key, patch) => setItems((p) => ({ ...p, [key]: { ...(p[key] || {}), ...patch } }));

  return (
    <div className="cx">
      <header className="cx-top">
        <a href="/go" aria-label="IOT TECHS home" className="cx-brand"><Wordmark height={22} /></a>
        <a href={`/application/${appId}`} className="cx-exit">My application</a>
      </header>
      <main className="cx-wrap">
        <div className="cx-hero">
          <div className="cx-tag">You're hired{firstName ? `, ${firstName}` : ""} — complete your requirements</div>
          <h1>A few things before your first job.</h1>
          <p>Upload, fill in, and sign the items below. Everything's encrypted and only our office sees it. You can do them in any order — your progress saves as you go.</p>
          {staff && <p className="cx-staff">Staff preview of the candidate's requirements portal.</p>}
        </div>

        <div className="cx-prog"><div className="cx-prog-bar"><i style={{ width: `${Math.round((done / total) * 100)}%` }} /></div><span>{done} of {total} submitted</span></div>
        {allIn && <div className="cx-allin">All submitted — our office will review and clear you for training. We'll be in touch.</div>}

        {GROUPS.map((g) => (
          <section className="cx-group" key={g}>
            <div className="cx-group-h">{g}</div>
            {COMPLIANCE_ITEMS.filter((i) => i.group === g).map((item) => (
              <Item key={item.key} appId={appId} item={item} saved={items[item.key] || {}} onSaved={(patch) => setSaved(item.key, patch)} />
            ))}
          </section>
        ))}
      </main>
      <style>{CSS}</style>
    </div>
  );
}

function Item({ appId, item, saved, onSaved }) {
  const st = saved.status || "not_started";
  const [open, setOpen] = useState(st === "not_started" || st === "rejected");
  const [label, cls] = STATUS[st] || STATUS.not_started;

  return (
    <div className={`cx-item ${cls}`}>
      <button className="cx-item-h" onClick={() => setOpen((v) => !v)}>
        <span className="cx-item-l">{item.label}{item.required && <span className="cx-req">required</span>}</span>
        <span className={`cx-st ${cls}`}>{label}</span>
      </button>
      {st === "rejected" && saved.reject_reason && <div className="cx-reject">Please redo: {saved.reject_reason}</div>}
      {open && (
        <div className="cx-item-b">
          {item.type === "form" && <FormItem appId={appId} item={item} saved={saved} onSaved={onSaved} />}
          {item.type === "upload" && <UploadItem appId={appId} item={item} saved={saved} onSaved={onSaved} />}
          {item.type === "sign" && <SignItem appId={appId} item={item} saved={saved} onSaved={onSaved} />}
          {item.type === "w9" && <W9Item appId={appId} saved={saved} onSaved={onSaved} />}
          {item.type === "deposit" && <DepositItem appId={appId} saved={saved} onSaved={onSaved} />}
        </div>
      )}
    </div>
  );
}

function useSubmit(fn) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const run = async (...args) => { setBusy(true); setErr(""); try { const r = await fn(...args); if (!r?.ok) { setErr(r?.error || "Could not save."); return false; } return true; } catch { setErr("Could not save."); return false; } finally { setBusy(false); } };
  return { busy, err, run };
}

function FormItem({ appId, item, saved, onSaved }) {
  const [d, setD] = useState(saved.data || {});
  const { busy, err, run } = useSubmit(saveComplianceFormAction);
  return (
    <>
      {item.fields.map(([k, l]) => (
        <div className="cx-field" key={k}><label>{l}</label><input value={d[k] || ""} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></div>
      ))}
      {err && <div className="cx-err">{err}</div>}
      <button className="cx-save" disabled={busy} onClick={async () => (await run(appId, item.key, d)) && onSaved({ status: "submitted", data: d })}>{busy ? "Saving…" : "Save"}</button>
    </>
  );
}

function UploadItem({ appId, item, saved, onSaved }) {
  const parts = item.parts || [""];
  const [refs, setRefs] = useState(saved.refs || []);
  const [exp, setExp] = useState(saved.expires_at || "");
  const [uploading, setUploading] = useState(null);
  const { busy, err, run } = useSubmit(recordComplianceUploadAction);
  const [uerr, setUerr] = useState("");

  async function onFile(part, file) {
    if (!file) return; setUploading(part || "_"); setUerr("");
    try { const ref = await uploadFile(appId, item.key, part, file); setRefs((p) => [...p.filter((r) => r.part !== part), ref]); }
    catch (e) { setUerr(e.message || "Upload failed"); } finally { setUploading(null); }
  }
  const have = (part) => refs.find((r) => r.part === part);

  return (
    <>
      <div className="cx-uploads">
        {parts.map((part) => {
          const r = have(part);
          return (
            <label className="cx-upl" key={part || "one"}>
              <input type="file" accept="image/*" hidden onChange={(e) => onFile(part, e.target.files?.[0])} />
              {r ? <img src={r.url} alt={part} /> : <span className="cx-upl-empty">{uploading === (part || "_") ? "Uploading…" : `+ ${part || "Photo"}`}</span>}
              {part && <span className="cx-upl-cap">{part}</span>}
            </label>
          );
        })}
      </div>
      {item.expires && <div className="cx-field"><label>Expiration date</label><input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></div>}
      {uerr && <div className="cx-err">{uerr}</div>}{err && <div className="cx-err">{err}</div>}
      <button className="cx-save" disabled={busy || refs.length < parts.length} onClick={async () => (await run(appId, item.key, refs, exp || null)) && onSaved({ status: "submitted", refs, expires_at: exp })}>{busy ? "Saving…" : "Submit"}</button>
    </>
  );
}

function SignItem({ appId, item, saved, onSaved }) {
  const [name, setName] = useState(saved.signed_name || "");
  const { busy, err, run } = useSubmit(signComplianceAction);
  return (
    <>
      <div className="cx-agree">{item.agreement}</div>
      <div className="cx-field"><label>Type your full name to sign</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full legal name" /></div>
      {err && <div className="cx-err">{err}</div>}
      <button className="cx-save" disabled={busy} onClick={async () => (await run(appId, item.key, name)) && onSaved({ status: "submitted", signed_name: name })}>{busy ? "Signing…" : "Sign & agree"}</button>
    </>
  );
}

function W9Item({ appId, saved, onSaved }) {
  const d = saved.data || {};
  const [f, setF] = useState({ legal_name: d.legal_name || "", business_name: d.business_name || "", address: d.address || "", tin_type: d.tin_type || "ssn", tin: "", signed_name: saved.signed_name || "" });
  const { busy, err, run } = useSubmit(saveW9Action);
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <>
      {saved.tin_last4 && <div className="cx-have">On file · {f.tin_type === "ein" ? "EIN" : "SSN"} ••• {saved.tin_last4}</div>}
      <div className="cx-field"><label>Legal name (as on your tax return)</label><input value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} /></div>
      <div className="cx-field"><label>Business name <span>(optional)</span></label><input value={f.business_name} onChange={(e) => set("business_name", e.target.value)} /></div>
      <div className="cx-field"><label>Address</label><input value={f.address} onChange={(e) => set("address", e.target.value)} /></div>
      <div className="cx-row">
        <div className="cx-seg">
          <button className={f.tin_type === "ssn" ? "on" : ""} onClick={() => set("tin_type", "ssn")}>SSN</button>
          <button className={f.tin_type === "ein" ? "on" : ""} onClick={() => set("tin_type", "ein")}>EIN</button>
        </div>
        <div className="cx-field grow"><label>{f.tin_type === "ein" ? "EIN" : "SSN"} <span>encrypted</span></label><input inputMode="numeric" value={f.tin} onChange={(e) => set("tin", e.target.value)} placeholder={f.tin_type === "ein" ? "12-3456789" : "123-45-6789"} /></div>
      </div>
      <div className="cx-field"><label>Type your name to certify</label><input value={f.signed_name} onChange={(e) => set("signed_name", e.target.value)} /></div>
      {err && <div className="cx-err">{err}</div>}
      <button className="cx-save" disabled={busy} onClick={async () => (await run(appId, f)) && onSaved({ status: "submitted", tin_last4: f.tin.replace(/\D/g, "").slice(-4), data: { ...f, tin: undefined } })}>{busy ? "Saving…" : "Save W-9"}</button>
    </>
  );
}

function DepositItem({ appId, saved, onSaved }) {
  const d = saved.data || {};
  const [f, setF] = useState({ bank_name: d.bank_name || "", routing: d.routing || "", account: "", account_type: d.account_type || "checking" });
  const { busy, err, run } = useSubmit(saveDepositAction);
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <>
      {saved.account_last4 && <div className="cx-have">On file · account ••• {saved.account_last4}</div>}
      <div className="cx-field"><label>Bank name</label><input value={f.bank_name} onChange={(e) => set("bank_name", e.target.value)} /></div>
      <div className="cx-row">
        <div className="cx-field"><label>Routing #</label><input inputMode="numeric" value={f.routing} onChange={(e) => set("routing", e.target.value)} /></div>
        <div className="cx-field grow"><label>Account # <span>encrypted</span></label><input inputMode="numeric" value={f.account} onChange={(e) => set("account", e.target.value)} /></div>
      </div>
      <div className="cx-seg">
        <button className={f.account_type === "checking" ? "on" : ""} onClick={() => set("account_type", "checking")}>Checking</button>
        <button className={f.account_type === "savings" ? "on" : ""} onClick={() => set("account_type", "savings")}>Savings</button>
      </div>
      {err && <div className="cx-err">{err}</div>}
      <button className="cx-save" disabled={busy} onClick={async () => (await run(appId, f)) && onSaved({ status: "submitted", account_last4: f.account.replace(/\D/g, "").slice(-4), data: { ...f, account: undefined } })}>{busy ? "Saving…" : "Save"}</button>
    </>
  );
}

const CSS = `
.cx{--ink:#101418;--ink-soft:#3A4048;--muted:#787D84;--faint:#A6ABB1;--line:#E4E4DF;--gold:#C9A96E;--gold-deep:#A8842F;
  --paper:#F4F4F2;--raise:#FBFBFA;--green:#2E7D5B;--amber:#B0801F;--red:#C4553D;min-height:100vh;background:var(--paper);color:var(--ink);
  font-family:var(--font-sans,'Instrument Sans',system-ui,sans-serif)}
.cx-top{position:sticky;top:0;z-index:10;background:rgba(244,244,242,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);
  display:flex;align-items:center;justify-content:space-between;padding:12px 22px}
.cx-brand{display:inline-flex;color:var(--ink)}.cx-exit{color:var(--muted);text-decoration:none;font-size:.85rem}
.cx-wrap{max-width:640px;margin:0 auto;padding:26px 22px 80px}
.cx-tag{font-family:var(--font-mono,ui-monospace);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-deep)}
.cx-hero h1{margin:6px 0 8px;font-size:1.7rem;font-weight:800;letter-spacing:-.02em}
.cx-hero p{margin:0;color:var(--ink-soft);font-size:.96rem;line-height:1.55}
.cx-staff{margin-top:8px !important;color:var(--gold-deep) !important;font-size:.84rem !important}
.cx-prog{display:flex;align-items:center;gap:12px;margin:22px 0 8px}
.cx-prog-bar{flex:1;height:8px;background:#E7E7E2;border-radius:5px;overflow:hidden}
.cx-prog-bar i{display:block;height:100%;background:var(--gold-deep);border-radius:5px;transition:width .3s}
.cx-prog span{font-size:.82rem;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.cx-allin{background:#E6F0EA;color:var(--green);border-radius:10px;padding:11px 14px;font-size:.9rem;font-weight:600;margin-bottom:8px}
.cx-group{margin-top:24px}
.cx-group-h{font-family:var(--font-mono,ui-monospace);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
.cx-item{background:var(--raise);border:1px solid var(--line);border-radius:12px;margin-bottom:9px;overflow:hidden}
.cx-item.s-ok{border-color:#CBE0D3}.cx-item.s-bad{border-color:#E7C6BC}
.cx-item-h{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;background:none;border:none;cursor:pointer;font:inherit;text-align:left}
.cx-item-l{font-weight:600;font-size:.98rem;color:var(--ink);display:flex;align-items:center;gap:8px}
.cx-req{font-size:.6rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint)}
.cx-st{font-family:var(--font-mono,ui-monospace);font-size:.64rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;padding:3px 9px;border-radius:999px;flex:none}
.cx-st.s-todo{color:var(--muted);background:#EEEEEA}.cx-st.s-sub{color:var(--gold-deep);background:#F3ECDD}
.cx-st.s-ok{color:var(--green);background:#E6F0EA}.cx-st.s-bad{color:var(--red);background:#F6E7E2}
.cx-reject{background:#F6E7E2;color:var(--red);font-size:.82rem;padding:8px 16px}
.cx-item-b{padding:4px 16px 16px;display:flex;flex-direction:column;gap:11px}
.cx-field{display:flex;flex-direction:column;gap:5px}
.cx-field.grow{flex:1}
.cx-field label{font-size:.78rem;font-weight:600;color:var(--ink-soft)}
.cx-field label span{font-weight:400;color:var(--faint)}
.cx-field input{border:1px solid var(--line);border-radius:9px;padding:10px 12px;font:inherit;font-size:.92rem;color:var(--ink);background:var(--paper);outline:none}
.cx-field input:focus{border-color:var(--gold)}
.cx-row{display:flex;gap:10px}
.cx-agree{background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:11px 13px;font-size:.86rem;line-height:1.5;color:var(--ink-soft)}
.cx-uploads{display:flex;gap:10px;flex-wrap:wrap}
.cx-upl{width:120px;height:88px;border:1.5px dashed var(--line);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;
  cursor:pointer;overflow:hidden;position:relative;background:var(--paper)}
.cx-upl img{width:100%;height:100%;object-fit:cover}
.cx-upl-empty{font-size:.8rem;color:var(--muted)}
.cx-upl-cap{position:absolute;bottom:0;left:0;right:0;background:rgba(16,20,24,.6);color:#fff;font-size:.62rem;text-align:center;padding:2px}
.cx-seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;align-self:flex-start}
.cx-seg button{border:none;background:#fff;padding:8px 14px;font:inherit;font-size:.82rem;font-weight:600;color:var(--muted);cursor:pointer}
.cx-seg button.on{background:var(--gold-deep);color:#fff}
.cx-have{font-size:.82rem;color:var(--green);font-weight:600}
.cx-err{background:#F6E7E2;color:var(--red);border-radius:8px;padding:8px 11px;font-size:.83rem;font-weight:600}
.cx-save{align-self:flex-start;background:var(--gold-deep);color:#fff;border:none;border-radius:9px;padding:10px 20px;font:inherit;font-weight:700;font-size:.88rem;cursor:pointer}
.cx-save:disabled{opacity:.5;cursor:not-allowed}
`;
