"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import AddressAutocomplete from "../components/address-autocomplete";
import { adtGroupsFor, adtSummary, ADT_BEST_SELLERS } from "../../lib/adt";
import { submitAdtApplicationAction } from "./actions";

const titleCase = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtPhone = (s) => { const d = String(s || "").replace(/\D/g, "").slice(0, 10); if (d.length <= 3) return d; if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`; return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKENDS = ["Sat", "Sun"];
const WINS = [{ key: "Morning", sub: "8am–12pm" }, { key: "Afternoon", sub: "12pm–4pm" }, { key: "Evening", sub: "4pm–7pm" }];

const PANELS = ["panel5", "panel7"];   // one control panel only — mutually exclusive, max 1 each
const LOCKED = { lte: 1 };             // always present at a fixed qty, can't be changed
const AUTO = { panel5: 1, lte: 1, contact: 1, glass: 1, motion: 1 };    // preselected starter lineup on a fresh application
// Customer (simple) view: three plain-language coverage questions instead of the full picker. The
// control panel + cell backup are always included (part of AUTO) — the rep refines the rest later.
const SIMPLE_Q = [
  { id: "contact", label: "Doors & windows to protect", sub: "One sensor per entry point" },
  { id: "glass",   label: "Glass break sensors",        sub: "For rooms with large windows" },
  { id: "motion",  label: "Motion sensors",             sub: "Detects movement inside a room" },
];

// A small placeholder glyph per equipment group — swap for real product photos later.
const GIC = {
  panels:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>,
  sensors:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4"/></svg>,
  safety:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 2 2 3 3z"/></svg>,
  video:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  automation: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>,
  access:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 8.15-8.15M18 5l2 2M15 8l2 2"/></svg>,
  misc:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/><path d="m3.3 7 8.7 5 8.7-5"/></svg>,
  existing:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
};

// The ADT intake — rebuilt in the Deck (vault) theme so it lives natively on the project page as the
// Apply stage. Residential/Commercial gate → full application → submit creates the record.
const padEmg = (arr) => { const a = (Array.isArray(arr) ? arr : []).slice(0, 2).map((c) => ({ name: c?.name || "", phone: c?.phone || "" })); while (a.length < 2) a.push({ name: "", phone: "" }); return a; };

// prefill = smart-defaults for a fresh apply; existing = an application being edited (admin); onSubmit =
// custom handler (edit). Default create flow: submit → create → redirect to the account Deck.
export default function AdtIntake({ prefill = null, existing = null, onSubmit = null, submitLabel = null, simple = false }) {
  const router = useRouter();
  const ex = existing;
  const [propertyType, setPropertyType] = useState(ex?.property_type || null);
  const [showTax, setShowTax] = useState(false);
  const [f, setF] = useState(ex
    ? { name: ex.name || "", email: ex.email || "", phone: ex.phone || "", address: ex.address || "", notes: ex.notes || "", taxId: ex.tax_id || "", verbalPassword: ex.verbal_password || "" }
    : { name: prefill?.name || "", email: prefill?.email || "", phone: prefill?.phone || "", address: prefill?.address || "", notes: "", taxId: "", verbalPassword: "" });
  const [emg, setEmg] = useState(ex ? padEmg(ex.emergency) : [{ name: "", phone: "" }, { name: "", phone: "" }]);
  const [qty, setQty] = useState(ex ? { ...(ex.equipment || {}) } : { ...AUTO });   // fresh: 5in panel + LTE preselected
  const [days, setDays] = useState(ex ? [...(ex.pref_days || [])] : [...DAYS]);      // fresh: "Any day" preselected
  const [wins, setWins] = useState(ex ? [...(ex.pref_windows || [])] : []);
  const [asap, setAsap] = useState(ex ? !!ex.asap : false);                          // standalone "install ASAP" flag
  const [doc, setDoc] = useState(ex?.verification_doc || null);   // commercial business-verification file
  const [err, setErr] = useState("");
  const [pending, startTx] = useTransition();

  const onDoc = (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setErr("Document is too large (max 8MB)."); return; }
    setErr("");
    const rd = new FileReader();
    rd.onload = () => setDoc({ name: file.name, type: file.type, data: String(rd.result) });
    rd.readAsDataURL(file);
  };

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const ec = (i, field) => (e) => { const v = field === "name" ? titleCase(e.target.value) : fmtPhone(e.target.value); setEmg((prev) => prev.map((c, x) => (x === i ? { ...c, [field]: v } : c))); };
  // One panel only (5in ↔ 7in exclusive, max 1); LTE is locked at its fixed qty.
  const applyQty = (id, next) => setQty((q) => {
    if (id in LOCKED) return q;
    const nx = { ...q };
    let n = Math.max(0, Math.floor(next(q[id] || 0)));
    if (PANELS.includes(id)) { n = Math.min(1, n); if (n > 0) PANELS.forEach((pid) => { if (pid !== id) delete nx[pid]; }); }
    if (n) nx[id] = n; else delete nx[id];
    return nx;
  });
  const bump = (id, d) => applyQty(id, (cur) => cur + d);
  const setN = (id, v) => applyQty(id, () => +v || 0);
  const dtoggle = (v) => setDays((d) => d.includes(v) ? d.filter((x) => x !== v) : [...d, v]);
  const wtoggle = (v) => setWins((w) => w.includes(v) ? w.filter((x) => x !== v) : [...w, v]);
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const WINKEYS = WINS.map((w) => w.key);
  const allIn = (set) => set.length > 0 && set.every((x) => days.includes(x));   // weekday/weekend chips add/remove a range (both can be on)
  const rangeToggle = (set) => setDays((d) => set.every((x) => d.includes(x)) ? d.filter((x) => !set.includes(x)) : [...new Set([...d, ...set])]);
  const anyDay = days.length === DAYS.length;
  const toggleAny = () => setDays(anyDay ? [] : [...DAYS]);
  const toggleAsap = () => setAsap((v) => !v);                                   // standalone flag — never touches the day/window picks
  const summary = useMemo(() => adtSummary(qty), [qty]);

  function submit(e) {
    e?.preventDefault(); setErr("");
    if (!emg.some((c) => c.name.trim() && c.phone.replace(/\D/g, "").length >= 10)) { setErr("Add at least one emergency contact — a name and phone number."); return; }
    if (!f.verbalPassword.trim()) { setErr("Please set a verbal password."); return; }
    startTx(async () => {
      const payload = { ...f, equipment: qty, propertyType, emergency: emg, prefDays: days, prefWindows: wins, asap, verificationDoc: propertyType === "commercial" ? doc : null };
      const r = onSubmit ? await onSubmit(payload) : await submitAdtApplicationAction(payload);
      if (r?.error) { setErr(r.error); return; }
      if (r?.adtId) router.push(`/adt?id=${encodeURIComponent(r.adtId)}`);   // fresh create → account Deck
      else router.refresh();                                                  // edit → back to the record
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
        <label className="ai-fld full"><span>Install address</span><AddressAutocomplete types={[]} value={f.address} onChange={(addr) => setF((p) => ({ ...p, address: addr }))} placeholder="Start typing an address or business…" autoComplete="off" /></label>
      </div>

      {isComm && (<>
        <div className="ai-sec-t">Business verification <em>· proof of business</em></div>
        {doc ? (
          <div className="ai-doc on">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/></svg>
            <span className="ai-doc-n">{doc.name}</span>
            <button type="button" className="ai-doc-x" onClick={() => setDoc(null)}>Remove</button>
          </div>
        ) : (
          <label className="ai-doc">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            <span className="ai-doc-t"><b>Upload document</b><em>Articles of formation, EIN letter, or proof of business — PDF or image</em></span>
            <input type="file" accept=".pdf,image/*" onChange={onDoc} hidden />
          </label>
        )}
      </>)}

      {simple ? (
        <>
          <div className="ai-sec-t">Your protection <em>· how much coverage?</em></div>
          <div className="ai-note" style={{ marginBottom: 12 }}>Every ADT system includes a smart control panel and 24/7 cellular backup. Just tell us how much coverage you need — we'll tailor the rest.</div>
          {SIMPLE_Q.map((q) => {
            const n = qty[q.id] || 0;
            return (
              <div key={q.id} className={`ai-item${n ? " on" : ""}`}>
                <span className="ai-ic">{GIC.sensors}</span>
                <div className="ai-item-main">
                  <span className="ai-item-name">{q.label}</span>
                  <span className="ai-item-sub" style={{ fontWeight: 500, color: "var(--meta)" }}>{q.sub}</span>
                </div>
                <div className="ai-step">
                  <button type="button" onClick={() => bump(q.id, -1)} disabled={!n} aria-label={`Fewer ${q.label}`}>−</button>
                  <input value={n} onChange={(e) => setN(q.id, e.target.value)} inputMode="numeric" />
                  <button type="button" onClick={() => bump(q.id, 1)} aria-label={`More ${q.label}`}>+</button>
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <>
      <div className="ai-sec-t">Choose your equipment</div>
      {(() => {
        // Best-sellers from the ADT tool — one-tap quick-add. Only show ids valid for this property type.
        const groups = adtGroupsFor(propertyType);
        const lookup = {};
        groups.forEach((g) => g.items.forEach((it) => { lookup[it.id] = { ...it, gkey: g.key }; }));
        const picks = ADT_BEST_SELLERS.map((id) => lookup[id]).filter(Boolean);
        if (!picks.length) return null;
        return (
          <div className="ai-best">
            <div className="ai-best-t">Popular add-ons <em>· tap to add</em></div>
            <div className="ai-best-row">
              {picks.map((it) => {
                const n = qty[it.id] || 0;
                const sub = [it.price ? `$${it.price.toLocaleString()}` : null, it.points ? `${it.points} pt${it.points === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "Included";
                return (
                  <button type="button" key={it.id} className={`ai-bchip${n ? " on" : ""}`} onClick={() => bump(it.id, 1)}>
                    <span className="ai-ic">{GIC[it.gkey] || GIC.misc}</span>
                    <span className="ai-bchip-main">
                      <span className="ai-item-name">{it.name}</span>
                      <span className="ai-item-sub">{sub}</span>
                    </span>
                    {n > 0 ? <span className="ai-bchip-q">{n}</span> : <span className="ai-bchip-add">+</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
      {adtGroupsFor(propertyType).map((g) => (
        <div key={g.key} className="ai-group">
          <div className="ai-group-t">{g.label}</div>
          {g.items.map((it) => {
            const n = qty[it.id] || 0;
            const locked = it.id in LOCKED;
            const capped = PANELS.includes(it.id) && n >= 1;   // panels max 1
            return (
              <div key={it.id} className={`ai-item${n ? " on" : ""}${locked ? " locked" : ""}`}>
                <span className="ai-ic">{GIC[g.key] || GIC.misc}</span>
                <div className="ai-item-main">
                  <span className="ai-item-name">{it.name}</span>
                  <span className="ai-item-sub">{[it.price ? `$${it.price.toLocaleString()}` : null, it.points ? `${it.points} pt${it.points === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "Included"}</span>
                </div>
                {locked
                  ? <span className="ai-req">Required · {LOCKED[it.id]}</span>
                  : (
                    <div className="ai-step">
                      <button type="button" onClick={() => bump(it.id, -1)} disabled={!n} aria-label={`Remove ${it.name}`}>−</button>
                      <input value={n} onChange={(e) => setN(it.id, e.target.value)} inputMode="numeric" />
                      <button type="button" onClick={() => bump(it.id, 1)} disabled={capped} aria-label={`Add ${it.name}`}>+</button>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      ))}
        </>
      )}

      <div className="ai-sec-t">Anything else? <em>optional</em></div>
      <textarea className="ai-area" rows={2} value={f.notes} onChange={set("notes")} placeholder="Gate code, pets, best time to reach you…" />

      <div className="ai-sec-t">Emergency contacts <em>· at least one required</em></div>
      <div className="ai-note">If we can't reach you by phone, we'll contact these people in an emergency.</div>
      {[0, 1].map((i) => (
        <div className="ai-grid" key={i} style={{ marginBottom: i === 0 ? 8 : 0 }}>
          <label className="ai-fld"><span>Contact {i + 1} · full name</span><input value={emg[i].name} onChange={ec(i, "name")} placeholder="Full name" autoComplete="off" /></label>
          <label className="ai-fld"><span>Phone</span><input value={emg[i].phone} onChange={ec(i, "phone")} placeholder="(555) 123-4567" inputMode="tel" autoComplete="off" /></label>
        </div>
      ))}

      <div className="ai-sec-t">Verbal password <em>· required</em></div>
      <input className="ai-inp" value={f.verbalPassword} onChange={set("verbalPassword")} placeholder="A word or phrase only you know" autoComplete="off" />
      <div className="ai-note">This verifies your identity and is used in case of emergencies.</div>

      <div className="ai-sec-t">Preferred install times</div>
      <div className="ai-quick">
        <button type="button" className={"ai-c" + (anyDay ? " on" : "")} onClick={toggleAny}>Any day</button>
        <button type="button" className={"ai-c" + (allIn(WEEKDAYS) ? " on" : "")} onClick={() => rangeToggle(WEEKDAYS)}>Weekdays</button>
        <button type="button" className={"ai-c" + (allIn(WEEKENDS) ? " on" : "")} onClick={() => rangeToggle(WEEKENDS)}>Weekends</button>
        <button type="button" className={"ai-c asap" + (asap ? " on" : "")} onClick={toggleAsap} aria-pressed={asap}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>
          ASAP
        </button>
      </div>
      <div className="ai-days">{DAYS.map((d) => <button type="button" key={d} className={"ai-day" + (days.includes(d) ? " on" : "")} onClick={() => dtoggle(d)}>{d}</button>)}</div>
      <div className="ai-winlbl">Time window</div>
      <div className="ai-wins">{WINS.map((w) => <button type="button" key={w.key} className={"ai-win" + (wins.includes(w.key) ? " on" : "")} onClick={() => wtoggle(w.key)}><b>{w.key}</b><span>{w.sub}</span></button>)}</div>

      {summary.lines.length > 0 && (
        <div className="ai-cart">
          <div className="ai-cart-t">Your order <em>· {summary.count} item{summary.count === 1 ? "" : "s"} · {summary.points} pt{summary.points === 1 ? "" : "s"}</em></div>
          {summary.lines.map((l) => (
            <div className="ai-cart-row" key={l.id}>
              <span className="ai-cart-q">{l.qty}×</span>
              <span className="ai-cart-n">{l.name}</span>
              <span className="ai-cart-p">{l.linePrice ? `$${l.linePrice.toLocaleString()}` : "Included"}</span>
            </div>
          ))}
        </div>
      )}

      {err && <div className="ai-err">{err}</div>}
      <div className="ai-bar">
        <div className="ai-bar-sum"><div className="ai-bar-big">${summary.price.toLocaleString()} <span>est.</span></div><div className="ai-bar-sub">{summary.points} pt{summary.points === 1 ? "" : "s"} · {summary.count} item{summary.count === 1 ? "" : "s"}</div></div>
        <button type="submit" className="ai-go" disabled={pending}>{pending ? "Saving…" : (submitLabel || "Submit application →")}</button>
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
.ai-doc{display:flex;align-items:center;gap:12px;padding:16px;border:1.5px dashed var(--line);border-radius:12px;background:var(--raise);color:var(--gd);cursor:pointer;transition:.12s}
.ai-doc:hover{border-color:var(--g);background:#fff}
.ai-doc-t{display:flex;flex-direction:column;gap:2px}
.ai-doc-t b{font-size:.9rem;color:var(--ink)}
.ai-doc-t em{font-style:normal;font-size:.76rem;color:var(--meta)}
.ai-doc.on{border-style:solid;border-color:#c9e4d1;background:#eef7f0;color:#1c6b45;cursor:default}
.ai-doc-n{flex:1;font-size:.88rem;font-weight:600;color:var(--ink);word-break:break-all}
.ai-doc-x{border:1px solid var(--line);background:#fff;color:#c0392b;border-radius:8px;padding:6px 12px;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit}
.ai-secret{display:flex;align-items:center;border:1px solid var(--line);border-radius:10px;background:#fff;overflow:hidden}
.ai-secret input{border:none;flex:1}
.ai-eye{border:none;background:none;color:var(--meta);padding:0 12px;cursor:pointer;display:grid;place-items:center}
.ai-group{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:10px}
.ai-group-t{font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--ink);background:var(--paper);padding:9px 14px;border-bottom:1px solid var(--line)}
.ai-item{display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid var(--soft);transition:background .12s}
.ai-item:first-of-type{border-top:none}
.ai-item:hover{background:#faf8f3}
.ai-item.on{background:#fbf7ee}
.ai-ic{width:34px;height:34px;flex:none;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--gd)}
.ai-ic svg{width:18px;height:18px}
.ai-item.on .ai-ic{border-color:var(--g);background:#fff}
.ai-item-main{flex:1;min-width:0}
.ai-item-name{display:block;font-size:.9rem;color:var(--ink)}
.ai-item-sub{display:block;font-size:.74rem;font-weight:700;color:var(--ink);margin-top:1px}
.ai-req{font-size:.72rem;font-weight:700;color:var(--gd);background:var(--paper);border:1px solid var(--line);border-radius:100px;padding:5px 12px;flex:none;white-space:nowrap}
.ai-step{display:flex;align-items:center;border:1px solid var(--line);border-radius:9px;overflow:hidden;flex:none;background:#fff;transition:border-color .12s,box-shadow .12s}
.ai-step:hover{border-color:var(--g);box-shadow:0 2px 8px rgba(201,169,110,.16)}
.ai-step button{width:36px;height:36px;border:none;background:#fff;font-size:1.1rem;color:#5b6270;cursor:pointer;transition:background .12s}
.ai-step button:hover:not(:disabled){background:#faf6ec;color:var(--gd)}
.ai-step button:disabled{opacity:.4;cursor:default}
.ai-step input{width:38px;height:36px;border:none;border-left:1px solid var(--line);border-right:1px solid var(--line);text-align:center;font-family:var(--font-mono),ui-monospace,monospace;font-size:.9rem;background:#fff;outline:none}
.ai-best{margin:2px 0 6px}
.ai-best-t{font-size:.74rem;font-weight:800;color:var(--ink);margin:0 0 9px}
.ai-best-t em{font-style:normal;font-weight:600;color:var(--meta)}
.ai-best-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
.ai-bchip{display:flex;align-items:center;gap:12px;padding:9px 12px;border:1px solid var(--line);border-radius:12px;background:#fff;cursor:pointer;text-align:left;transition:border-color .12s,box-shadow .12s,background .12s}
.ai-bchip:hover{border-color:var(--g);box-shadow:0 2px 8px rgba(201,169,110,.16)}
.ai-bchip.on{border-color:var(--g);background:#fbf7ee}
.ai-bchip.on .ai-ic{border-color:var(--g);background:#fff}
.ai-bchip-main{flex:1;min-width:0}
.ai-bchip-add,.ai-bchip-q{flex:none;width:26px;height:26px;display:grid;place-items:center;border-radius:8px;font-weight:800;line-height:1}
.ai-bchip-add{border:1px solid var(--line);color:var(--gd);background:#fff;font-size:1.05rem}
.ai-bchip-q{min-width:26px;padding:0 6px;background:var(--ink);color:#fff;font-size:.8rem}
.ai-note{font-size:.78rem;color:var(--meta);margin:8px 0 0;line-height:1.45}
.ai-quick{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.ai-c{border:1.5px solid var(--line);background:#fff;color:#5b6270;border-radius:100px;padding:7px 15px;font-size:.8rem;font-weight:700;cursor:pointer;transition:.12s}
.ai-c:hover{border-color:var(--g);box-shadow:0 2px 8px rgba(201,169,110,.18)}
.ai-c.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.ai-c.asap{margin-left:auto;display:inline-flex;align-items:center;gap:6px;border-color:var(--g);color:var(--gd)}
.ai-c.asap svg{display:block}
.ai-c.asap.on{background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;border-color:#C9A96E}
.ai-days{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;margin-bottom:14px}
.ai-day{border:1.5px solid var(--line);background:#fff;color:#5b6270;border-radius:10px;padding:11px 0;font-size:.82rem;font-weight:700;cursor:pointer;text-align:center;transition:.12s}
.ai-day:hover{border-color:var(--g);box-shadow:0 2px 8px rgba(201,169,110,.18);transform:translateY(-1px)}
.ai-day.on{background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;border-color:#C9A96E}
.ai-winlbl{font-size:.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--meta);margin:0 0 9px}
.ai-wins{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.ai-win{display:flex;flex-direction:column;gap:2px;align-items:center;border:1.5px solid var(--line);background:#fff;color:#5b6270;border-radius:12px;padding:13px 8px;cursor:pointer;transition:.12s}
.ai-win:hover{border-color:var(--g);box-shadow:0 3px 12px rgba(201,169,110,.2);transform:translateY(-1px)}
.ai-win b{font-size:.9rem;color:var(--ink)}.ai-win span{font-size:.72rem;color:var(--meta)}
.ai-win.on{background:#fbf7ee;border-color:var(--g);box-shadow:0 0 0 1px var(--g) inset}.ai-win.on b{color:var(--gd)}
.ai-cart{margin-top:20px;border:1px solid var(--soft);border-radius:12px;padding:11px 14px;background:#fbfaf7}
.ai-cart-t{font-size:.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--meta);margin-bottom:6px}
.ai-cart-t em{font-style:normal;font-weight:700;color:var(--gd);text-transform:none;letter-spacing:0}
.ai-cart-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--soft)}
.ai-cart-q{flex:none;font-family:var(--font-mono),ui-monospace,monospace;font-size:.8rem;font-weight:700;color:var(--gd);min-width:24px}
.ai-cart-n{flex:1;min-width:0;font-size:.86rem;color:var(--ink)}
.ai-cart-p{flex:none;font-size:.84rem;font-weight:700;color:var(--ink)}
.ai-err{margin-top:14px;font-size:.85rem;color:var(--dv-red,#C4553D);font-weight:600}
.ai-bar{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:20px;padding:14px 0 4px;background:linear-gradient(180deg,transparent,var(--raise) 30%)}
.ai-bar-big{font-size:1.4rem;font-weight:800;color:var(--ink);line-height:1}
.ai-bar-big span{font-size:.78rem;color:var(--meta);font-weight:700}
.ai-bar-sub{font-size:.78rem;color:var(--meta);margin-top:3px}
.ai-go{height:46px;padding:0 22px;border:none;border-radius:12px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.92rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.ai-go:disabled{opacity:.55;cursor:default}
@media(max-width:560px){.ai{padding:16px}.ai-grid{grid-template-columns:1fr}.ai-ptype{grid-template-columns:1fr}.ai-days{gap:5px}.ai-day{padding:10px 0;font-size:.78rem}}
`;
