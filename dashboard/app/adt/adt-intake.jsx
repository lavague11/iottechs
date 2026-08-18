"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import AddressAutocomplete from "../components/address-autocomplete";
import { adtGroupsFor, adtSummary } from "../../lib/adt";
import { submitAdtApplicationAction } from "./actions";

const titleCase = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtPhone = (s) => { const d = String(s || "").replace(/\D/g, "").slice(0, 10); if (d.length <= 3) return d; if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`; return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKENDS = ["Sat", "Sun"];
const WINS = [{ key: "Morning", sub: "8am–12pm" }, { key: "Afternoon", sub: "12pm–4pm" }, { key: "Evening", sub: "4pm–7pm" }];

// The ADT intake — rebuilt in the Deck (vault) theme so it lives natively on the project page as the
// Apply stage. Residential/Commercial gate → full application → submit creates the record.
export default function AdtIntake({ prefill = null }) {
  const router = useRouter();
  const [propertyType, setPropertyType] = useState(null);
  const [showTax, setShowTax] = useState(false);
  const [f, setF] = useState({ name: prefill?.name || "", email: prefill?.email || "", phone: prefill?.phone || "", address: prefill?.address || "", notes: "", taxId: "", verbalPassword: "" });
  const [emg, setEmg] = useState([{ name: "", phone: "" }, { name: "", phone: "" }]);
  const [qty, setQty] = useState({});
  const [days, setDays] = useState([]);
  const [wins, setWins] = useState([]);
  const [err, setErr] = useState("");
  const [pending, startTx] = useTransition();

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const ec = (i, field) => (e) => { const v = field === "name" ? titleCase(e.target.value) : fmtPhone(e.target.value); setEmg((prev) => prev.map((c, x) => (x === i ? { ...c, [field]: v } : c))); };
  const bump = (id, d) => setQty((q) => { const n = Math.max(0, (q[id] || 0) + d); const nx = { ...q }; if (n) nx[id] = n; else delete nx[id]; return nx; });
  const setN = (id, v) => setQty((q) => { const n = Math.max(0, Math.floor(+v || 0)); const nx = { ...q }; if (n) nx[id] = n; else delete nx[id]; return nx; });
  const dtoggle = (v) => setDays((d) => d.includes(v) ? d.filter((x) => x !== v) : [...d, v]);
  const wtoggle = (v) => setWins((w) => w.includes(v) ? w.filter((x) => x !== v) : [...w, v]);
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const dquick = (s) => setDays(sameSet(days, s) ? [] : s);
  const summary = useMemo(() => adtSummary(qty), [qty]);

  function submit(e) {
    e?.preventDefault(); setErr("");
    startTx(async () => {
      const r = await submitAdtApplicationAction({ ...f, equipment: qty, propertyType, emergency: emg, prefDays: days, prefWindows: wins });
      if (r?.error) { setErr(r.error); return; }
      router.push(`/adt?id=${encodeURIComponent(r.adtId)}`);
    });
  }

  // ── Residential vs Commercial — nothing else shows until they pick. ──
  if (!propertyType) {
    return (
      <div className="ai">
        <style>{CSS}</style>
        <div className="ai-gate-h">What are we protecting?</div>
        <div className="ai-gate-p">Pick the kind of property — it tailors the rest of your ADT setup.</div>
        <div className="ai-ptype">
          <button type="button" className="ai-ptype-box" onClick={() => setPropertyType("residential")}>
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
            <span className="ai-ptype-t">Residential</span><span className="ai-ptype-d">Home, apartment, or condo</span>
          </button>
          <button type="button" className="ai-ptype-box" onClick={() => setPropertyType("commercial")}>
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" /><path d="M15 21V9h3a1 1 0 0 1 1 1v11" /><path d="M8 8h1M8 12h1M8 16h1M12 8h0M12 12h0M12 16h0" /></svg>
            <span className="ai-ptype-t">Commercial</span><span className="ai-ptype-d">Store, office, or warehouse</span>
          </button>
        </div>
      </div>
    );
  }

  const isComm = propertyType === "commercial";
  return (
    <form className="ai" onSubmit={submit}>
      <style>{CSS}</style>
      {prefill?.name && <div className="ai-prefill">✓ We pre-filled what's on your account — review it, add your equipment and secure details, then submit.</div>}

      <div className="ai-secrow">
        <div className="ai-chip" onClick={() => setPropertyType(null)}>{isComm ? "Commercial" : "Residential"} · Change</div>
      </div>

      <div className="ai-sec-t">Your details</div>
      <div className="ai-grid">
        <label className="ai-fld"><span>Full name</span><input value={f.name} onChange={set("name")} placeholder="Jane Doe" autoComplete="name" /></label>
        <label className="ai-fld"><span>Phone</span><input value={f.phone} onChange={set("phone")} placeholder="(555) 123-4567" inputMode="tel" autoComplete="tel" /></label>
        <label className="ai-fld"><span>Email</span><input value={f.email} onChange={set("email")} placeholder="you@email.com" type="email" autoComplete="email" /></label>
        <label className="ai-fld"><span>{isComm ? "EIN" : "SSN"} <em>· for the ADT account</em></span>
          <div className="ai-secret">
            <input type={showTax ? "text" : "password"} value={f.taxId} onChange={set("taxId")} placeholder={isComm ? "12-3456789" : "•••-••-••••"} inputMode="numeric" autoComplete="off" />
            <button type="button" className="ai-eye" onClick={() => setShowTax((s) => !s)} tabIndex={-1} aria-label={showTax ? "Hide" : "Show"}>
              {showTax
                ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" /><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /></svg>
                : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
            </button>
          </div>
        </label>
        <label className="ai-fld full"><span>Install address</span><AddressAutocomplete value={f.address} onChange={(addr) => setF((p) => ({ ...p, address: addr }))} placeholder="Start typing an address…" autoComplete="off" /></label>
      </div>

      <div className="ai-sec-t">Choose your equipment</div>
      {adtGroupsFor(propertyType).map((g) => (
        <div key={g.key} className="ai-group">
          <div className="ai-group-t">{g.label}</div>
          {g.items.map((it) => {
            const n = qty[it.id] || 0;
            return (
              <div key={it.id} className={`ai-item${n ? " on" : ""}`}>
                <div className="ai-item-main">
                  <span className="ai-item-name">{it.name}</span>
                  <span className="ai-item-sub">{[it.price ? `$${it.price.toLocaleString()}` : null, it.points ? `${it.points} pt${it.points === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "Included"}</span>
                </div>
                <div className="ai-step">
                  <button type="button" onClick={() => bump(it.id, -1)} disabled={!n} aria-label={`Remove ${it.name}`}>−</button>
                  <input value={n} onChange={(e) => setN(it.id, e.target.value)} inputMode="numeric" />
                  <button type="button" onClick={() => bump(it.id, 1)} aria-label={`Add ${it.name}`}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="ai-sec-t">Anything else? <em>optional</em></div>
      <textarea className="ai-area" rows={2} value={f.notes} onChange={set("notes")} placeholder="Gate code, pets, best time to reach you…" />

      <div className="ai-sec-t">Emergency contacts</div>
      <div className="ai-note">If we can't reach you by phone, we'll contact these people in an emergency.</div>
      {[0, 1].map((i) => (
        <div className="ai-grid" key={i} style={{ marginBottom: i === 0 ? 8 : 0 }}>
          <label className="ai-fld"><span>Contact {i + 1} · full name</span><input value={emg[i].name} onChange={ec(i, "name")} placeholder="Full name" autoComplete="off" /></label>
          <label className="ai-fld"><span>Phone</span><input value={emg[i].phone} onChange={ec(i, "phone")} placeholder="(555) 123-4567" inputMode="tel" autoComplete="off" /></label>
        </div>
      ))}

      <div className="ai-sec-t">Verbal password</div>
      <input className="ai-inp" value={f.verbalPassword} onChange={set("verbalPassword")} placeholder="A word or phrase only you know" autoComplete="off" />
      <div className="ai-note">This verifies your identity and is used in case of emergencies.</div>

      <div className="ai-sec-t">Preferred install times <em>optional</em></div>
      <div className="ai-quick">
        <button type="button" className={"ai-c" + (sameSet(days, WEEKDAYS) ? " on" : "")} onClick={() => dquick(WEEKDAYS)}>Weekdays</button>
        <button type="button" className={"ai-c" + (sameSet(days, WEEKENDS) ? " on" : "")} onClick={() => dquick(WEEKENDS)}>Weekends</button>
        <button type="button" className={"ai-c" + (sameSet(days, DAYS) ? " on" : "")} onClick={() => dquick(DAYS)}>Any day</button>
      </div>
      <div className="ai-days">{DAYS.map((d) => <button type="button" key={d} className={"ai-day" + (days.includes(d) ? " on" : "")} onClick={() => dtoggle(d)}>{d}</button>)}</div>
      <div className="ai-wins">{WINS.map((w) => <button type="button" key={w.key} className={"ai-win" + (wins.includes(w.key) ? " on" : "")} onClick={() => wtoggle(w.key)}><b>{w.key}</b><span>{w.sub}</span></button>)}</div>

      {err && <div className="ai-err">{err}</div>}
      <div className="ai-bar">
        <div className="ai-bar-sum"><div className="ai-bar-big">${summary.price.toLocaleString()} <span>est.</span></div><div className="ai-bar-sub">{summary.points} pt{summary.points === 1 ? "" : "s"} · {summary.count} item{summary.count === 1 ? "" : "s"}</div></div>
        <button type="submit" className="ai-go" disabled={pending}>{pending ? "Submitting…" : "Submit application →"}</button>
      </div>
    </form>
  );
}

const CSS = `
.ai{--g:var(--dv-gold,#C9A96E);--gd:var(--dv-gold-deep,#A8842F);--ink:var(--dv-ink,#101418);--meta:var(--dv-meta,#787D84);--line:var(--dv-line,#E4E4DF);--soft:var(--dv-line-soft,#EDEDE9);--paper:var(--dv-paper,#F4F4F2);--raise:var(--dv-raise,#FBFBFA);
  font-family:var(--font-sans),inherit;color:var(--ink);padding:20px 26px 32px;max-width:820px;margin:0 auto}
.ai-gate-h{font-size:1.4rem;font-weight:800;letter-spacing:-.01em;margin:8px 0 4px}
.ai-gate-p{font-size:.9rem;color:var(--meta);margin-bottom:20px}
.ai-ptype{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ai-ptype-box{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:26px 16px;border:1.5px solid var(--line);border-radius:16px;background:var(--raise);color:var(--ink);cursor:pointer;transition:border-color .15s,background .15s}
.ai-ptype-box:hover{border-color:var(--g);background:#fff}
.ai-ptype-box svg{color:var(--gd)}
.ai-ptype-t{font-size:1rem;font-weight:800}
.ai-ptype-d{font-size:.78rem;color:var(--meta)}
.ai-prefill{margin-bottom:16px;padding:10px 13px;border-radius:11px;background:#eef7f0;border:1px solid #c9e4d1;color:#1c6b45;font-size:.85rem;font-weight:600}
.ai-secrow{display:flex;justify-content:flex-end;margin-bottom:8px}
.ai-chip{font-size:.74rem;font-weight:700;color:var(--gd);background:var(--paper);border:1px solid var(--line);border-radius:100px;padding:5px 13px;cursor:pointer}
.ai-chip:hover{border-color:var(--g)}
.ai-sec-t{font-size:.72rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--meta);margin:22px 0 11px;padding-top:16px;border-top:1px solid var(--soft)}
.ai-sec-t:first-of-type{border-top:none;padding-top:0;margin-top:4px}
.ai-sec-t em{font-style:normal;font-weight:600;color:#a7abb2;text-transform:none;letter-spacing:0}
.ai-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ai-fld{display:flex;flex-direction:column;gap:5px;min-width:0}
.ai-fld.full{grid-column:1/-1}
.ai-fld span{font-size:.72rem;font-weight:700;color:#5b6270}
.ai-fld em{font-style:normal;color:#a7abb2;font-weight:500}
.ai-fld input,.ai-inp,.ai-area{border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);padding:11px 13px;font-size:.92rem;font-family:inherit;outline:none;width:100%}
.ai-fld input:focus,.ai-inp:focus,.ai-area:focus,.ai-secret:focus-within{border-color:var(--g)}
.ai-inp{margin-bottom:0}
.ai-area{margin-bottom:0;resize:vertical}
.ai-secret{display:flex;align-items:center;border:1px solid var(--line);border-radius:10px;background:#fff;overflow:hidden}
.ai-secret input{border:none;flex:1}
.ai-eye{border:none;background:none;color:var(--meta);padding:0 12px;cursor:pointer;display:grid;place-items:center}
.ai-group{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:10px}
.ai-group-t{font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--gd);background:var(--paper);padding:9px 14px;border-bottom:1px solid var(--line)}
.ai-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-top:1px solid var(--soft)}
.ai-item:first-of-type{border-top:none}
.ai-item.on{background:#fbf7ee}
.ai-item-main{min-width:0}
.ai-item-name{display:block;font-size:.9rem;color:var(--ink)}
.ai-item-sub{display:block;font-size:.74rem;font-weight:700;color:var(--gd);margin-top:1px}
.ai-step{display:flex;align-items:center;border:1px solid var(--line);border-radius:9px;overflow:hidden;flex:none;background:#fff}
.ai-step button{width:36px;height:36px;border:none;background:#fff;font-size:1.1rem;color:#5b6270;cursor:pointer}
.ai-step button:disabled{opacity:.4;cursor:default}
.ai-step input{width:38px;height:36px;border:none;border-left:1px solid var(--line);border-right:1px solid var(--line);text-align:center;font-family:var(--font-mono),ui-monospace,monospace;font-size:.9rem;background:#fff;outline:none}
.ai-note{font-size:.78rem;color:var(--meta);margin:8px 0 0;line-height:1.45}
.ai-quick{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.ai-c{border:1px solid var(--line);background:#fff;color:#5b6270;border-radius:100px;padding:7px 15px;font-size:.8rem;font-weight:700;cursor:pointer}
.ai-c:hover{border-color:var(--g)}.ai-c.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.ai-days{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;margin-bottom:12px}
.ai-day{border:1px solid var(--line);background:#fff;color:#5b6270;border-radius:10px;padding:11px 0;font-size:.82rem;font-weight:700;cursor:pointer;text-align:center}
.ai-day:hover{border-color:var(--g)}.ai-day.on{background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;border-color:#C9A96E}
.ai-wins{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.ai-win{display:flex;flex-direction:column;gap:2px;align-items:center;border:1px solid var(--line);background:#fff;color:#5b6270;border-radius:11px;padding:12px 8px;cursor:pointer}
.ai-win:hover{border-color:var(--g)}.ai-win b{font-size:.88rem;color:var(--ink)}.ai-win span{font-size:.72rem;color:var(--meta)}
.ai-win.on{background:#fbf7ee;border-color:var(--g)}.ai-win.on b{color:var(--gd)}
.ai-err{margin-top:14px;font-size:.85rem;color:var(--dv-red,#C4553D);font-weight:600}
.ai-bar{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:20px;padding:14px 0 4px;background:linear-gradient(180deg,transparent,var(--raise) 30%)}
.ai-bar-big{font-size:1.4rem;font-weight:800;color:var(--ink);line-height:1}
.ai-bar-big span{font-size:.78rem;color:var(--meta);font-weight:700}
.ai-bar-sub{font-size:.78rem;color:var(--meta);margin-top:3px}
.ai-go{height:46px;padding:0 22px;border:none;border-radius:12px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.92rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.ai-go:disabled{opacity:.55;cursor:default}
@media(max-width:560px){.ai{padding:16px}.ai-grid{grid-template-columns:1fr}.ai-ptype{grid-template-columns:1fr}.ai-days{gap:5px}.ai-day{padding:10px 0;font-size:.78rem}}
`;
