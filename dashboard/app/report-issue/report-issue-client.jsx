"use client";

import { useState } from "react";
import { Wordmark } from "../components/brand";

const CATEGORIES = [
  { key: "camera", label: "Camera offline", hint: "A camera is black, frozen, or dropped off", icon: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></> },
  { key: "dropout", label: "Cutting out", hint: "Video freezes, lags, or glitches", icon: <><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></> },
  { key: "nvr", label: "Recorder / NVR", hint: "No recordings, storage, or remote view", icon: <><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></> },
  { key: "other", label: "Something else", hint: "Audio, access control, network, other", icon: <><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></> },
];

const URGENCY = [
  { key: "low", label: "Low", hint: "Minor — whenever you can" },
  { key: "medium", label: "Normal", hint: "Standard service" },
  { key: "high", label: "High", hint: "Affecting the business" },
  { key: "urgent", label: "Urgent", hint: "System down / security risk" },
];

export default function ReportIssueClient({ loggedIn, prefill, projects = [], presetService = "", presetProject = "" }) {
  const [name, setName]   = useState(prefill.name || "");
  const [email, setEmail] = useState(prefill.email || "");
  const [phone, setPhone] = useState(prefill.phone || "");
  const [address, setAddress] = useState("");
  const [project, setProject] = useState(presetProject || (projects[0]?.accessId || ""));
  const [category, setCategory] = useState("camera");
  const [priority, setPriority] = useState("medium");
  const [issue, setIssue] = useState(presetService ? `${presetService}: ` : "");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState("");
  const [done, setDone]   = useState(null); // { svcId, pin, name }

  const pickedProject = projects.find((p) => p.accessId === project);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!name.trim() && !email.trim() && !phone.trim()) { setErr("Tell us who you are so we can reach you."); return; }
    if (!issue.trim()) { setErr("Describe the issue so we can help."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/service-call", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, email, phone,
          address: address || pickedProject?.address || "",
          project: project || "",
          category, priority, issue,
        }),
      });
      const j = await res.json();
      if (j.ok) setDone({ svcId: j.svcId, pin: j.pin, name: j.name });
      else { setErr(j.error || "Something went wrong."); setBusy(false); }
    } catch (_) {
      setErr("Connection error. Please try again."); setBusy(false);
    }
  }

  return (
    <div className="ri-root">
      <header className="ri-top">
        <a href="/" className="ri-brand" aria-label="IOT TECHS home"><Wordmark height={24} /></a>
        <a href="/" className="ri-x" aria-label="Close">✕</a>
      </header>

      <main className="ri-main">
        {done ? (
          <div className="ri-card ri-success">
            <div className="ri-check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg></div>
            <h1>Service call logged{done.name ? `, ${done.name}` : ""}.</h1>
            <p className="ri-sub">Our team has your report and will reach out to schedule a technician. Keep your Service Call ID handy — it&rsquo;s how you track progress.</p>
            <div className="ri-ticket">
              <div className="ri-ticket-row">
                <span className="ri-ticket-lbl">Service Call ID</span>
                <span className="ri-ticket-val mono">{done.svcId}</span>
              </div>
              <div className="ri-ticket-row">
                <span className="ri-ticket-lbl">Your PIN</span>
                <span className="ri-ticket-val mono">{done.pin || "—"}</span>
              </div>
            </div>
            <div className="ri-actions">
              <a className="ri-btn ri-btn-gold" href={`/service-call/${done.svcId}`}>Track my service call</a>
              <a className="ri-btn ri-btn-ghost" href="/">Back to home</a>
            </div>
          </div>
        ) : (
          <form className="ri-card" onSubmit={submit}>
            <div className="ri-tag">Service Call</div>
            <h1>What&rsquo;s going on?</h1>
            <p className="ri-sub">Tell us what isn&rsquo;t working and we&rsquo;ll get a technician on it. This opens a tracked service call — not a new project.</p>

            {/* What's wrong */}
            <label className="ri-label">What&rsquo;s the issue?</label>
            <div className="ri-cats">
              {CATEGORIES.map((c) => (
                <button type="button" key={c.key} className={`ri-cat${category === c.key ? " on" : ""}`} onClick={() => setCategory(c.key)}>
                  <svg viewBox="0 0 24 24">{c.icon}</svg>
                  <span className="ri-cat-lbl">{c.label}</span>
                  <span className="ri-cat-hint">{c.hint}</span>
                </button>
              ))}
            </div>

            {/* Describe */}
            <label className="ri-label" htmlFor="ri-issue">Describe what you&rsquo;re seeing</label>
            <textarea id="ri-issue" className="ri-input" rows={3} value={issue} onChange={(e) => setIssue(e.target.value)}
              placeholder="e.g. Front-door camera has been black since last night — the other cameras look fine." />

            {/* Urgency */}
            <label className="ri-label">How urgent is it?</label>
            <div className="ri-urg">
              {URGENCY.map((u) => (
                <button type="button" key={u.key} className={`ri-urg-btn${priority === u.key ? " on" : ""} u-${u.key}`} onClick={() => setPriority(u.key)}>
                  <span className="ri-urg-lbl">{u.label}</span>
                  <span className="ri-urg-hint">{u.hint}</span>
                </button>
              ))}
            </div>

            {/* Which system (logged-in customers with projects) */}
            {projects.length > 0 && (
              <>
                <label className="ri-label" htmlFor="ri-project">Which system?</label>
                <select id="ri-project" className="ri-input" value={project} onChange={(e) => setProject(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.accessId} value={p.accessId}>{p.service || "System"} — {p.address || p.accessId}</option>
                  ))}
                  <option value="">Not listed / a different location</option>
                </select>
              </>
            )}

            {/* Contact */}
            <div className="ri-two">
              <div>
                <label className="ri-label" htmlFor="ri-name">Full name</label>
                <input id="ri-name" className="ri-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" autoComplete="name" />
              </div>
              <div>
                <label className="ri-label" htmlFor="ri-phone">Phone</label>
                <input id="ri-phone" className="ri-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(646) 000-0000" autoComplete="tel" />
              </div>
            </div>
            <div className="ri-two">
              <div>
                <label className="ri-label" htmlFor="ri-email">Email</label>
                <input id="ri-email" className="ri-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" />
              </div>
              <div>
                <label className="ri-label" htmlFor="ri-addr">Service address {pickedProject ? "" : <span className="ri-opt">(optional)</span>}</label>
                <input id="ri-addr" className="ri-input" value={address} onChange={(e) => setAddress(e.target.value)}
                  placeholder={pickedProject?.address || "Where is the system?"} autoComplete="street-address" />
              </div>
            </div>

            {err && <div className="ri-err">{err}</div>}
            <button className="ri-btn ri-btn-gold ri-submit" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit service call"}</button>
            <p className="ri-note">Your PIN is the last 4 digits of your phone — you&rsquo;ll use your Service Call ID and PIN to track progress.</p>
          </form>
        )}
      </main>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
.ri-root{--bg:#fff;--bg-soft:#f6f7f9;--ink:#0e1320;--muted:#5b6275;--line:#e6e8ee;--gold:#C9A96E;--gold-deep:#b08f4f;--accent:#3257ff;--accent-soft:#eef1ff;
  min-height:100vh;background:radial-gradient(1200px 500px at 50% -10%,#f0f2f7 0%,#fff 60%);color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;line-height:1.55}
.ri-top{display:flex;align-items:center;justify-content:space-between;max-width:640px;margin:0 auto;padding:22px 20px 0}
.ri-brand{display:inline-flex}
.ri-x{color:var(--muted);text-decoration:none;font-size:1.1rem;width:34px;height:34px;display:grid;place-items:center;border-radius:9px;transition:background .15s,color .15s}
.ri-x:hover{background:var(--bg-soft);color:var(--ink)}
.ri-main{max-width:640px;margin:0 auto;padding:18px 20px 60px}
.ri-card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px 26px;box-shadow:0 24px 60px -30px rgba(14,19,32,.28)}
.ri-tag{display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep);background:#f8f0e0;padding:5px 12px;border-radius:20px;margin-bottom:12px}
.ri-card h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:1.85rem;margin:0 0 6px}
.ri-sub{color:var(--muted);margin:0 0 22px;font-size:.96rem}
.ri-label{display:block;font-weight:700;font-size:.86rem;margin:18px 0 9px}
.ri-opt{font-weight:500;color:var(--muted)}
.ri-cats{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ri-cat{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;padding:13px 14px;border:1.5px solid var(--line);border-radius:13px;background:#fff;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s,transform .1s}
.ri-cat:hover{border-color:#d6c091}
.ri-cat.on{border-color:var(--gold);background:#fdfaf2;box-shadow:0 0 0 3px rgba(201,169,110,.18)}
.ri-cat svg{width:22px;height:22px;fill:none;stroke:var(--gold-deep);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;margin-bottom:3px}
.ri-cat-lbl{font-weight:700;font-size:.92rem}
.ri-cat-hint{font-size:.76rem;color:var(--muted);line-height:1.3}
.ri-input{width:100%;padding:12px 14px;border:1.5px solid var(--line);border-radius:11px;font-family:inherit;font-size:.95rem;background:var(--bg-soft);color:var(--ink);transition:border-color .15s,background .15s}
.ri-input:focus{outline:none;border-color:var(--gold);background:#fff}
textarea.ri-input{resize:vertical;min-height:76px}
.ri-urg{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.ri-urg-btn{display:flex;flex-direction:column;gap:2px;text-align:left;padding:11px 12px;border:1.5px solid var(--line);border-radius:12px;background:#fff;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s}
.ri-urg-btn:hover{border-color:#c9ccd6}
.ri-urg-lbl{font-weight:700;font-size:.88rem}
.ri-urg-hint{font-size:.72rem;color:var(--muted);line-height:1.25}
.ri-urg-btn.on{border-color:var(--ink);background:var(--bg-soft)}
.ri-urg-btn.u-high.on{border-color:#b3541e;background:#fdf0e5}
.ri-urg-btn.u-high.on .ri-urg-lbl{color:#b3541e}
.ri-urg-btn.u-urgent.on{border-color:#c9382b;background:#fdecec}
.ri-urg-btn.u-urgent.on .ri-urg-lbl{color:#c9382b}
.ri-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ri-two .ri-label{margin-top:16px}
.ri-err{margin-top:16px;color:#c9382b;background:#fdecec;border:1px solid #f2c4c4;border-radius:10px;padding:10px 13px;font-size:.88rem;font-weight:600}
.ri-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:700;border-radius:12px;cursor:pointer;border:none;font-size:.98rem;font-family:inherit;text-decoration:none;transition:transform .15s,box-shadow .2s,background .2s}
.ri-btn-gold{background:var(--gold);color:var(--ink);padding:15px 26px}
.ri-btn-gold:hover{transform:translateY(-2px);background:var(--gold-deep);color:#fff;box-shadow:0 14px 28px -12px rgba(176,143,79,.6)}
.ri-btn-gold:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none;background:var(--gold)}
.ri-btn-ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);padding:14px 24px}
.ri-btn-ghost:hover{border-color:var(--ink)}
.ri-submit{width:100%;margin-top:24px}
.ri-note{text-align:center;color:var(--muted);font-size:.8rem;margin:12px 0 0}
.mono{font-family:Menlo,Consolas,monospace;letter-spacing:.5px}
/* success */
.ri-success{text-align:center}
.ri-check{width:64px;height:64px;border-radius:50%;background:#e7f6ec;display:grid;place-items:center;margin:0 auto 16px}
.ri-check svg{width:32px;height:32px;fill:none;stroke:#1c8a45;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.ri-success h1{font-size:1.6rem}
.ri-ticket{background:var(--bg-soft);border:1px solid var(--line);border-radius:14px;padding:6px 18px;margin:22px 0}
.ri-ticket-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0}
.ri-ticket-row+.ri-ticket-row{border-top:1px dashed var(--line)}
.ri-ticket-lbl{color:var(--muted);font-weight:600;font-size:.9rem}
.ri-ticket-val{font-weight:800;font-size:1.2rem}
.ri-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
@media(max-width:560px){.ri-cats,.ri-urg,.ri-two{grid-template-columns:1fr 1fr}.ri-urg{grid-template-columns:1fr 1fr}.ri-card h1{font-size:1.55rem}}
`;
