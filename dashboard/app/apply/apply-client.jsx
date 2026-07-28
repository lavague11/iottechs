"use client";

import { useState } from "react";
import { Wordmark } from "../components/brand";
import AddressAutocomplete from "../components/address-autocomplete";

const POSITIONS = [
  { key: "tech", label: "Technician", hint: "Install & service CCTV, low-voltage" },
  { key: "installer", label: "Installer / helper", hint: "Pull cable, mount, assist the lead" },
  { key: "sales", label: "Sales", hint: "Walkthroughs, proposals, follow-up" },
  { key: "office", label: "Office / dispatch", hint: "Scheduling, customers, paperwork" },
];
const EXPERIENCE = ["None yet", "Under 1 year", "1–3 years", "3–5 years", "5+ years"];
const AVAILABILITY = [
  { key: "full", label: "Full time" },
  { key: "part", label: "Part time" },
  { key: "weekends", label: "Weekends" },
  { key: "flexible", label: "Flexible" },
];

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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!name.trim()) { setErr("Tell us your name."); return; }
    if (!phone.trim()) { setErr("We need a phone number — it also becomes your tracking PIN."); return; }
    if (!email.trim() || !email.includes("@")) { setErr("We need your email — that's how we send offers and set up your login."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, phone, email, address, position, experience, skills,
          has_license: hasLicense, has_vehicle: hasVehicle, has_tools: hasTools,
          availability, start_date: startDate, about,
        }),
      });
      const j = await res.json();
      if (j.ok) setDone({ appId: j.appId, pin: j.pin, name: j.name });
      else { setErr(j.error || "Something went wrong."); setBusy(false); }
    } catch (_) { setErr("Connection error. Please try again."); setBusy(false); }
  }

  return (
    <div className="ap-root">
      <header className="ap-top">
        <a href="/" className="ap-brand" aria-label="IOT TECHS home"><Wordmark height={24} /></a>
        <a href="/" className="ap-x" aria-label="Close">✕</a>
      </header>

      <main className="ap-main">
        {done ? (
          <div className="ap-card ap-success">
            <div className="ap-check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg></div>
            <h1>Application received{done.name ? `, ${done.name}` : ""}.</h1>
            <p className="ap-sub">We review every application. Track yours anytime with the ID and PIN below — you&rsquo;ll see exactly where it stands.</p>
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
          <form className="ap-card" onSubmit={submit}>
            <div className="ap-tag">Join the team</div>
            <h1>Work with IOT TECHS.</h1>
            <p className="ap-sub">We install and service security systems across NYC and NJ. Tell us about yourself — it takes about two minutes.</p>

            <label className="ap-label">What are you applying for?</label>
            <div className="ap-grid2">
              {POSITIONS.map((p) => (
                <button type="button" key={p.key} className={`ap-pick${position === p.key ? " on" : ""}`} onClick={() => setPosition(p.key)}>
                  <span className="ap-pick-t">{p.label}</span>
                  <span className="ap-pick-h">{p.hint}</span>
                </button>
              ))}
            </div>

            <div className="ap-two">
              <div><label className="ap-label" htmlFor="ap-name">Full name</label>
                <input id="ap-name" className="ap-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" autoComplete="name" /></div>
              <div><label className="ap-label" htmlFor="ap-phone">Phone</label>
                <input id="ap-phone" className="ap-in" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(646) 000-0000" autoComplete="tel" /></div>
            </div>
            <div className="ap-two">
              <div><label className="ap-label" htmlFor="ap-email">Email</label>
                <input id="ap-email" className="ap-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" /></div>
              <div><label className="ap-label" htmlFor="ap-addr">Where are you based? <span className="ap-opt">(optional)</span></label>
                <AddressAutocomplete id="ap-addr" className="ap-in" value={address} onChange={setAddress} placeholder="Start typing your town or address…" /></div>
            </div>

            <label className="ap-label">Experience in this kind of work</label>
            <div className="ap-chips">
              {EXPERIENCE.map((x) => (
                <button type="button" key={x} className={`ap-chip${experience === x ? " on" : ""}`} onClick={() => setExperience(x)}>{x}</button>
              ))}
            </div>

            <label className="ap-label" htmlFor="ap-skills">Systems or certifications you&rsquo;ve worked with <span className="ap-opt">(optional)</span></label>
            <textarea id="ap-skills" className="ap-in" rows={2} value={skills} onChange={(e) => setSkills(e.target.value)}
              placeholder="e.g. Hikvision, Dahua, Cat6 termination, OSHA 30, lift certified" />

            <label className="ap-label">Do you have…</label>
            <div className="ap-chips">
              <button type="button" className={`ap-chip${hasLicense ? " on" : ""}`} onClick={() => setHasLicense((v) => !v)}>Driver&rsquo;s license</button>
              <button type="button" className={`ap-chip${hasVehicle ? " on" : ""}`} onClick={() => setHasVehicle((v) => !v)}>Own vehicle</button>
              <button type="button" className={`ap-chip${hasTools ? " on" : ""}`} onClick={() => setHasTools((v) => !v)}>Own tools</button>
            </div>

            <div className="ap-two">
              <div>
                <label className="ap-label">Availability</label>
                <div className="ap-chips">
                  {AVAILABILITY.map((a) => (
                    <button type="button" key={a.key} className={`ap-chip${availability === a.key ? " on" : ""}`} onClick={() => setAvailability(a.key)}>{a.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="ap-label" htmlFor="ap-start">Earliest start <span className="ap-opt">(optional)</span></label>
                <input id="ap-start" className="ap-in" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
            </div>

            <label className="ap-label" htmlFor="ap-about">Anything else we should know? <span className="ap-opt">(optional)</span></label>
            <textarea id="ap-about" className="ap-in" rows={3} value={about} onChange={(e) => setAbout(e.target.value)}
              placeholder="Tell us a bit about your background and why you're interested." />

            {err && <div className="ap-err">{err}</div>}
            <button className="ap-btn ap-btn-gold ap-submit" type="submit" disabled={busy}>{busy ? "Sending…" : "Submit application"}</button>
            <p className="ap-note">Your PIN is the last 4 digits of your phone — you&rsquo;ll use it with your Application ID to check your status.</p>
          </form>
        )}
      </main>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
.ap-root{--bg:#fff;--bg-soft:#f6f7f9;--ink:#0e1320;--muted:#5b6275;--line:#e6e8ee;--gold:#C9A96E;--gold-deep:#b08f4f;
  min-height:100vh;background:radial-gradient(1200px 500px at 50% -10%,#f0f2f7 0%,#fff 60%);color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;line-height:1.55}
.ap-top{display:flex;align-items:center;justify-content:space-between;max-width:680px;margin:0 auto;padding:22px 20px 0}
.ap-brand{display:inline-flex}
.ap-x{color:var(--muted);text-decoration:none;font-size:1.1rem;width:34px;height:34px;display:grid;place-items:center;border-radius:9px}
.ap-x:hover{background:var(--bg-soft);color:var(--ink)}
.ap-main{max-width:680px;margin:0 auto;padding:18px 20px 60px}
.ap-card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px 26px;box-shadow:0 24px 60px -30px rgba(14,19,32,.28)}
.ap-tag{display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep);background:#f8f0e0;padding:5px 12px;border-radius:20px;margin-bottom:12px}
.ap-card h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:1.85rem;margin:0 0 6px}
.ap-sub{color:var(--muted);margin:0 0 22px;font-size:.96rem}
.ap-label{display:block;font-weight:700;font-size:.86rem;margin:18px 0 9px}
.ap-opt{font-weight:500;color:var(--muted)}
.ap-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ap-pick{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:13px 14px;border:1.5px solid var(--line);border-radius:13px;background:#fff;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s}
.ap-pick:hover{border-color:#d6c091}
.ap-pick.on{border-color:var(--gold);background:#fdfaf2;box-shadow:0 0 0 3px rgba(201,169,110,.18)}
.ap-pick-t{font-weight:800;font-size:.94rem}
.ap-pick-h{font-size:.76rem;color:var(--muted);line-height:1.3}
.ap-in{width:100%;padding:12px 14px;border:1.5px solid var(--line);border-radius:11px;font-family:inherit;font-size:.95rem;background:var(--bg-soft);color:var(--ink)}
.ap-in:focus{outline:none;border-color:var(--gold);background:#fff}
textarea.ap-in{resize:vertical}
.ap-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ap-chips{display:flex;flex-wrap:wrap;gap:8px}
.ap-chip{font-size:.82rem;font-weight:700;color:var(--ink);background:#fff;border:1.5px solid var(--line);border-radius:100px;padding:8px 15px;cursor:pointer;font-family:inherit;transition:border-color .12s,background .12s,color .12s}
.ap-chip:hover{border-color:var(--gold)}
.ap-chip.on{background:var(--gold);border-color:var(--gold);color:#fff}
.ap-err{margin-top:16px;color:#c9382b;background:#fdecec;border:1px solid #f2c4c4;border-radius:10px;padding:10px 13px;font-size:.88rem;font-weight:600}
.ap-btn{display:inline-flex;align-items:center;justify-content:center;font-weight:700;border-radius:12px;cursor:pointer;border:none;font-size:.98rem;font-family:inherit;text-decoration:none;transition:transform .15s,box-shadow .2s,background .2s}
.ap-btn-gold{background:var(--gold);color:var(--ink);padding:15px 26px}
.ap-btn-gold:hover{transform:translateY(-2px);background:var(--gold-deep);color:#fff;box-shadow:0 14px 28px -12px rgba(176,143,79,.6)}
.ap-btn-gold:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none;background:var(--gold)}
.ap-btn-ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);padding:14px 24px}
.ap-btn-ghost:hover{border-color:var(--ink)}
.ap-submit{width:100%;margin-top:24px}
.ap-note{text-align:center;color:var(--muted);font-size:.8rem;margin:12px 0 0}
.mono{font-family:Menlo,Consolas,monospace;letter-spacing:.5px}
.ap-success{text-align:center}
.ap-check{width:64px;height:64px;border-radius:50%;background:#e7f6ec;display:grid;place-items:center;margin:0 auto 16px}
.ap-check svg{width:32px;height:32px;fill:none;stroke:#1c8a45;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.ap-success h1{font-size:1.6rem}
.ap-ticket{background:var(--bg-soft);border:1px solid var(--line);border-radius:14px;padding:6px 18px;margin:22px 0}
.ap-ticket-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0}
.ap-ticket-row+.ap-ticket-row{border-top:1px dashed var(--line)}
.ap-ticket-lbl{color:var(--muted);font-weight:600;font-size:.9rem}
.ap-ticket-val{font-weight:800;font-size:1.2rem}
.ap-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
@media(max-width:560px){.ap-grid2,.ap-two{grid-template-columns:1fr}.ap-card h1{font-size:1.55rem}}
`;
