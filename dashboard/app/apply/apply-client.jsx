"use client";

import { useState, useEffect } from "react";
import { Wordmark, TaglinePill } from "../components/brand";
import AddressAutocomplete from "../components/address-autocomplete";

// Default earliest-start = tomorrow, but never a Sunday (skip to Monday). Local date parts,
// not toISOString, so it doesn't slip a day near midnight.
function nextStartDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // Sunday → Monday
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const POSITIONS = [
  { key: "tech",   label: "Technician", hint: "Install & service CCTV, low-voltage",
    icon: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></> },
  { key: "sales",  label: "Sales", hint: "Walkthroughs, proposals, follow-up",
    icon: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></> },
  { key: "pm",     label: "Project Manager", hint: "Coordinate crews, schedules & clients",
    icon: <><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></> },
  { key: "helper", label: "Helper / part time", hint: "Pull cable, mount, assist the lead",
    icon: <><path d="M2 20h20"/><path d="M4 20V10l8-6 8 6v10"/><path d="M9 20v-6h6v6"/></> },
];
const EXPERIENCE = ["None yet", "Under 1 year", "1–3 years", "3–5 years", "5+ years"];
const AVAILABILITY = [
  { key: "full", label: "Full time" },
  { key: "part", label: "Part time" },
  { key: "weekends", label: "Weekends" },
  { key: "flexible", label: "Flexible" },
];
const PERKS = [
  { t: "Paid hands-on training", i: <><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5"/></> },
  { t: "Company van, tools & gear", i: <><rect x="1" y="6" width="13" height="10" rx="1"/><path d="M14 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></> },
  { t: "Weekly pay, real growth path", i: <><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></> },
  { t: "Steady work across NYC & NJ", i: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></> },
];
const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export default function ApplyClient() {
  const [position, setPosition] = useState("tech");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [experience, setExperience] = useState("1–3 years");
  const [skills, setSkills] = useState("");
  const [hasLicense, setHasLicense] = useState(false);
  const [hasVehicle, setHasVehicle] = useState(false);
  const [hasTools, setHasTools] = useState(false);
  const [availability, setAvailability] = useState("full");
  const [startDate, setStartDate] = useState("");
  const [about, setAbout] = useState("");
  const [resume, setResume] = useState(null);   // { name, data, size }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  // Prefill earliest-start with tomorrow (never Sunday) once mounted — keeps SSR/CSR markup identical.
  useEffect(() => { setStartDate((v) => v || nextStartDate()); }, []);

  const titleCase = (s) => String(s).replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

  const RESUME_TYPES = /\.(pdf|docx?|png|jpe?g|heic)$/i;
  function onResume(e) {
    setErr("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!RESUME_TYPES.test(file.name)) { setErr("Résumé must be a PDF, Word doc, or image."); e.target.value = ""; return; }
    if (file.size > 4 * 1024 * 1024) { setErr("Résumé is too large — keep it under 4 MB."); e.target.value = ""; return; }
    const r = new FileReader();
    r.onload = () => setResume({ name: file.name, data: String(r.result), size: file.size });
    r.readAsDataURL(file);
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    // Browser autofill fills the input's DOM value but often skips React's onChange, leaving
    // state empty — so read the live field values as source of truth, falling back to state.
    const form = e.currentTarget;
    const domVal = (id, fallback) => (form?.querySelector("#" + id)?.value ?? fallback) || fallback;
    const rawName = domVal("ap-name", name);
    const rawPhone = domVal("ap-phone", phone);
    const rawEmail = domVal("ap-email", email);
    if (rawName !== name) setName(rawName);
    if (rawPhone !== phone) setPhone(rawPhone);
    if (rawEmail !== email) setEmail(rawEmail);

    const cleanName = titleCase(rawName.trim());
    if (!cleanName) { setErr("Tell us your name."); return; }
    if (rawPhone.replace(/\D/g, "").length < 10) { setErr("Enter a valid phone number (at least 10 digits)."); return; }
    if (!emailOk(rawEmail)) { setErr("Enter a valid email address."); return; }
    setName(cleanName);
    setBusy(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName, phone: rawPhone, email: rawEmail, address, position, experience, skills,
          has_license: hasLicense, has_vehicle: hasVehicle, has_tools: hasTools,
          availability, start_date: startDate, about,
          resume_name: resume?.name || "", resume_data: resume?.data || "",
        }),
      });
      const j = await res.json();
      if (j.ok) setDone({ appId: j.appId, pin: j.pin, name: j.name });
      else { setErr(j.error || "Something went wrong."); setBusy(false); }
    } catch (_) { setErr("Connection error. Please try again."); setBusy(false); }
  }

  return (
    <div className="ap-root">
      <div className="ap-shell">
        {/* LEFT — brand / pitch */}
        <aside className="ap-aside">
          <div className="ap-aside-top">
            <a href="/" className="ap-brand" aria-label="IOT TECHS home"><Wordmark height={26} style={{ color: "#fff" }} techsColor="#E8CB94" /></a>
            <TaglinePill tone="dark" className="ap-aside-pill" />
          </div>
          <div className="ap-aside-body">
            <div className="ap-tag">Careers · Now hiring</div>
            <h1 className="ap-hero-h">Build a career keeping people safe.</h1>
            <p className="ap-hero-p">We install and service security systems across NYC &amp; NJ. No résumé needed — this takes about two minutes.</p>
            <ul className="ap-perks">
              {PERKS.map((p) => (
                <li key={p.t}><span className="ap-perk-ic"><Icon>{p.i}</Icon></span>{p.t}</li>
              ))}
            </ul>
          </div>
          <div className="ap-aside-foot">Applied before? <a href="/application">Track your application →</a></div>
        </aside>

        {/* RIGHT — form or success */}
        <main className="ap-main">
          <a href="/" className="ap-x" aria-label="Close">✕</a>
          {done ? (
            <div className="ap-success">
              <div className="ap-check"><Icon><path d="M20 6 9 17l-5-5" /></Icon></div>
              <h2>Application received{done.name ? `, ${done.name}` : ""}.</h2>
              <p className="ap-sub">We review every application. Track yours anytime with the ID and PIN below.</p>
              <div className="ap-ticket">
                <div className="ap-ticket-row"><span className="ap-ticket-lbl">Application ID</span><span className="ap-ticket-val mono">{done.appId}</span></div>
                <div className="ap-ticket-row"><span className="ap-ticket-lbl">Your PIN</span><span className="ap-ticket-val mono">{done.pin || "—"}</span></div>
              </div>
              <div className="ap-actions">
                <a className="ap-btn ap-btn-gold" href={`/application/${done.appId}`}>Track my application</a>
                <a className="ap-btn ap-btn-ghost" href="/">Back to home</a>
              </div>
            </div>
          ) : (
            <form className="ap-form" onSubmit={submit}>
              <div className="ap-form-head">
                <h2>Tell us about yourself</h2>
                <p className="ap-sub">The starred basics are all we need to reach you.</p>
              </div>

              <label className="ap-label">What are you applying for?</label>
              <div className="ap-grid2">
                {POSITIONS.map((p) => (
                  <button type="button" key={p.key} className={`ap-pick${position === p.key ? " on" : ""}`} onClick={() => setPosition(p.key)}>
                    <span className="ap-pick-ic"><Icon>{p.icon}</Icon></span>
                    <span className="ap-pick-tx"><span className="ap-pick-t">{p.label}</span><span className="ap-pick-h">{p.hint}</span></span>
                    <span className="ap-pick-dot" aria-hidden="true" />
                  </button>
                ))}
              </div>

              <div className="ap-two">
                <div className="ap-fld"><label className="ap-label" htmlFor="ap-name">Full name</label>
                  <input id="ap-name" className="ap-in cap" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && setName(titleCase(name.trim()))} placeholder="Jane Smith" autoComplete="name" /></div>
                <div className="ap-fld"><label className="ap-label" htmlFor="ap-phone">Phone</label>
                  <input id="ap-phone" className="ap-in" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(646) 000-0000" autoComplete="tel" inputMode="tel" /></div>
              </div>
              <div className="ap-two">
                <div className="ap-fld"><label className="ap-label" htmlFor="ap-email">Email</label>
                  <input id="ap-email" className="ap-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" /></div>
                <div className="ap-fld"><label className="ap-label" htmlFor="ap-addr">Where are you based? <span className="ap-opt">(optional)</span></label>
                  <AddressAutocomplete id="ap-addr" className="ap-in" value={address} onChange={setAddress} placeholder="Start typing your town…" /></div>
              </div>

              <div className="ap-two">
                <div className="ap-fld"><label className="ap-label" htmlFor="ap-exp">Experience</label>
                  <select id="ap-exp" className="ap-in ap-sel" value={experience} onChange={(e) => setExperience(e.target.value)}>
                    {EXPERIENCE.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select></div>
                <div className="ap-fld"><label className="ap-label" htmlFor="ap-avail">Availability</label>
                  <select id="ap-avail" className="ap-in ap-sel" value={availability} onChange={(e) => setAvailability(e.target.value)}>
                    {AVAILABILITY.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select></div>
              </div>

              <label className="ap-label">Résumé <span className="ap-opt">(optional)</span></label>
              {resume ? (
                <div className="ap-file">
                  <span className="ap-file-ic"><Icon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Icon></span>
                  <span className="ap-file-nm">{resume.name}</span>
                  <span className="ap-file-sz">{resume.size >= 1024 * 1024 ? (resume.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(resume.size / 1024)) + " KB"}</span>
                  <button type="button" className="ap-file-x" onClick={() => setResume(null)} aria-label="Remove résumé">✕</button>
                </div>
              ) : (
                <label className="ap-upload">
                  <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={onResume} hidden />
                  <span className="ap-upload-ic"><Icon><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></Icon></span>
                  <span className="ap-upload-tx"><b>Upload résumé</b><em>PDF, Word, or image · up to 4 MB</em></span>
                </label>
              )}

              <label className="ap-label">Do you have…</label>
              <div className="ap-chips">
                <button type="button" className={`ap-chip check${hasLicense ? " on" : ""}`} onClick={() => setHasLicense((v) => !v)}>Driver&rsquo;s license</button>
                <button type="button" className={`ap-chip check${hasVehicle ? " on" : ""}`} onClick={() => setHasVehicle((v) => !v)}>Own vehicle</button>
                <button type="button" className={`ap-chip check${hasTools ? " on" : ""}`} onClick={() => setHasTools((v) => !v)}>Own tools</button>
              </div>

              <div className="ap-fld">
                <label className="ap-label" htmlFor="ap-start">Earliest start</label>
                <input id="ap-start" className="ap-in" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>

              {err && <div className="ap-err">{err}</div>}
              <button className="ap-btn ap-btn-gold ap-submit" type="submit" disabled={busy}>{busy ? "Sending…" : "Submit application →"}</button>
              <p className="ap-note">Your PIN is the last 4 digits of your phone — you&rsquo;ll use it with your Application ID to check your status.</p>
            </form>
          )}
        </main>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap');
.ap-root{--ink:#0e1320;--muted:#5b6275;--line:#e6e8ee;--soft:#f5f6f9;--gold:#C9A96E;--gold-hi:#E8CB94;--gold-deep:#b08f4f;
  min-height:100vh;background:#eceef3;color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;line-height:1.55;
  display:flex;align-items:center;justify-content:center;padding:26px 18px}
.ap-shell{width:100%;max-width:1060px;display:grid;grid-template-columns:400px 1fr;background:#fff;border-radius:26px;overflow:hidden;
  box-shadow:0 40px 100px -40px rgba(14,19,32,.5)}

/* ---- left brand panel ---- */
.ap-aside{position:relative;background:
  radial-gradient(600px 300px at 15% 0%,rgba(201,169,110,.22),transparent 60%),
  linear-gradient(160deg,#141a2b 0%,#0b0f1a 70%);
  color:#fff;padding:34px 32px;display:flex;flex-direction:column;justify-content:space-between;gap:28px;overflow:hidden}
.ap-aside::after{content:"";position:absolute;right:-80px;bottom:-80px;width:260px;height:260px;border-radius:50%;
  background:radial-gradient(circle,rgba(201,169,110,.16),transparent 65%)}
.ap-aside-top{display:flex;flex-direction:column;gap:14px;position:relative;z-index:1}
.ap-aside-pill{align-self:flex-start}
.ap-tag{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-hi);
  background:rgba(201,169,110,.14);border:1px solid rgba(201,169,110,.3);padding:5px 12px;border-radius:100px;margin-bottom:16px}
.ap-hero-h{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:2rem;line-height:1.08;margin:0 0 12px;position:relative;z-index:1}
.ap-hero-p{color:#b9c0d0;font-size:.95rem;margin:0 0 24px;position:relative;z-index:1;max-width:34ch}
.ap-perks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:13px;position:relative;z-index:1}
.ap-perks li{display:flex;align-items:center;gap:12px;font-size:.92rem;font-weight:600;color:#e7eaf1}
.ap-perk-ic{width:34px;height:34px;flex-shrink:0;border-radius:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);display:grid;place-items:center;color:var(--gold-hi)}
.ap-perk-ic svg{width:17px;height:17px}
.ap-aside-foot{font-size:.85rem;color:#9aa2b4;position:relative;z-index:1}
.ap-aside-foot a{color:var(--gold-hi);text-decoration:none;font-weight:700}
.ap-aside-foot a:hover{text-decoration:underline}

/* ---- right form panel ---- */
.ap-main{position:relative;padding:34px 38px;max-height:92vh;overflow-y:auto}
.ap-x{position:absolute;top:20px;right:22px;color:var(--muted);text-decoration:none;font-size:1rem;width:32px;height:32px;display:grid;place-items:center;border-radius:9px;z-index:2}
.ap-x:hover{background:var(--soft);color:var(--ink)}
.ap-form-head{margin-bottom:8px}
.ap-form-head h2,.ap-success h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.01em;font-size:1.5rem;margin:0 0 5px}
.ap-sub{color:var(--muted);margin:0;font-size:.92rem}
.ap-label{display:block;font-weight:700;font-size:.82rem;margin:20px 0 9px;color:#2a3040}
.ap-opt{font-weight:500;color:var(--muted)}
.ap-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ap-pick{position:relative;display:flex;align-items:center;gap:11px;text-align:left;padding:13px 14px;border:1.5px solid var(--line);border-radius:14px;background:#fff;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s,box-shadow .15s}
.ap-pick:hover{border-color:#d6c091;background:#fffdf8}
.ap-pick.on{border-color:var(--gold);background:#fdfaf2;box-shadow:0 0 0 3px rgba(201,169,110,.16)}
.ap-pick-ic{width:36px;height:36px;flex-shrink:0;border-radius:10px;background:var(--soft);display:grid;place-items:center;color:var(--muted);transition:background .15s,color .15s}
.ap-pick-ic svg{width:18px;height:18px}
.ap-pick.on .ap-pick-ic{background:#f3e6c9;color:var(--gold-deep)}
.ap-pick-tx{display:flex;flex-direction:column;min-width:0;flex:1}
.ap-pick-t{font-weight:800;font-size:.92rem}
.ap-pick-h{font-size:.74rem;color:var(--muted);line-height:1.25}
.ap-pick-dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--line);flex-shrink:0;transition:.15s}
.ap-pick.on .ap-pick-dot{border-color:var(--gold);background:var(--gold);box-shadow:inset 0 0 0 3px #fff}
.ap-in{width:100%;padding:12px 14px;border:1.5px solid var(--line);border-radius:12px;font-family:inherit;font-size:.94rem;background:var(--soft);color:var(--ink);transition:border-color .15s,background .15s,box-shadow .15s}
.ap-in:focus{outline:none;border-color:var(--gold);background:#fff;box-shadow:0 0 0 3px rgba(201,169,110,.14)}
.ap-in.cap{text-transform:capitalize}
textarea.ap-in{resize:vertical}
.ap-sel{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:38px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235b6275' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 13px center}
.ap-upload{display:flex;align-items:center;gap:13px;padding:13px 15px;border:1.5px dashed var(--line);border-radius:12px;background:var(--soft);cursor:pointer;transition:border-color .15s,background .15s}
.ap-upload:hover{border-color:var(--gold);background:#fffdf8}
.ap-upload-ic{width:38px;height:38px;flex-shrink:0;border-radius:10px;background:#fff;border:1px solid var(--line);display:grid;place-items:center;color:var(--gold-deep)}
.ap-upload-ic svg{width:18px;height:18px}
.ap-upload-tx{display:flex;flex-direction:column;line-height:1.3}
.ap-upload-tx b{font-size:.9rem;font-weight:800}
.ap-upload-tx em{font-style:normal;font-size:.76rem;color:var(--muted)}
.ap-file{display:flex;align-items:center;gap:11px;padding:11px 14px;border:1.5px solid var(--gold);border-radius:12px;background:#fdfaf2}
.ap-file-ic{width:34px;height:34px;flex-shrink:0;border-radius:9px;background:#f3e6c9;display:grid;place-items:center;color:var(--gold-deep)}
.ap-file-ic svg{width:16px;height:16px}
.ap-file-nm{flex:1;min-width:0;font-weight:700;font-size:.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-file-sz{font-size:.76rem;color:var(--muted);flex-shrink:0}
.ap-file-x{flex-shrink:0;width:26px;height:26px;border:none;background:#fff;border-radius:7px;color:var(--muted);cursor:pointer;font-size:.8rem}
.ap-file-x:hover{background:#fdecec;color:#c0392b}
.ap-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ap-fld{min-width:0}
.ap-chips{display:flex;flex-wrap:wrap;gap:8px}
.ap-chip{font-size:.82rem;font-weight:700;color:#3a4050;background:#fff;border:1.5px solid var(--line);border-radius:100px;padding:8px 15px;cursor:pointer;font-family:inherit;transition:border-color .12s,background .12s,color .12s}
.ap-chip:hover{border-color:var(--gold)}
.ap-chip.on{background:var(--gold);border-color:var(--gold);color:#fff}
.ap-chip.check.on::before{content:"✓ ";font-weight:900}
.ap-err{margin-top:16px;color:#c9382b;background:#fdecec;border:1px solid #f2c4c4;border-radius:11px;padding:10px 13px;font-size:.88rem;font-weight:600}
.ap-btn{display:inline-flex;align-items:center;justify-content:center;font-weight:800;border-radius:12px;cursor:pointer;border:none;font-size:.96rem;font-family:inherit;text-decoration:none;transition:transform .15s,box-shadow .2s,background .2s}
.ap-btn-gold{background:linear-gradient(180deg,var(--gold-hi),var(--gold));color:#0e1320;padding:15px 26px}
.ap-btn-gold:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 16px 30px -12px rgba(176,143,79,.7)}
.ap-btn-gold:disabled{opacity:.6;cursor:default}
.ap-btn-ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);padding:14px 24px}
.ap-btn-ghost:hover{border-color:var(--ink)}
.ap-submit{width:100%;margin-top:24px}
.ap-note{text-align:center;color:var(--muted);font-size:.8rem;margin:12px 0 0}
.mono{font-family:Menlo,Consolas,monospace;letter-spacing:.5px}
/* success */
.ap-success{text-align:center;padding:26px 4px}
.ap-check{width:64px;height:64px;border-radius:50%;background:#e7f6ec;display:grid;place-items:center;margin:0 auto 16px}
.ap-check svg{width:30px;height:30px;color:#1c8a45;stroke-width:2.6}
.ap-ticket{background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:6px 18px;margin:22px 0;text-align:left}
.ap-ticket-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0}
.ap-ticket-row+.ap-ticket-row{border-top:1px dashed var(--line)}
.ap-ticket-lbl{color:var(--muted);font-weight:600;font-size:.9rem}
.ap-ticket-val{font-weight:800;font-size:1.2rem}
.ap-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
@media(max-width:840px){
  .ap-root{padding:0;background:#fff}
  .ap-shell{grid-template-columns:1fr;max-width:560px;border-radius:0;box-shadow:none;min-height:100vh}
  .ap-aside{padding:26px 24px 24px}
  .ap-hero-h{font-size:1.6rem}
  .ap-perks{display:none}
  .ap-hero-p{margin-bottom:4px}
  .ap-main{padding:26px 22px 44px;max-height:none}
}
@media(max-width:520px){.ap-grid2,.ap-two{grid-template-columns:1fr}}
`;
