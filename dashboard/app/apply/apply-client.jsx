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
  { key: "tech",   label: "Technician / Helper", hint: "Install & service CCTV, low-voltage",
    icon: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></> },
  { key: "sales",  label: "Sales", hint: "Walkthroughs, proposals, follow-up",
    icon: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></> },
  { key: "pm",     label: "Project Manager", hint: "Coordinate crews, schedules & clients",
    icon: <><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 14l2 2 4-4"/></> },
  { key: "sub",    label: "Subcontractor", hint: "Crew installs, paid per day",
    icon: <><path d="M2 20h20"/><path d="M4 20V10l8-6 8 6v10"/><path d="M9 20v-6h6v6"/></> },
];
const EXPERIENCE = ["None yet", "Under 1 year", "1–3 years", "3–5 years", "5+ years"];
const AVAILABILITY = [
  { key: "full", label: "Full time" },
  { key: "part", label: "Part time" },
  { key: "weekends", label: "Weekends" },
  { key: "flexible", label: "Flexible" },
];
// The left panel is tailored to the position chosen in step 1 — headline, blurb, pay, and perks.
const PITCH = {
  tech: {
    h: "Build a career keeping people safe.",
    p: "Install and service security systems across NYC & NJ. Paid training — no experience needed.",
    perks: ["Paid hands-on training", "Company van, tools & gear", "Weekly pay, real growth path", "Steady work across NYC & NJ"],
  },
  sales: {
    h: "Sell security. Earn with no ceiling.",
    p: "Run walkthroughs, build proposals, and close across NYC & NJ.",
    perks: ["Uncapped commission", "Residual, recurring pay", "Flexible, hybrid work", "Warm leads & real support"],
  },
  pm: {
    h: "Run the jobs. Grow the team.",
    p: "Coordinate crews, schedules, and clients across NYC & NJ.",
    perks: ["Own the schedule & crews", "Clear path to leadership", "Weekly pay, real growth", "Steady work across NYC & NJ"],
  },
  sub: {
    h: "Run installs on your own terms.",
    p: "Take on CCTV & low-voltage installs across NYC & NJ as a subcontractor.",
    perks: ["Take the jobs you want", "Fast, reliable pay", "Steady volume year-round", "Flexible, hybrid work"],
  },
  // Neutral panel shown until a position is picked.
  none: {
    h: "Build a career keeping people safe.",
    p: "Install, sell, or run security systems across NYC & NJ. Pick the role that fits you.",
    perks: ["Paid hands-on training", "Weekly pay, real growth path", "Steady work across NYC & NJ", "Company van, tools & gear"],
  },
};
const CHECK = <path d="M20 6 9 17l-5-5" />;
const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export default function ApplyClient() {
  const [position, setPosition] = useState("");   // no position pre-selected — the applicant picks
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [experience, setExperience] = useState("1–3 years");
  const [skills, setSkills] = useState("");
  const [hasLicense, setHasLicense] = useState(false);
  const [hasVehicle, setHasVehicle] = useState(false);
  const [hasTools, setHasTools] = useState(false);
  const [availability, setAvailability] = useState("flexible");
  const [startDate, setStartDate] = useState("");
  const [about, setAbout] = useState("");
  const [resume, setResume] = useState(null);   // { name, data, size }
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [step, setStep] = useState(1);          // 1 = job · 2 = your info · 3 = resume

  const STEPS = [
    { n: 1, label: "Position" },
    { n: 2, label: "Your info" },
    { n: 3, label: "Resume" },
  ];

  // Prefill earliest-start with tomorrow (never Sunday) once mounted — keeps SSR/CSR markup identical.
  useEffect(() => { setStartDate((v) => v || nextStartDate()); }, []);

  const titleCase = (s) => String(s).replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  // Live US phone formatting, capped at 10 digits → (646) 000-0000.
  const formatPhone = (v) => {
    // Drop a leading 1 first — no US area code starts with 1, so a leading 1 is always the
    // country code autofill injects, and letting it sit here would push out the real 10th digit.
    const d = String(v || "").replace(/\D/g, "").replace(/^1+/, "").slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  };
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  const pitch = PITCH[position] || PITCH.none;   // left panel tailors to the chosen position

  const RESUME_TYPES = /\.(pdf|docx?|png|jpe?g|heic)$/i;
  function onResume(e) {
    setErr("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!RESUME_TYPES.test(file.name)) { setErr("Resume must be a PDF, Word doc, or image."); e.target.value = ""; return; }
    if (file.size > 4 * 1024 * 1024) { setErr("Resume is too large — keep it under 4 MB."); e.target.value = ""; return; }
    const r = new FileReader();
    r.onload = () => setResume({ name: file.name, data: String(r.result), size: file.size });
    r.readAsDataURL(file);
  }

  // Browser autofill fills the input's DOM value but often skips React's onChange — read the live
  // field value as source of truth. Must run while Step 2 is still mounted (on the → Resume step).
  const domVal = (id, fallback) => (document.getElementById(id)?.value ?? fallback) || fallback;

  // Validate + capture Step 2 before advancing; leaving it unmounts the inputs.
  function captureInfo() {
    const rawName = domVal("ap-name", name);
    const rawPhone = domVal("ap-phone", phone);
    const rawEmail = domVal("ap-email", email);
    const rawDob = domVal("ap-dob", dob);
    const cleanName = titleCase(rawName.trim());
    if (!cleanName) return "Tell us your name.";
    if (rawPhone.replace(/\D/g, "").length < 10) return "Enter a valid phone number (at least 10 digits).";
    if (!emailOk(rawEmail)) return "Enter a valid email address.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDob)) return "Enter your date of birth.";
    const age = (Date.now() - new Date(rawDob + "T00:00:00").getTime()) / (365.25 * 24 * 3600 * 1000);
    if (Number.isNaN(age) || age > 100) return "Check your date of birth.";
    if (age < 18) return "You must be at least 18 to apply.";
    setName(cleanName); setPhone(rawPhone); setEmail(rawEmail); setDob(rawDob);
    return null;
  }

  function next() {
    setErr("");
    if (step === 1 && !position) { setErr("Please pick a position to continue."); return; }
    if (step === 2) { const e = captureInfo(); if (e) { setErr(e); return; } }
    setStep((s) => Math.min(3, s + 1));
  }
  function back() { setErr(""); setStep((s) => Math.max(1, s - 1)); }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    // name/phone/email were captured + validated leaving Step 2; guard anyway.
    const cleanName = titleCase(name.trim());
    if (!cleanName || phone.replace(/\D/g, "").length < 10 || !emailOk(email)) {
      setStep(2); setErr("Please finish your details."); return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName, phone, email, address, position, experience, skills, dob,
          has_license: hasLicense, has_vehicle: hasVehicle, has_tools: hasTools,
          availability, start_date: startDate, about,
          resume_name: resume?.name || "", resume_data: resume?.data || "",
        }),
      });
      const j = await res.json();
      if (j.ok) {
        // The API minted their iot_app grant, so land them straight on their application — the
        // status page shows a one-time toast with the ID + PIN (payload via sessionStorage, never
        // the URL). No interstitial "success page" interrupting the flow.
        try { sessionStorage.setItem("iot_app_welcome", JSON.stringify({ appId: j.appId, pin: j.pin, recovered: !!j.recovered })); } catch {}
        window.location.assign(`/application/${j.appId}`);
        return;
      }
      else if (j.error === "duplicate") {
        setStep(2);
        setErr("You&rsquo;ve already applied with this email. If that&rsquo;s you, enter the same phone and address you used before to pull up your Application ID — or give us a call.".replace(/&rsquo;/g, "’"));
        setBusy(false);
      } else if (j.error === "staff") {
        setStep(2);
        setErr("That email is already registered to an IOT TECHS team member. If you're on the team and need something, reach out to your manager. To apply, use a personal email.");
        setBusy(false);
      } else { setErr(j.error || "Something went wrong."); setBusy(false); }
    } catch (_) { setErr("Connection error. Please try again."); setBusy(false); }
  }

  return (
    <div className="ap-root">
      <div className="ap-shell">
        {/* LEFT — brand / pitch */}
        <aside className="ap-aside">
          <div className="ap-aside-top">
            <a href="/go" className="ap-brand" aria-label="IOT TECHS home"><Wordmark height={26} techsColor="#A8842F" /></a>
            <TaglinePill tone="light" className="ap-aside-pill" />
          </div>
          <div className="ap-aside-body">
            <div className="ap-tag">Careers · Now hiring</div>
            <h1 className="ap-hero-h">{pitch.h}</h1>
            <p className="ap-hero-p">{pitch.p}</p>
            <ul className="ap-perks">
              {pitch.perks.map((t) => (
                <li key={t}><span className="ap-perk-ic"><Icon>{CHECK}</Icon></span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="ap-aside-foot">Applied before? <a href="/application">Track your application →</a></div>
        </aside>

        {/* RIGHT — the form. On success we redirect straight to /application/[id] (the API minted
            their grant); the status page shows the one-time ID+PIN toast, so no success page here. */}
        <main className="ap-main">
          <form className="ap-form" onSubmit={submit}>
              {/* deck-style beacon rail */}
              <div className="ap-rail">
                {STEPS.map((s) => {
                  const mark = step > s.n ? "done" : step === s.n ? "active" : "todo";
                  return (
                    <div key={s.n} className={`ap-seg ${mark}`}>
                      <div className="ap-bar"><i /></div>
                      <div className="ap-lab"><span className="ap-beacon" /><span className="ap-seg-l">{s.n} · {s.label}</span></div>
                    </div>
                  );
                })}
              </div>

              {/* STEP 1 — job */}
              {step === 1 && (
                <div className="ap-pane">
                  <div className="ap-form-head"><h2>What are you applying for?</h2></div>
                  <div className="ap-grid2">
                    {POSITIONS.map((p) => (
                      <button type="button" key={p.key} className={`ap-pick${position === p.key ? " on" : ""}`} onClick={() => { setPosition(p.key); setErr(""); }}>
                        <span className="ap-pick-ic"><Icon>{p.icon}</Icon></span>
                        <span className="ap-pick-tx"><span className="ap-pick-t">{p.label}</span><span className="ap-pick-h">{p.hint}</span></span>
                        <span className="ap-pick-dot" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 2 — applicant info */}
              {step === 2 && (
                <div className="ap-pane">
                  <div className="ap-form-head"><h2>Tell us about yourself</h2></div>
                  <div className="ap-two">
                    <div className="ap-fld"><label className="ap-label" htmlFor="ap-name">Full name</label>
                      <input id="ap-name" className="ap-in cap" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && setName(titleCase(name.trim()))} placeholder="Jane Smith" autoComplete="name" /></div>
                    <div className="ap-fld"><label className="ap-label" htmlFor="ap-phone">Phone</label>
                      <input id="ap-phone" className="ap-in" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(646) 000-0000" autoComplete="tel" inputMode="tel" maxLength={14} /></div>
                  </div>
                  <div className="ap-two">
                    <div className="ap-fld"><label className="ap-label" htmlFor="ap-email">Email</label>
                      <input id="ap-email" className="ap-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" /></div>
                    <div className="ap-fld"><label className="ap-label" htmlFor="ap-address">Address</label>
                      <AddressAutocomplete id="ap-address" className="ap-in" value={address} onChange={setAddress} placeholder="Start typing your address…" autoComplete="off" /></div>
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
                  <label className="ap-label">Do you have…</label>
                  <div className="ap-chips">
                    <button type="button" className={`ap-chip check${hasLicense ? " on" : ""}`} onClick={() => setHasLicense((v) => !v)}>Driver&rsquo;s license</button>
                    <button type="button" className={`ap-chip check${hasVehicle ? " on" : ""}`} onClick={() => setHasVehicle((v) => !v)}>Own vehicle</button>
                    <button type="button" className={`ap-chip check${hasTools ? " on" : ""}`} onClick={() => setHasTools((v) => !v)}>Own tools</button>
                  </div>
                  <div className="ap-two">
                    <div className="ap-fld">
                      <label className="ap-label" htmlFor="ap-dob">Date of birth</label>
                      <input id="ap-dob" className="ap-in" type="date" value={dob} onChange={(e) => setDob(e.target.value)} autoComplete="bday" />
                    </div>
                    <div className="ap-fld">
                      <label className="ap-label" htmlFor="ap-start">Earliest start</label>
                      <input id="ap-start" className="ap-in" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3 — resume */}
              {step === 3 && (
                <div className="ap-pane">
                  <div className="ap-form-head"><h2>Add your resume</h2><p className="ap-sub">Optional — you can submit without one and add it later.</p></div>
                  {resume ? (
                    <div className="ap-file">
                      <span className="ap-file-ic"><Icon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Icon></span>
                      <span className="ap-file-nm">{resume.name}</span>
                      <span className="ap-file-sz">{resume.size >= 1024 * 1024 ? (resume.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(resume.size / 1024)) + " KB"}</span>
                      <button type="button" className="ap-file-x" onClick={() => setResume(null)} aria-label="Remove resume">✕</button>
                    </div>
                  ) : (
                    <label className="ap-upload ap-upload-lg">
                      <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={onResume} hidden />
                      <span className="ap-upload-ic"><Icon><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></Icon></span>
                      <span className="ap-upload-tx"><b>Upload resume</b><em>PDF, Word, or image · up to 4 MB</em></span>
                    </label>
                  )}
                  <div className="ap-recap">
                    <span className="ap-recap-k">Applying for</span>
                    <span className="ap-recap-v">{(POSITIONS.find((p) => p.key === position) || {}).label}</span>
                  </div>
                  <p className="ap-note">Your PIN is the last 4 digits of your phone — you&rsquo;ll use it with your Application ID to check your status.</p>
                </div>
              )}

              {err && <div className="ap-err">{err}</div>}
              <div className="ap-nav">
                {step > 1 && <button type="button" className="ap-btn ap-btn-ghost" onClick={back}>← Back</button>}
                {step < 3
                  ? <button type="button" className="ap-btn ap-btn-gold" onClick={next}>Continue →</button>
                  : <button type="submit" className="ap-btn ap-btn-gold" disabled={busy}>{busy ? "Sending…" : "Submit application →"}</button>}
              </div>
          </form>
        </main>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
/* Matches the project-page (deck) design system: Instrument Sans (--font-sans, loaded globally),
   warm-paper palette, JetBrains mono for codes. No Bricolage/Hanken — the deck uses one sans. */
.ap-root{--ink:#101418;--ink-soft:#3A4048;--muted:#787D84;--faint:#A1A6AC;--line:#E4E4DF;--line-soft:#EDEDE9;
  --soft:#F4F4F2;--raise:#FBFBFA;--gold:#C9A96E;--gold-hi:#E8CB94;--gold-deep:#A8842F;--green:#2E7D5B;
  min-height:100vh;background:var(--soft);color:var(--ink);font-family:var(--font-sans),'Instrument Sans',ui-sans-serif,system-ui,sans-serif;line-height:1.55}
.ap-shell{min-height:100vh;display:grid;grid-template-columns:minmax(380px,460px) 1fr;background:var(--soft)}

/* ---- left brand panel — deck light treatment (warm paper, ink text, soft gold) ---- */
.ap-aside{position:relative;background:
  radial-gradient(520px 300px at 12% -8%,rgba(201,169,110,.16),transparent 60%),
  linear-gradient(160deg,#FBFBFA 0%,#F1F0EC 100%);
  color:var(--ink);padding:48px 42px;display:flex;flex-direction:column;justify-content:space-between;gap:30px;overflow:hidden;border-right:1px solid var(--line);
  position:sticky;top:0;height:100vh}
.ap-aside::after{content:"";position:absolute;right:-90px;bottom:-90px;width:260px;height:260px;border-radius:50%;
  background:radial-gradient(circle,rgba(201,169,110,.12),transparent 65%)}
.ap-aside-top{display:flex;flex-direction:column;gap:14px;position:relative;z-index:1}
.ap-brand{color:var(--ink);display:inline-flex}
.ap-aside-pill{align-self:flex-start}
.ap-tag{display:inline-block;font-family:var(--font-mono),'JetBrains Mono',ui-monospace,monospace;font-size:.6rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);
  background:rgba(201,169,110,.12);border:1px solid rgba(201,169,110,.34);padding:5px 12px;border-radius:100px;margin-bottom:16px}
.ap-hero-h{font-family:var(--font-sans),'Instrument Sans',sans-serif;font-weight:700;letter-spacing:-.024em;font-size:2rem;line-height:1.08;margin:0 0 12px;color:var(--ink);position:relative;z-index:1}
.ap-hero-p{color:var(--muted);font-size:.95rem;margin:0 0 18px;position:relative;z-index:1;max-width:34ch}
.ap-pay{display:inline-flex;flex-direction:column;gap:2px;align-self:flex-start;margin:0 0 22px;padding:10px 16px;border-radius:12px;
  background:rgba(201,169,110,.10);border:1px solid rgba(201,169,110,.34);color:var(--gold-deep);font-weight:700;font-size:1.02rem;line-height:1.15;position:relative;z-index:1}
.ap-pay-lbl{font-family:var(--font-mono),'JetBrains Mono',ui-monospace,monospace;font-size:.55rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-deep);opacity:.85}
.ap-perks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:13px;position:relative;z-index:1}
.ap-perks li{display:flex;align-items:center;gap:12px;font-size:.92rem;font-weight:500;color:var(--ink-soft)}
.ap-perk-ic{width:32px;height:32px;flex-shrink:0;border-radius:9px;background:rgba(201,169,110,.14);border:1px solid rgba(201,169,110,.28);display:grid;place-items:center;color:var(--gold-deep)}
.ap-perk-ic svg{width:16px;height:16px}
.ap-aside-foot{font-size:.85rem;color:var(--muted);position:relative;z-index:1}
.ap-aside-foot a{color:var(--gold-deep);text-decoration:none;font-weight:600}
.ap-aside-foot a:hover{text-decoration:underline}

/* ---- right form panel — full-height, content centered like the candidate portals ---- */
.ap-main{position:relative;padding:56px 48px;min-height:100vh;display:flex;flex-direction:column;justify-content:center}
.ap-form,.ap-success{width:100%;max-width:560px;margin:0 auto}
.ap-form-head{margin-bottom:8px}
.ap-form-head h2,.ap-success h2{font-family:var(--font-sans),'Instrument Sans',sans-serif;font-weight:700;letter-spacing:-.024em;font-size:1.45rem;margin:0 0 5px}
.ap-sub{color:var(--muted);margin:0;font-size:.92rem}
.ap-label{display:block;font-weight:700;font-size:.82rem;margin:20px 0 9px;color:#2a3040}
.ap-opt{font-weight:500;color:var(--muted)}
.ap-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ap-pick{position:relative;display:flex;align-items:center;gap:12px;text-align:left;padding:14px 15px 14px 16px;border:1px solid var(--line);border-left:3px solid var(--line);border-radius:12px;background:var(--raise);cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s}
.ap-pick:hover{border-color:#D9CBA9;background:#fff}
.ap-pick.on{border-color:var(--gold);border-left-color:var(--gold-deep);background:#FBF7EE}
.ap-pick-ic{width:34px;height:34px;flex-shrink:0;border-radius:9px;background:color-mix(in srgb,var(--gold) 12%,#fff);border:1px solid color-mix(in srgb,var(--gold) 26%,transparent);display:grid;place-items:center;color:var(--gold-deep);transition:.15s}
.ap-pick-ic svg{width:17px;height:17px}
.ap-pick.on .ap-pick-ic{background:color-mix(in srgb,var(--gold) 20%,#fff)}
.ap-pick-tx{display:flex;flex-direction:column;min-width:0;flex:1}
.ap-pick-t{font-weight:600;font-size:.93rem;letter-spacing:-.012em}
.ap-pick-h{font-size:.75rem;color:var(--muted);line-height:1.25}
.ap-pick-dot{width:8px;height:8px;border-radius:99px;border:1.5px solid var(--faint);flex-shrink:0;transition:.15s}
.ap-pick.on .ap-pick-dot{border-color:var(--gold-deep);background:var(--gold)}
.ap-in{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:11px;font-family:inherit;font-size:16px;background:#fff;color:var(--ink);transition:border-color .15s,box-shadow .15s}
.ap-in:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,169,110,.14)}
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
.ap-chip{font-size:.82rem;font-weight:600;color:var(--ink-soft);background:var(--raise);border:1px solid var(--line);border-radius:100px;padding:8px 15px;cursor:pointer;font-family:inherit;transition:border-color .12s,background .12s,color .12s}
.ap-chip:hover{border-color:var(--gold)}
.ap-chip.on{background:var(--gold);border-color:var(--gold-deep);color:var(--ink)}
.ap-chip.check.on::before{content:"✓ ";font-weight:800}
.ap-err{margin-top:16px;color:#c9382b;background:#fdecec;border:1px solid #f2c4c4;border-radius:11px;padding:10px 13px;font-size:.88rem;font-weight:600}
.ap-btn{display:inline-flex;align-items:center;justify-content:center;font-weight:800;border-radius:12px;cursor:pointer;border:none;font-size:.96rem;font-family:inherit;text-decoration:none;transition:transform .15s,box-shadow .2s,background .2s}
.ap-btn-gold{background:linear-gradient(180deg,var(--gold-hi),var(--gold));color:#0e1320;padding:15px 26px}
.ap-btn-gold:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 16px 30px -12px rgba(176,143,79,.7)}
.ap-btn-gold:disabled{opacity:.6;cursor:default}
.ap-btn-ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);padding:14px 24px}
.ap-btn-ghost:hover{border-color:var(--ink)}
.ap-submit{width:100%;margin-top:24px}
.ap-note{text-align:center;color:var(--muted);font-size:.8rem;margin:16px 0 0}
/* ---- wizard: deck-style beacon rail (thin fill bar + blinking beacon + mono label) ---- */
.ap-rail{display:flex;gap:8px;margin-bottom:26px}
.ap-seg{flex:1;min-width:0;display:flex;flex-direction:column}
.ap-bar{height:2px;border-radius:99px;background:var(--line);overflow:hidden;position:relative}
.ap-bar i{position:absolute;inset:0;width:0;background:var(--gold);border-radius:99px;transition:width .7s cubic-bezier(.16,1,.3,1)}
.ap-seg.done .ap-bar i,.ap-seg.active .ap-bar i{width:100%}
.ap-seg.active .ap-bar i{background:var(--gold-deep)}
.ap-lab{margin-top:9px;display:flex;align-items:center;gap:7px;font-family:var(--font-mono),'JetBrains Mono',ui-monospace,monospace;font-size:.6rem;letter-spacing:.13em;text-transform:uppercase;color:var(--faint);white-space:nowrap;overflow:hidden}
.ap-seg-l{overflow:hidden;text-overflow:ellipsis}
.ap-seg.active .ap-lab,.ap-seg.done .ap-lab{color:var(--ink-soft)}
.ap-beacon{width:7px;height:7px;flex:0 0 auto;border-radius:99px;background:#fff;border:1.5px solid var(--faint)}
.ap-seg.done .ap-beacon{background:var(--gold);border-color:var(--gold-deep)}
.ap-seg.active .ap-beacon{background:var(--gold);border-color:var(--gold-deep);animation:apBeacon 1.1s ease-in-out infinite}
@keyframes apBeacon{0%,100%{box-shadow:0 0 0 0 rgba(201,169,110,.55)}55%{box-shadow:0 0 0 4px rgba(201,169,110,0)}}
.ap-pane{animation:apFade .22s ease}
@keyframes apFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.ap-nav{display:flex;gap:10px;margin-top:26px}
.ap-nav .ap-btn{flex:1}
.ap-upload-lg{padding:30px 18px;flex-direction:column;text-align:center}
.ap-upload-lg .ap-upload-ic{width:48px;height:48px}
.ap-upload-lg .ap-upload-ic svg{width:22px;height:22px}
.ap-recap{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding:13px 16px;background:var(--raise);border-radius:12px;border:1px solid var(--line)}
.ap-recap-k{font-family:var(--font-mono),'JetBrains Mono',ui-monospace,monospace;font-size:.58rem;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.12em}
.ap-recap-v{font-weight:600;font-size:.92rem}
.mono{font-family:var(--font-mono),'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;letter-spacing:.5px}
/* (the old post-submit success screen was replaced by a redirect to /application/[id] + toast) */
@media(max-width:840px){
  .ap-shell{grid-template-columns:1fr}
  .ap-aside{position:static;height:auto;padding:28px 24px 24px;justify-content:flex-start;gap:18px}
  .ap-hero-h{font-size:1.6rem}
  .ap-perks{display:none}
  .ap-hero-p{margin-bottom:4px}
  .ap-main{padding:32px 22px 52px;min-height:auto;justify-content:flex-start}
}
@media(max-width:520px){
  .ap-grid2,.ap-two{grid-template-columns:1fr}
  /* Stack the toggle chips full-width so a selection's ✓ never reflows them onto another line. */
  .ap-chips{flex-direction:column;align-items:stretch}
  .ap-chip{text-align:left}
}
`;
