"use client";

import { useState, useMemo, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "../components/brand";
import AddressAutocomplete from "../components/address-autocomplete";
import { ADT_GROUPS, ADT_ITEMS, adtSummary, adtGroupsFor } from "../../lib/adt";
import { submitAdtApplicationAction, submitAdtPreferencesAction, completeAdtAction } from "./actions";

const STEPS = [
  { key: "apply",    label: "Apply" },
  { key: "schedule", label: "Schedule" },
  { key: "complete", label: "Complete" },
];
// Map a saved application stage → which step is active (applied = schedule is next up).
const STAGE_TO_STEP = { applied: 1, scheduled: 2, completed: 2 };

// Capitalize each word (names); format a phone as (xxx) xxx-xxxx as it's typed.
const titleCase = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtPhone = (s) => { const d = String(s || "").replace(/\D/g, "").slice(0, 10); if (d.length <= 3) return d; if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`; return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };

export default function AdtPortalClient({ app, prefill = null, quote = null }) {
  const stepIdx = app ? STAGE_TO_STEP[app.stage] ?? 0 : 0;
  return (
    <div className="adt">
      <style>{CSS}</style>
      <header className="adt-top">
        <Link href="/" className="adt-brand"><Wordmark height={22} /></Link>
        <span className="adt-tag">ADT Project Portal</span>
      </header>

      <div className="adt-wrap">
        <Stepper current={stepIdx} appDone={app?.stage === "completed"} />
        {!app          && <ApplyStep prefill={prefill} />}
        {app && app.stage === "applied"   && <ScheduleStep app={app} />}
        {app && app.stage === "scheduled" && <ScheduledView app={app} />}
        {app && app.stage === "completed" && <CompleteView app={app} />}
        {app && quote && <QuotePanel adtId={app.adt_id} quote={quote} />}
      </div>
    </div>
  );
}

// The customer's shared quote — the ADT Tool in locked, read-only Cust view. Sanitized upstream so
// no cost/commission is ever in this payload; it only ever shows retail, credit, and due-at-install.
function QuotePanel({ adtId, quote }) {
  const ref = useRef(null);
  useEffect(() => {
    function onMsg(e) {
      const m = e.data || {};
      if (!m || m.adt !== adtId) return;
      if (m.type === "adt-ready") { try { ref.current?.contentWindow?.postMessage({ type: "adt-deal-load", deal: quote }, "*"); } catch {} }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [adtId, quote]);
  const push = () => { try { ref.current?.contentWindow?.postMessage({ type: "adt-deal-load", deal: quote }, "*"); } catch {} };
  const qs = new URLSearchParams({ embed: "1", view: "cust", lock: "1", ro: "1", adt: adtId });
  return (
    <div className="adt-quote">
      <div className="adt-quote-h"><span>Your quote</span></div>
      <iframe ref={ref} title="Your quote" src={`/widgets/adt-calculator.html?${qs.toString()}`} className="adt-quote-frame" onLoad={push} />
    </div>
  );
}

function Stepper({ current, appDone }) {
  return (
    <ol className="adt-steps">
      {STEPS.map((s, i) => {
        const done = appDone ? true : i < current;
        const on = !appDone && i === current;
        return (
          <li key={s.key} className={`adt-step${done ? " done" : ""}${on ? " on" : ""}`}>
            <span className="adt-step-dot">{done ? "✓" : i + 1}</span>
            <span className="adt-step-lbl">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- Step 1 · Apply (intake) ---------------- */
function ApplyStep({ prefill = null }) {
  const router = useRouter();
  const [propertyType, setPropertyType] = useState(null);   // "residential" | "commercial" — the FIRST choice
  const [showTax, setShowTax] = useState(false);            // reveal/hide the SSN/EIN
  // Prefilled from the signed-in customer's record when they arrive from their portal (smart defaults).
  const [f, setF] = useState({ name: prefill?.name || "", email: prefill?.email || "", phone: prefill?.phone || "", address: prefill?.address || "", notes: "", taxId: "", verbalPassword: "" });
  const [emg, setEmg] = useState([{ name: "", phone: "" }, { name: "", phone: "" }]);   // two emergency contacts
  const ec = (i, field) => (e) => { const v = field === "name" ? titleCase(e.target.value) : fmtPhone(e.target.value); setEmg((prev) => prev.map((c, x) => (x === i ? { ...c, [field]: v } : c))); };
  const [qty, setQty] = useState({});          // { itemId: n }
  const [err, setErr] = useState("");
  const [pending, startTx] = useTransition();
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const bump = (id, d) => setQty((q) => { const n = Math.max(0, (q[id] || 0) + d); const nx = { ...q }; if (n) nx[id] = n; else delete nx[id]; return nx; });
  const setN = (id, v) => setQty((q) => { const n = Math.max(0, Math.floor(+v || 0)); const nx = { ...q }; if (n) nx[id] = n; else delete nx[id]; return nx; });

  const summary = useMemo(() => adtSummary(qty), [qty]);

  function submit(e) {
    e.preventDefault(); setErr("");
    startTx(async () => {
      const r = await submitAdtApplicationAction({ ...f, equipment: qty, propertyType, emergency: emg });
      if (r?.error) { setErr(r.error); return; }
      router.push(`/adt?id=${encodeURIComponent(r.adtId)}`);
    });
  }

  // ── FIRST STEP: residential or commercial. Nothing else shows until they pick. ──
  if (!propertyType) {
    return (
      <div className="adt-card">
        <div className="adt-h">
          <h1>What are we protecting?</h1>
          <p>Pick the kind of property — it tailors the rest of your ADT setup.</p>
        </div>
        <div className="adt-ptype">
          <button type="button" className="adt-ptype-box" onClick={() => setPropertyType("residential")}>
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
            <span className="adt-ptype-t">Residential</span>
            <span className="adt-ptype-d">Home, apartment, or condo</span>
          </button>
          <button type="button" className="adt-ptype-box" onClick={() => setPropertyType("commercial")}>
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M15 21V9h3a1 1 0 0 1 1 1v11"/><path d="M8 8h1M8 12h1M8 16h1M12 8h0M12 12h0M12 16h0"/></svg>
            <span className="adt-ptype-t">Commercial</span>
            <span className="adt-ptype-d">Store, office, or warehouse</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="adt-card" onSubmit={submit}>
      <div className="adt-h">
        <h1>Design your ADT system</h1>
        <p>Tell us where you are and pick your equipment — we'll total the points and reach out to schedule your install.</p>
        <button type="button" className="adt-ptype-chip" onClick={() => setPropertyType(null)}>
          {propertyType === "commercial" ? "Commercial" : "Residential"} · Change
        </button>
      </div>

      <div className="adt-sec">
        <div className="adt-sec-t">Your details</div>
        <div className="adt-grid">
          <label className="adt-fld"><span>Full name</span><input value={f.name} onChange={set("name")} placeholder="Jane Doe" autoComplete="name" /></label>
          <label className="adt-fld"><span>Phone</span><input value={f.phone} onChange={set("phone")} placeholder="(555) 123-4567" inputMode="tel" autoComplete="tel" /></label>
          <label className="adt-fld"><span>Email</span><input value={f.email} onChange={set("email")} placeholder="you@email.com" type="email" autoComplete="email" /></label>
          <label className="adt-fld">
            <span>{propertyType === "commercial" ? "EIN" : "SSN"} <em>· for the ADT account</em></span>
            <div className="adt-secret">
              <input type={showTax ? "text" : "password"} value={f.taxId} onChange={set("taxId")} placeholder={propertyType === "commercial" ? "12-3456789" : "•••-••-••••"} inputMode="numeric" autoComplete="off" />
              <button type="button" className="adt-secret-eye" onClick={() => setShowTax((s) => !s)} tabIndex={-1} aria-label={showTax ? "Hide" : "Show"}>
                {showTax
                  ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/></svg>
                  : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
          </label>
          <label className="adt-fld full"><span>Install address</span><AddressAutocomplete value={f.address} onChange={(addr) => setF((p) => ({ ...p, address: addr }))} placeholder="Start typing an address…" autoComplete="off" /></label>
        </div>
      </div>

      <div className="adt-sec">
        <div className="adt-sec-t">Choose your equipment</div>
        {adtGroupsFor(propertyType).map((g) => (
          <div key={g.key} className="adt-group">
            <div className="adt-group-t">{g.label}</div>
            <div className="adt-items">
              {g.items.map((it) => {
                const n = qty[it.id] || 0;
                return (
                  <div key={it.id} className={`adt-item${n ? " picked" : ""}`}>
                    <div className="adt-item-main">
                      <span className="adt-item-name">{it.name}</span>
                      <span className="adt-item-pts">{it.points === 0 ? "0 pts" : `${it.points} pt${it.points === 1 ? "" : "s"}`}</span>
                    </div>
                    <div className="adt-step-ctrl">
                      <button type="button" className="adt-qbtn" onClick={() => bump(it.id, -1)} disabled={!n} aria-label={`Remove ${it.name}`}>−</button>
                      <input className="adt-qin" value={n} onChange={(e) => setN(it.id, e.target.value)} inputMode="numeric" />
                      <button type="button" className="adt-qbtn" onClick={() => bump(it.id, 1)} aria-label={`Add ${it.name}`}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="adt-sec">
        <label className="adt-fld full"><span>Anything else? <em>(optional)</em></span><textarea rows={3} value={f.notes} onChange={set("notes")} placeholder="Gate code, pets, best time to reach you…" /></label>
      </div>

      <div className="adt-sec">
        <div className="adt-sec-t">Emergency contacts</div>
        <p className="adt-secnote">If we can&rsquo;t reach you by phone, we&rsquo;ll contact these people in an emergency.</p>
        {[0, 1].map((i) => (
          <div className="adt-grid" key={i} style={{ marginBottom: i === 0 ? 10 : 0 }}>
            <label className="adt-fld"><span>Contact {i + 1} · full name</span><input value={emg[i].name} onChange={ec(i, "name")} placeholder="Full name" autoComplete="off" /></label>
            <label className="adt-fld"><span>Phone</span><input value={emg[i].phone} onChange={ec(i, "phone")} placeholder="(555) 123-4567" inputMode="tel" autoComplete="off" /></label>
          </div>
        ))}
      </div>

      <div className="adt-sec">
        <label className="adt-fld full"><span>Verbal password</span><input value={f.verbalPassword} onChange={set("verbalPassword")} placeholder="A word or phrase only you know" autoComplete="off" /></label>
        <p className="adt-secnote">This verifies your identity and is used in case of emergencies.</p>
      </div>

      {err && <div className="adt-err">{err}</div>}

      <div className="adt-bar">
        <div className="adt-bar-sum">
          <div className="adt-bar-pts">{summary.points} <span>pts</span></div>
          <div className="adt-bar-sub">{summary.count} item{summary.count === 1 ? "" : "s"} selected</div>
        </div>
        <button type="submit" className="adt-go" disabled={pending}>{pending ? "Submitting…" : "Continue to Schedule →"}</button>
      </div>
    </form>
  );
}

/* ---------------- Step 2 · Preferred times ---------------- */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKENDS = ["Sat", "Sun"];
const WINDOWS = [
  { key: "Morning",   sub: "8am–12pm" },
  { key: "Afternoon", sub: "12pm–4pm" },
  { key: "Evening",   sub: "4pm–7pm" },
];
function ScheduleStep({ app }) {
  const router = useRouter();
  const [days, setDays] = useState([]);
  const [wins, setWins] = useState([]);
  const [err, setErr]   = useState("");
  const [pending, startTx] = useTransition();

  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const quick = (set) => setDays(sameSet(days, set) ? [] : set);

  function confirm() {
    setErr("");
    startTx(async () => {
      const r = await submitAdtPreferencesAction(app.adt_id, { days, windows: wins });
      if (r?.error) { setErr(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="adt-card">
      <div className="adt-h">
        <h1>When works for you?</h1>
        <p>Application <b>{app.adt_id}</b> received. Tell us your preferred days and times — we'll confirm the exact appointment.</p>
      </div>
      <PointsRecap app={app} />

      <div className="adt-sec">
        <div className="adt-sec-t">Preferred days</div>
        <div className="adt-quick">
          <button type="button" className={"adt-chip" + (sameSet(days, WEEKDAYS) ? " on" : "")} onClick={() => quick(WEEKDAYS)}>Weekdays</button>
          <button type="button" className={"adt-chip" + (sameSet(days, WEEKENDS) ? " on" : "")} onClick={() => quick(WEEKENDS)}>Weekends</button>
          <button type="button" className={"adt-chip" + (sameSet(days, DAYS) ? " on" : "")} onClick={() => quick(DAYS)}>Any day</button>
        </div>
        <div className="adt-days">
          {DAYS.map((d) => (
            <button type="button" key={d} className={"adt-day" + (days.includes(d) ? " on" : "")} onClick={() => toggle(days, setDays, d)}>{d}</button>
          ))}
        </div>
      </div>

      <div className="adt-sec">
        <div className="adt-sec-t">Time window</div>
        <div className="adt-wins">
          {WINDOWS.map((w) => (
            <button type="button" key={w.key} className={"adt-win" + (wins.includes(w.key) ? " on" : "")} onClick={() => toggle(wins, setWins, w.key)}>
              <b>{w.key}</b><span>{w.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {err && <div className="adt-err">{err}</div>}
      <div className="adt-bar end">
        <button className="adt-go" onClick={confirm} disabled={pending || !days.length || !wins.length}>{pending ? "Sending…" : "Send preferences →"}</button>
      </div>
    </div>
  );
}

/* ---------------- Scheduled (awaiting install) ---------------- */
function ScheduledView({ app }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const fmt = (d) => { try { return new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
  return (
    <div className="adt-card">
      <div className="adt-hero">
        <div className="adt-hero-ic sched"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <h1>{app.schedule_date ? "You're on the schedule" : "Preferences received"}</h1>
        <p>{app.schedule_date
          ? <>Install set for <b>{fmt(app.schedule_date)}</b>{app.schedule_window ? ` · ${app.schedule_window}` : ""}.</>
          : (app.pref_days?.length || app.pref_windows?.length)
            ? <>We'll confirm a time that fits your preference: <b>{(app.pref_days || []).join(", ") || "any day"}</b>{app.pref_windows?.length ? <> · <b>{app.pref_windows.join(", ")}</b></> : ""}.</>
            : "We'll be in touch to confirm the details."}</p>
      </div>
      <PointsRecap app={app} />
      <div className="adt-bar end">
        <button className="adt-go ghost" disabled={pending} onClick={() => startTx(async () => { await completeAdtAction(app.adt_id); router.refresh(); })}>
          {pending ? "…" : "Mark install complete"}
        </button>
      </div>
      <div className="adt-note-line">Access PIN <b>{app.access_pin || "—"}</b> · keep your application ID <b>{app.adt_id}</b> to check back anytime.</div>
    </div>
  );
}

/* ---------------- Step 3 · Complete ---------------- */
function CompleteView({ app }) {
  return (
    <div className="adt-card">
      <div className="adt-hero">
        <div className="adt-hero-ic done"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
        <h1>Your ADT system is live</h1>
        <p>Installation complete for <b>{app.adt_id}</b>. Welcome to safer days ahead.</p>
      </div>
      <PointsRecap app={app} />
    </div>
  );
}

/* ---------------- shared: equipment recap ---------------- */
function PointsRecap({ app }) {
  const summary = adtSummary(app.equipment || {});
  if (!summary.lines.length) return null;
  return (
    <div className="adt-recap">
      <div className="adt-recap-hd"><span>Your equipment</span><span className="adt-recap-pts">{summary.points} pts</span></div>
      <div className="adt-recap-list">
        {summary.lines.map((l) => (
          <div key={l.id} className="adt-recap-row">
            <span className="adt-recap-q">{l.qty}×</span>
            <span className="adt-recap-n">{l.name}</span>
            <span className="adt-recap-p">{l.linePoints || 0} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.adt{min-height:100vh;background:#f6f5f2;color:#0B0F1A;font-family:var(--font,'Inter',system-ui,sans-serif)}
.adt-top{max-width:760px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:18px 20px}
.adt-brand{display:inline-flex;text-decoration:none}
.adt-tag{font-size:.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a3812f;background:#faf4e8;border:1px solid #ecdcb4;border-radius:100px;padding:4px 12px}
.adt-wrap{max-width:760px;margin:0 auto 60px;padding:0 16px}
.adt-steps{list-style:none;display:flex;align-items:center;gap:0;margin:6px 0 20px;padding:0;counter-reset:s}
.adt-step{flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;position:relative;color:#9aa1af}
.adt-step:not(:last-child)::after{content:"";position:absolute;top:15px;left:calc(50% + 20px);right:calc(-50% + 20px);height:2px;background:#e2ddd2}
.adt-step.done:not(:last-child)::after{background:#2f7d5a}
.adt-step-dot{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#fff;border:2px solid #e2ddd2;font-size:.82rem;font-weight:800;color:#9aa1af;z-index:1}
.adt-step.on .adt-step-dot{border-color:var(--gold,#C9A96E);color:var(--gold-deep,#a8894e);background:#fff8ee}
.adt-step.done .adt-step-dot{background:#2f7d5a;border-color:#2f7d5a;color:#fff}
.adt-step-lbl{font-size:.78rem;font-weight:700}
.adt-step.on .adt-step-lbl{color:#0B0F1A}
.adt-step.done .adt-step-lbl{color:#2f7d5a}
.adt-card{background:#fff;border:1px solid #e4e0d8;border-radius:18px;padding:26px 26px 20px;box-shadow:0 20px 50px -30px rgba(14,19,32,.4)}
.adt-h h1{font-family:'Bricolage Grotesque',sans-serif;font-size:1.55rem;font-weight:800;letter-spacing:-.01em;margin:0 0 6px}
.adt-h p{font-size:.92rem;color:#6f7686;line-height:1.5;margin:0 0 6px;max-width:56ch}
/* First step — residential / commercial */
.adt-ptype{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px}
.adt-ptype-box{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:30px 18px;border:1px solid #e4e0d8;border-radius:16px;background:#fff;color:#1a2233;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s,transform .1s}
.adt-ptype-box:hover{border-color:#1a2233;background:#faf8f4}
.adt-ptype-box:active{transform:translateY(1px)}
.adt-ptype-box svg{color:#b8923a;margin-bottom:8px}
.adt-ptype-t{font-size:1.05rem;font-weight:800}
.adt-ptype-d{font-size:.82rem;color:#6f7686}
.adt-ptype-chip{margin-top:8px;height:28px;padding:0 12px;border:1px solid #e4e0d8;border-radius:100px;background:#faf8f4;color:#6f7686;font-size:.76rem;font-weight:700;cursor:pointer;font-family:inherit}
.adt-ptype-chip:hover{border-color:#b8923a;color:#8a6d1f}
@media(max-width:560px){.adt-ptype{grid-template-columns:1fr}}
.adt-sec{margin-top:22px}
.adt-sec-t{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8a8578;margin-bottom:12px}
.adt-secnote{font-size:.76rem;color:#9aa1af;margin:-6px 0 12px;line-height:1.45}
.adt-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
.adt-fld{display:flex;flex-direction:column;gap:5px;min-width:0}
.adt-fld.full{grid-column:1/-1}
.adt-fld span{font-size:.72rem;font-weight:700;color:#5b6275}
.adt-fld em{font-style:normal;color:#9aa1af;font-weight:500}
.adt-fld input,.adt-fld select,.adt-fld textarea{border:1px solid #d9d4ca;border-radius:9px;background:#faf8f4;color:#0B0F1A;padding:10px 12px;font-size:.92rem;font-family:inherit;outline:none}
.adt-fld input:focus,.adt-fld select:focus,.adt-fld textarea:focus{border-color:var(--gold,#C9A96E);background:#fff}
.adt-secret{position:relative;display:flex}
.adt-secret input{flex:1;width:100%;padding-right:42px}
.adt-secret-eye{position:absolute;right:7px;top:50%;transform:translateY(-50%);border:none;background:none;color:#9aa1af;cursor:pointer;padding:5px;display:flex;align-items:center;border-radius:6px}
.adt-secret-eye:hover{color:#5b6275}
.adt-group{border:1px solid #eee7db;border-radius:12px;overflow:hidden;margin-bottom:10px}
.adt-group-t{font-size:.78rem;font-weight:800;color:#0B0F1A;background:#faf6ee;padding:9px 14px;border-bottom:1px solid #eee7db}
.adt-items{display:flex;flex-direction:column}
.adt-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 14px;border-top:1px solid #f2ede2}
.adt-item:first-child{border-top:none}
.adt-item.picked{background:#fbf7ee}
.adt-item-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.adt-item-name{font-size:.88rem;font-weight:600;color:#0B0F1A}
.adt-item-pts{font-size:.72rem;font-weight:700;color:#a3812f}
.adt-step-ctrl{display:flex;align-items:center;gap:4px;flex-shrink:0}
.adt-qbtn{width:30px;height:30px;border:1px solid #d9d4ca;background:#fff;border-radius:8px;font-size:1.1rem;font-weight:700;color:#5b6275;cursor:pointer;line-height:1;display:grid;place-items:center}
.adt-qbtn:hover:not(:disabled){border-color:var(--gold,#C9A96E);color:#0B0F1A}
.adt-qbtn:disabled{opacity:.4;cursor:default}
.adt-qin{width:42px;height:30px;text-align:center;border:1px solid #d9d4ca;border-radius:8px;font-size:.9rem;font-weight:700;font-family:inherit;background:#fff;color:#0B0F1A;outline:none}
.adt-qin:focus{border-color:var(--gold,#C9A96E)}
.adt-err{margin-top:16px;font-size:.85rem;color:#c0392b;background:#fdecec;border:1px solid #f0c9c9;border-radius:9px;padding:9px 12px}
.adt-bar{position:sticky;bottom:0;margin:22px -26px -20px;padding:14px 26px;background:linear-gradient(#fff0,#fff 22%);border-top:1px solid #eee7db;display:flex;align-items:center;justify-content:space-between;gap:14px;border-radius:0 0 18px 18px}
.adt-bar.end{justify-content:flex-end}
.adt-bar-pts{font-family:'Bricolage Grotesque',sans-serif;font-size:1.5rem;font-weight:800;color:#0B0F1A;line-height:1}
.adt-bar-pts span{font-size:.8rem;color:#8a8578;font-weight:700}
.adt-bar-sub{font-size:.76rem;color:#8a8578;margin-top:2px}
.adt-go{height:46px;padding:0 22px;border:none;border-radius:11px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.92rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.adt-go:hover:not(:disabled){filter:brightness(1.05)}
.adt-go:disabled{opacity:.55;cursor:default}
.adt-go.ghost{background:#fff;border:1px solid #d9d4ca;color:#0B0F1A}
.adt-go.ghost:hover:not(:disabled){border-color:var(--gold,#C9A96E)}
.adt-hero{text-align:center;padding:14px 0 6px}
.adt-hero-ic{width:60px;height:60px;border-radius:16px;display:grid;place-items:center;margin:0 auto 14px}
.adt-hero-ic.sched{background:#eef1f8;color:#3a4a72}
.adt-hero-ic.done{background:#e7f6ec;color:#2f7d5a}
.adt-hero h1{font-family:'Bricolage Grotesque',sans-serif;font-size:1.5rem;font-weight:800;margin:0 0 6px}
.adt-hero p{font-size:.92rem;color:#6f7686;line-height:1.5;margin:0 auto;max-width:46ch}
.adt-recap{border:1px solid #e4e0d8;border-radius:12px;margin-top:20px;overflow:hidden}
.adt-recap-hd{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:#faf6ee;font-size:.78rem;font-weight:800;color:#0B0F1A}
.adt-recap-pts{color:#a3812f}
.adt-recap-list{padding:4px 0}
.adt-recap-row{display:flex;align-items:center;gap:10px;padding:6px 14px;font-size:.86rem}
.adt-recap-q{font-weight:800;color:#a3812f;min-width:28px}
.adt-recap-n{flex:1;color:#0B0F1A}
.adt-recap-p{color:#8a8578;font-weight:600}
.adt-note-line{margin-top:16px;text-align:center;font-size:.82rem;color:#6f7686}
/* shared quote (read-only ADT Tool, cust view) */
.adt-quote{margin-top:18px;border:1px solid #e4e0d8;border-radius:16px;overflow:hidden;background:#fff}
.adt-quote-h{padding:13px 16px;background:#0B0F1A;color:#fff;font-size:.8rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border-bottom:3px solid #C9A96E}
.adt-quote-h span{color:#C9A96E}
.adt-quote-frame{width:100%;height:640px;border:none;display:block;background:#FAF8F4}
/* preferred days + windows */
.adt-quick{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.adt-chip{border:1px solid #d9d4ca;background:#fff;color:#5b6275;border-radius:100px;padding:7px 15px;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.adt-chip:hover{border-color:var(--gold,#C9A96E)}
.adt-chip.on{background:#0B0F1A;color:#fff;border-color:#0B0F1A}
.adt-days{display:grid;grid-template-columns:repeat(7,1fr);gap:7px}
.adt-day{border:1px solid #d9d4ca;background:#faf8f4;color:#5b6275;border-radius:10px;padding:12px 0;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;text-align:center}
.adt-day:hover{border-color:var(--gold,#C9A96E)}
.adt-day.on{background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;border-color:#C9A96E}
.adt-wins{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.adt-win{display:flex;flex-direction:column;gap:2px;align-items:center;border:1px solid #d9d4ca;background:#faf8f4;color:#5b6275;border-radius:11px;padding:13px 8px;cursor:pointer;font-family:inherit}
.adt-win:hover{border-color:var(--gold,#C9A96E)}
.adt-win b{font-size:.9rem;color:#0B0F1A;font-weight:800}
.adt-win span{font-size:.72rem;color:#8a8578}
.adt-win.on{background:#fff8ee;border-color:#C9A96E}
.adt-win.on b{color:#a3812f}
@media(max-width:560px){.adt-grid{grid-template-columns:1fr}.adt-bar{flex-direction:column;align-items:stretch}.adt-bar .adt-go{width:100%}.adt-day{padding:11px 0;font-size:.78rem;border-radius:8px}.adt-days{gap:5px}}
`;
