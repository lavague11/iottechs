"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { logoutAction } from "../login/actions";
import { STAGES } from "../../lib/spec";
import { TaglinePill } from "../components/brand";
import AddressAutocomplete from "../components/address-autocomplete";

const STAGE_KEYS  = STAGES.map((s) => s.key);
const STAGE_TOTAL = STAGES.length;

function stageNum(key) { return STAGE_KEYS.indexOf(key) + 1; }
function stagePct(key) { const i = STAGE_KEYS.indexOf(key); return i < 0 ? 0 : Math.round(((i + 1) / STAGE_TOTAL) * 100); }
function stageLabel(key) { return STAGES.find((s) => s.key === key)?.label || key; }

function filterState(p) {
  if (p.stage === "completion" || p.category === "completed") return "completed";
  if (p.category === "closed"  || p.status  === "closed")    return "closed";
  return "open";
}
function statusBadge(p) {
  const state = filterState(p);
  if (state === "completed") return { label: "Completed",  cls: "s-done" };
  if (state === "closed")    return { label: "Closed",     cls: "s-gray" };
  if (["proposal","approval_deposit"].includes(p.stage)) return { label: "Needs Review", cls: "s-review" };
  return { label: "In Progress", cls: "s-active" };
}
function initials(name) { return (name||"?").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase(); }
function firstName(name) { return (name||"").trim().split(/\s+/)[0]||""; }

// ─── Action Modal ─────────────────────────────────────────────────────────────
const SERVICES = [
  "Security Cameras / CCTV","Commercial Audio","Networking & Cat6",
  "Toast / POS Cabling","Access Control / Door Entry","NVR & Storage",
  "Emergency Monitoring","AI Camera Development","LPR & Automation","Other",
];

function toTitleCase(v) {
  return v.replace(/(?:^|[\s\-\/])(\S)/g, (m, c) => m.slice(0, -1) + c.toUpperCase());
}
function formatPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

// Shared Google Maps loader — injects script once, calls all queued callbacks
// Address + business autocomplete now come from the shared, race-safe component (imported above).

function IntakeForm({ user, label, service: defaultService, onDone }) {
  const [f, setF] = useState({
    name: user?.name||"", email: user?.email||"", phone: user?.phone||"",
    company:"", address:"", service: defaultService||"", message:"",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  function set(k,v){ setF(p=>({...p,[k]:v})); }
  function setTC(k,v){ setF(p=>({...p,[k]:toTitleCase(v)})); }
  async function submit(e){
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/demo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(f)});
      const j = await r.json();
      if(j.ok) onDone(j);
      else setErr(j.error||"Something went wrong.");
    } catch { setErr("Connection error."); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="am-form">
      <div className="am-row2">
        <div className="am-field"><label>Full Name</label><input value={f.name} onChange={e=>setTC("name",e.target.value)} placeholder="Your name" required/></div>
        <div className="am-field"><label>Email</label><input type="email" value={f.email} onChange={e=>set("email",e.target.value)} placeholder="you@company.com" required/></div>
      </div>
      <div className="am-row2">
        <div className="am-field"><label>Phone</label><input type="tel" value={f.phone} onChange={e=>set("phone",formatPhone(e.target.value))} placeholder="(646) 555-0100"/></div>
        <div className="am-field"><label>Company Name <span className="am-opt">(optional)</span></label><AddressAutocomplete types={["establishment"]} value={f.company} onChange={v=>set("company",toTitleCase(v))} onPlace={p=>setF(prev=>({...prev, company:toTitleCase(p.name||prev.company), address:p.address||prev.address}))} placeholder="Acme Corp"/></div>
      </div>
      <div className="am-field">
        <label>Service Address</label>
        <AddressAutocomplete value={f.address} onChange={v=>set("address",v)}/>
      </div>
      <div className="am-field">
        <label>Service Type</label>
        <select value={f.service} onChange={e=>set("service",e.target.value)}>
          <option value="">Select a service…</option>
          {SERVICES.map(s=><option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="am-field"><label>Message / Notes <span className="am-opt">(optional)</span></label><textarea value={f.message} onChange={e=>set("message",e.target.value)} rows={3} placeholder="Tell us more…"/></div>
      {err && <div className="am-err">{err}</div>}
      <button className="am-submit" type="submit" disabled={busy}>{busy?"Sending…":label||"Submit"}</button>
    </form>
  );
}

function ExistingProjectForm({ user, projects, actionLabel, placeholder, serviceHint, onDone }) {
  const [projectId, setProjectId] = useState(projects[0]?.access_id||"");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e){
    e.preventDefault(); setErr(""); setBusy(true);
    const proj = projects.find(p=>p.access_id===projectId);
    try {
      const r = await fetch("/api/demo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        name: user?.name||"", email: user?.email||"", phone: user?.phone||"",
        address: proj?.address||"", service: serviceHint||(proj?.service||""),
        message: `[Project: ${projectId}] ${message}`,
      })});
      const j = await r.json();
      if(j.ok) onDone(j);
      else setErr(j.error||"Something went wrong.");
    } catch { setErr("Connection error."); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="am-form">
      <div className="am-field">
        <label>Select Project</label>
        <select value={projectId} onChange={e=>setProjectId(e.target.value)} required>
          {projects.map(p=>(
            <option key={p.access_id} value={p.access_id}>{p.service||p.service_code} — {p.address||p.customer} ({p.access_id})</option>
          ))}
        </select>
      </div>
      <div className="am-field">
        <label>{actionLabel}</label>
        <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={4} placeholder={placeholder} required/>
      </div>
      {err && <div className="am-err">{err}</div>}
      <button className="am-submit" type="submit" disabled={busy}>{busy?"Sending…":"Submit"}</button>
    </form>
  );
}

function QuestionForm({ user, onDone }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e){
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/demo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        name: user?.name||"", email: user?.email||"", phone: user?.phone||"",
        service: "Question", message: subject ? `[${subject}] ${message}` : message,
      })});
      const j = await r.json();
      if(j.ok) onDone(j);
      else setErr(j.error||"Something went wrong.");
    } catch { setErr("Connection error."); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="am-form">
      <div className="am-field"><label>Subject <span className="am-opt">(optional)</span></label><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="What's your question about?"/></div>
      <div className="am-field"><label>Message</label><textarea value={message} onChange={e=>setMessage(e.target.value)} rows={5} placeholder="Ask us anything — we'll get back to you shortly." required/></div>
      {err && <div className="am-err">{err}</div>}
      <button className="am-submit" type="submit" disabled={busy}>{busy?"Sending…":"Submit"}</button>
    </form>
  );
}

function ChoiceCard({ icon, title, sub, onClick }) {
  return (
    <button className="am-choice" onClick={onClick} type="button">
      <span className="am-choice-ic">{icon}</span>
      <div><div className="am-choice-title">{title}</div><div className="am-choice-sub">{sub}</div></div>
      <span className="am-choice-arr">→</span>
    </button>
  );
}

function SuccessView({ name, data, onClose }) {
  const pid = data?.accessId;
  const pin = data?.customerPin;
  return (
    <div className="am-success">
      <div className="am-check-wrap">
        <div className="am-check">
          <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
      </div>
      <h3>Project Submitted{name ? `, ${firstName(name)}` : ""}.</h3>
      <p className="am-success-sub">Your inquiry has been logged and a project has been created. Our team will be in touch shortly.</p>
      {pid && (
        <div className="am-proj-card">
          <div className="am-proj-row">
            <span className="am-proj-lbl">Project ID</span>
            <span className="am-proj-val">{pid}</span>
          </div>
          {pin && (
            <div className="am-proj-row">
              <span className="am-proj-lbl">Access PIN</span>
              <span className="am-proj-pin">{pin}</span>
            </div>
          )}
          <div className="am-proj-note">Save these — you can use them to track your project at any time.</div>
        </div>
      )}
      <button className="am-submit am-done-btn" onClick={onClose}>Done</button>
    </div>
  );
}

function ActionModal({ type, user, projects, onClose }) {
  const [step, setStep]       = useState("start");
  const [doneData, setDoneData] = useState(null);

  function handleDone(data) { setDoneData(data || {}); }

  if (doneData) return (
    <div className="am-overlay" onClick={e=>{ if(e.target.classList.contains("am-overlay")) onClose(); }}>
      <div className="am-box am-box-success">
        <button className="am-x" onClick={onClose}>×</button>
        <SuccessView name={user?.name} data={doneData} onClose={onClose}/>
      </div>
    </div>
  );

  const hasProjects = projects && projects.length > 0;

  // ── NEW PROJECT ─────────────────────────────────────────────
  if (type === "new") return (
    <div className="am-overlay" onClick={e=>{ if(e.target.classList.contains("am-overlay")) onClose(); }}>
      <div className="am-box">
        <button className="am-x" onClick={onClose}>×</button>
        <div className="am-head">
          <div className="am-icon am-icon-blue"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg></div>
          <h2>Start a New Project</h2>
          <p>Tell us about your new location or system — we'll reach out to schedule a survey.</p>
        </div>
        <IntakeForm user={user} onDone={handleDone}/>
      </div>
    </div>
  );

  // ── ADD TO MY SYSTEM ─────────────────────────────────────────
  if (type === "add") {
    if (step === "start") return (
      <div className="am-overlay" onClick={e=>{ if(e.target.classList.contains("am-overlay")) onClose(); }}>
        <div className="am-box">
          <button className="am-x" onClick={onClose}>×</button>
          <div className="am-head">
            <div className="am-icon am-icon-gold"><svg viewBox="0 0 24 24"><rect x="2" y="7" width="13" height="10" rx="1"/><path d="M15 10l6-3v10l-6-3"/><path d="M19 19v3M17.5 20.5h3"/></svg></div>
            <h2>Add to My System</h2>
            <p>What best describes what you need?</p>
          </div>
          <div className="am-choices">
            {hasProjects && (
              <ChoiceCard
                icon={<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>}
                title="Add to a project we did"
                sub="Expand cameras, audio, access, or storage on an existing IOT TECHS installation"
                onClick={()=>setStep("existing")}
              />
            )}
            <ChoiceCard
              icon={<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>}
              title="New location or system"
              sub="Brand new site or a system installed by someone else"
              onClick={()=>setStep("new")}
            />
          </div>
        </div>
      </div>
    );
    if (step === "existing") return (
      <div className="am-overlay" onClick={e=>{ if(e.target.classList.contains("am-overlay")) onClose(); }}>
        <div className="am-box">
          <button className="am-x" onClick={onClose}>×</button>
          <button className="am-back" onClick={()=>setStep("start")}>← Back</button>
          <div className="am-head">
            <h2>Add to an Existing Project</h2>
            <p>Select the project and describe what you'd like to add.</p>
          </div>
          <ExistingProjectForm user={user} projects={projects} actionLabel="What would you like to add?" placeholder="e.g. 4 more cameras on the west wall, additional NVR storage…" onDone={handleDone}/>
        </div>
      </div>
    );
    if (step === "new") return (
      <div className="am-overlay" onClick={e=>{ if(e.target.classList.contains("am-overlay")) onClose(); }}>
        <div className="am-box">
          <button className="am-x" onClick={onClose}>×</button>
          <button className="am-back" onClick={()=>setStep("start")}>← Back</button>
          <div className="am-head"><h2>New Location or System</h2><p>We'll schedule a site survey and put together a quote.</p></div>
          <IntakeForm user={user} onDone={handleDone}/>
        </div>
      </div>
    );
  }

  // ── SERVICE CALL ─────────────────────────────────────────────
  if (type === "service") {
    if (step === "start") return (
      <div className="am-overlay" onClick={e=>{ if(e.target.classList.contains("am-overlay")) onClose(); }}>
        <div className="am-box">
          <button className="am-x" onClick={onClose}>×</button>
          <div className="am-head">
            <div className="am-icon am-icon-red"><svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div>
            <h2>Service Call</h2>
            <p>What best describes this service call?</p>
          </div>
          <div className="am-choices">
            {hasProjects && (
              <ChoiceCard
                icon={<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>}
                title="A project we did"
                sub="Something isn't working or needs attention on a system IOT TECHS installed"
                onClick={()=>setStep("existing")}
              />
            )}
            <ChoiceCard
              icon={<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>}
              title="New service call"
              sub="System installed by someone else, or a new site that needs attention"
              onClick={()=>setStep("new")}
            />
          </div>
        </div>
      </div>
    );
    if (step === "existing") return (
      <div className="am-overlay" onClick={e=>{ if(e.target.classList.contains("am-overlay")) onClose(); }}>
        <div className="am-box">
          <button className="am-x" onClick={onClose}>×</button>
          <button className="am-back" onClick={()=>setStep("start")}>← Back</button>
          <div className="am-head"><h2>Service Call — Existing Project</h2><p>Select the project and describe the issue.</p></div>
          <ExistingProjectForm user={user} projects={projects} actionLabel="Describe the issue" placeholder="e.g. Camera on the east side is offline, NVR not recording…" serviceHint="Service Call" onDone={handleDone}/>
        </div>
      </div>
    );
    if (step === "new") return (
      <div className="am-overlay" onClick={e=>{ if(e.target.classList.contains("am-overlay")) onClose(); }}>
        <div className="am-box">
          <button className="am-x" onClick={onClose}>×</button>
          <button className="am-back" onClick={()=>setStep("start")}>← Back</button>
          <div className="am-head"><h2>New Service Call</h2><p>Tell us about the system and the issue — we'll get a tech out to you.</p></div>
          <IntakeForm user={user} service="Service Call" onDone={handleDone}/>
        </div>
      </div>
    );
  }

  // ── QUICK QUESTION ────────────────────────────────────────────
  if (type === "question") return (
    <div className="am-overlay" onClick={e=>{ if(e.target.classList.contains("am-overlay")) onClose(); }}>
      <div className="am-box">
        <button className="am-x" onClick={onClose}>×</button>
        <div className="am-head">
          <div className="am-icon am-icon-purple"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
          <h2>Quick Question</h2>
          <p>Send us a message and we'll get back to you shortly.</p>
        </div>
        <QuestionForm user={user} onDone={handleDone}/>
      </div>
    </div>
  );

  return null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MyProjectsClient({ user, projects, serviceCalls = [] }) {
  const [filter, setFilter]     = useState("all");
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const userRef  = useRef(null);
  const notifRef = useRef(null);
  const [copiedId, setCopiedId] = useState(null);
  const [origin, setOrigin]     = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => {
    function handleClick(e) {
      if (userRef.current  && !userRef.current.contains(e.target))  setUserOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  function copyLink(p) {
    const link = `${origin}/project/${p.access_id}`;
    const text = p.customer_pin ? `${link}\nProject PIN: ${p.customer_pin}` : link;
    navigator.clipboard?.writeText(text).catch(()=>{});
    setCopiedId(p.access_id);
    setTimeout(()=>setCopiedId(null),1600);
  }

  const name  = user?.name  || "Customer";
  const email = user?.email || "";
  const first = firstName(name);
  const avtr  = initials(name);

  const needsSig = projects.filter(p => ["proposal","approval_deposit"].includes(p.stage));
  const needsQC  = projects.filter(p => p.stage === "qc");
  const notifCount = needsSig.length + needsQC.length;

  const counts = {
    all: projects.length,
    open: projects.filter(p=>filterState(p)==="open").length,
    closed: projects.filter(p=>filterState(p)==="closed").length,
    completed: projects.filter(p=>filterState(p)==="completed").length,
  };
  const visible = projects.filter(p => filter==="all" || filterState(p)===filter);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
        .cp-root{--bg:#ffffff;--bg-soft:#f6f7f9;--bg-tint:#f0f2f7;--ink:#0e1320;--slate:#2C3347;--muted:#5b6275;--line:#e6e8ee;--gold:#C9A96E;--gold-deep:#b08f4f;--accent:#3257ff;--accent-soft:#eef1ff;--green:#1c8a45;--green-soft:#e7f6ec;--red:#d23c3c;--red-soft:#fdeaea;font-family:'Hanken Grotesk',sans-serif;background:var(--bg-soft);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;min-height:100vh}
        .cp-root *{box-sizing:border-box;margin:0;padding:0}
        .cp-root a{text-decoration:none;color:inherit}
        .cp-wrap{max-width:1180px;margin:0 auto;padding:0 26px}
        .cp-disp{font-family:'Bricolage Grotesque',sans-serif;letter-spacing:-.02em;line-height:1.02}

        .cp-nav{position:sticky;top:0;z-index:60;background:rgba(255,255,255,.9);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
        .cp-nav-inner{display:flex;align-items:center;justify-content:space-between;height:72px}
        .cp-brand{display:flex;align-items:center;gap:11px}
        .cp-brand .bname{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.25rem;letter-spacing:-.02em}
        .cp-brand .bname b{color:var(--gold-deep)}

        .cp-notif-wrap{position:relative}
        .cp-notif-btn{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#fff;border:1px solid var(--line);cursor:pointer;transition:.18s;position:relative}
        .cp-notif-btn:hover{border-color:var(--gold);box-shadow:0 6px 16px -8px rgba(14,19,32,.35)}
        .cp-notif-btn svg{width:18px;height:18px;stroke:var(--ink);fill:none;stroke-width:2}
        .cp-notif-badge{position:absolute;top:-3px;right:-3px;min-width:17px;height:17px;border-radius:50%;background:var(--red);color:#fff;font-size:.62rem;font-weight:700;display:grid;place-items:center;border:2px solid var(--bg-soft)}
        .cp-notif-panel{position:absolute;right:0;top:calc(100% + 10px);width:310px;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 24px 50px -18px rgba(14,19,32,.4);padding:6px;opacity:0;visibility:hidden;transform:translateY(-6px);transition:.18s;z-index:80}
        .cp-notif-panel.open{opacity:1;visibility:visible;transform:translateY(0)}
        .cp-np-head{font-weight:700;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:10px 12px 8px}
        .cp-np-item{display:flex;align-items:flex-start;gap:11px;padding:11px 12px;border-radius:10px;cursor:pointer;transition:.15s}
        .cp-np-item:hover{background:var(--bg-soft)}
        .cp-np-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:5px}
        .cp-np-title{font-weight:600;font-size:.9rem;margin-bottom:2px}
        .cp-np-sub{font-size:.8rem;color:var(--muted);line-height:1.35}
        .cp-no-notif{padding:16px 12px;text-align:center;font-size:.88rem;color:var(--muted)}

        .cp-user-wrap{position:relative}
        .cp-user-chip{display:flex;align-items:center;gap:11px;background:#fff;border:1px solid var(--line);padding:6px 8px 6px 6px;border-radius:50px;cursor:pointer;transition:border-color .2s,box-shadow .2s}
        .cp-user-chip:hover{border-color:var(--gold);box-shadow:0 8px 20px -12px rgba(14,19,32,.4)}
        .cp-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(145deg,var(--gold),var(--gold-deep));color:#fff;display:grid;place-items:center;font-weight:700;font-size:.9rem;font-family:'Bricolage Grotesque',sans-serif;flex-shrink:0}
        .cp-uname{font-weight:600;font-size:.92rem}
        .cp-caret{color:var(--muted);font-size:.7rem}
        .cp-user-menu{position:absolute;right:0;top:calc(100% + 10px);min-width:210px;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 50px -18px rgba(14,19,32,.4);padding:8px;opacity:0;visibility:hidden;transform:translateY(-6px);transition:.18s;z-index:80}
        .cp-user-menu.open{opacity:1;visibility:visible;transform:translateY(0)}
        .cp-um-head{padding:10px 12px 12px;border-bottom:1px solid var(--line);margin-bottom:6px}
        .cp-um-head .n{font-weight:700;font-size:.95rem}
        .cp-um-head .e{color:var(--muted);font-size:.82rem}
        .cp-user-menu .um-link{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;font-size:.92rem;font-weight:500;color:var(--ink);width:100%;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left}
        .cp-user-menu .um-link:hover{background:var(--bg-soft)}
        .cp-user-menu .um-link.danger{color:var(--red)}
        .cp-user-menu .um-link svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.9;flex-shrink:0}

        .cp-req-actions{display:grid;gap:10px;margin-top:16px}
        .cp-req-card{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;transition:border-color .2s,box-shadow .2s;cursor:pointer}
        .cp-req-card:hover{border-color:var(--gold);box-shadow:0 10px 24px -14px rgba(14,19,32,.35)}
        .cp-req-ic{width:36px;height:36px;border-radius:9px;display:grid;place-items:center;flex-shrink:0}
        .cp-req-ic svg{width:17px;height:17px;fill:none;stroke-width:2}
        .cp-req-ic.sig{background:#faf4e8}.cp-req-ic.sig svg{stroke:var(--gold-deep)}
        .cp-req-ic.qc{background:var(--accent-soft)}.cp-req-ic.qc svg{stroke:var(--accent)}
        .cp-req-body{flex:1;min-width:0}
        .cp-req-body .r-title{font-weight:700;font-size:.92rem;margin-bottom:2px}
        .cp-req-body .r-sub{font-size:.82rem;color:var(--muted)}
        .cp-req-arrow{color:var(--muted);font-size:.9rem;transition:transform .2s}
        .cp-req-card:hover .cp-req-arrow{transform:translateX(3px)}

        .cp-welcome{padding:36px 0 0}
        .cp-welcome h1{font-size:clamp(1.35rem,2.6vw,1.8rem);font-weight:700;margin-bottom:14px}
        .cp-welcome h1 em{font-style:normal;color:var(--gold-deep)}

        .cp-section{padding:34px 0}
        .cp-sec-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:18px;gap:16px;flex-wrap:wrap}
        .cp-sec-head h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.35rem;font-weight:700}
        .cp-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
        .cp-action{display:flex;flex-direction:row;align-items:center;gap:14px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 16px;transition:transform .18s,box-shadow .22s,border-color .2s;cursor:pointer;font-family:inherit;font-size:inherit;text-align:left;width:100%}
        .cp-action:hover{transform:translateY(-4px);box-shadow:0 22px 44px -20px rgba(14,19,32,.45);border-color:rgba(201,169,110,.6)}
        .cp-action .ic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex-shrink:0}
        .cp-action .ic svg{width:16px;height:16px;fill:none;stroke-width:2}
        .cp-action h3{font-family:'Bricolage Grotesque',sans-serif;font-size:.92rem;font-weight:700;color:var(--ink)}
        .cp-a-blue .ic{background:var(--accent-soft)}.cp-a-blue .ic svg{stroke:var(--accent)}
        .cp-a-gold .ic{background:#faf4e8}.cp-a-gold .ic svg{stroke:var(--gold-deep)}
        .cp-a-red .ic{background:var(--red-soft)}.cp-a-red .ic svg{stroke:var(--red)}
        .cp-a-purple .ic{background:#f3eeff}.cp-a-purple .ic svg{stroke:#7c3aed}

        .cp-filters{display:inline-flex;gap:4px;background:#fff;border:1px solid var(--line);border-radius:50px;padding:5px}
        .cp-filters button{border:none;background:transparent;font-family:inherit;font-weight:600;font-size:.88rem;color:var(--muted);padding:8px 16px;border-radius:50px;cursor:pointer;transition:.18s}
        .cp-filters button:hover{color:var(--ink)}
        .cp-filters button.on{background:var(--ink);color:#fff}
        .cp-filters .cnt{opacity:.6;font-weight:600;margin-left:4px}

        .cp-proj-list{display:grid;gap:14px}
        .cp-proj{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px 22px;transition:border-color .2s,box-shadow .2s}
        .cp-proj:hover{border-color:rgba(201,169,110,.6);box-shadow:0 14px 30px -18px rgba(14,19,32,.35)}
        .cp-proj .p-top{display:flex;align-items:center;gap:12px;margin-bottom:4px;flex-wrap:wrap}
        .cp-proj h4{font-family:'Bricolage Grotesque',sans-serif;font-size:1.08rem;font-weight:700}
        .cp-proj .p-addr{color:var(--muted);font-size:.9rem;margin-bottom:14px}
        .cp-status{font-size:.74rem;font-weight:700;letter-spacing:.02em;padding:4px 11px;border-radius:100px;text-transform:uppercase}
        .s-active{background:var(--accent-soft);color:var(--accent)}
        .s-review{background:#faf4e8;color:var(--gold-deep)}
        .s-done{background:var(--green-soft);color:var(--green)}
        .s-gray{background:var(--bg-tint);color:var(--muted)}
        .cp-bar{height:7px;border-radius:100px;background:var(--bg-tint);overflow:hidden;max-width:420px}
        .cp-bar span{display:block;height:100%;border-radius:100px;background:linear-gradient(90deg,var(--gold),var(--gold-deep))}
        .cp-stage{font-size:.82rem;color:var(--muted);margin-top:8px}
        .cp-stage b{color:var(--ink);font-weight:600}
        .cp-p-act{display:flex;align-items:center}
        .cp-view{display:inline-flex;align-items:center;gap:7px;font-weight:600;font-size:.9rem;border:1px solid var(--line);padding:9px 16px;border-radius:10px;transition:background .2s,border-color .2s;white-space:nowrap}
        .cp-view:hover{background:var(--bg-soft);border-color:var(--gold)}
        .cp-p-foot{display:flex;align-items:center;gap:14px;margin-top:14px;flex-wrap:wrap}
        .cp-pin{display:inline-flex;align-items:center;gap:8px;background:var(--bg-soft);border:1px solid var(--line);border-radius:10px;padding:7px 12px}
        .cp-pin-lbl{font-size:.7rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
        .cp-pin-num{font-family:'Bricolage Grotesque',monospace;font-weight:700;font-size:1.05rem;letter-spacing:.18em;color:var(--ink)}
        .cp-copy{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-family:inherit;font-weight:600;font-size:.86rem;color:var(--ink);cursor:pointer;transition:.18s}
        .cp-copy:hover{border-color:var(--gold);background:var(--bg-soft)}
        .cp-copy svg{width:15px;height:15px;stroke:var(--gold-deep);fill:none;stroke-width:2}
        .cp-copy.copied{border-color:var(--green);color:var(--green)}
        .cp-copy.copied svg{stroke:var(--green)}
        .cp-empty-proj{background:#fff;border:1px dashed var(--line);border-radius:18px;padding:30px;text-align:center;color:var(--muted)}
        .cp-empty{background:#fff;border:1px dashed var(--line);border-radius:18px;padding:40px;text-align:center;color:var(--muted)}
        .cp-empty-icon{font-size:2rem;margin-bottom:12px}
        .cp-empty-title{font-weight:700;font-size:1.1rem;color:var(--ink);margin-bottom:8px}

        .cp-footer{background:var(--ink);color:#9aa1b3;margin-top:50px;padding:30px 0}
        .cp-foot-inner{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:.88rem}
        .cp-foot-inner .bname{color:#fff}
        .cp-foot-inner a:hover{color:#fff}

        /* ACTION MODAL */
        .am-overlay{position:fixed;inset:0;background:rgba(14,19,32,.55);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
        .am-box{position:relative;background:#fff;border-radius:22px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:18px 28px 28px;box-shadow:0 32px 80px -24px rgba(14,19,32,.5)}
        .am-box-success{padding:28px}
        .am-x{position:absolute;top:16px;right:16px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#9ca3af;line-height:1;padding:4px 8px;border-radius:8px}
        .am-x:hover{background:var(--bg-soft);color:var(--ink)}
        .am-back{display:inline-flex;align-items:center;gap:6px;background:none;border:none;font-family:inherit;font-size:.88rem;font-weight:600;color:var(--muted);cursor:pointer;margin-bottom:16px;padding:0}
        .am-back:hover{color:var(--ink)}
        .am-head{margin-bottom:22px}
        .am-icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;margin-bottom:14px}
        .am-icon svg{width:20px;height:20px;fill:none;stroke-width:2}
        .am-icon-blue{background:var(--accent-soft)}.am-icon-blue svg{stroke:var(--accent)}
        .am-icon-gold{background:#faf4e8}.am-icon-gold svg{stroke:var(--gold-deep)}
        .am-icon-red{background:var(--red-soft)}.am-icon-red svg{stroke:var(--red)}
        .am-icon-purple{background:#f3eeff}.am-icon-purple svg{stroke:#7c3aed}
        .am-head h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.3rem;font-weight:700;margin-bottom:6px}
        .am-head p{color:var(--muted);font-size:.92rem}
        .am-choices{display:grid;gap:10px}
        .am-choice{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;cursor:pointer;width:100%;text-align:left;font-family:inherit;transition:border-color .2s,box-shadow .2s}
        .am-choice:hover{border-color:var(--gold);box-shadow:0 10px 24px -14px rgba(14,19,32,.3)}
        .am-choice-ic{width:36px;height:36px;border-radius:9px;background:var(--bg-soft);display:grid;place-items:center;flex-shrink:0}
        .am-choice-ic svg{width:17px;height:17px;stroke:var(--ink);fill:none;stroke-width:2}
        .am-choice-title{font-weight:700;font-size:.94rem;margin-bottom:2px;color:var(--ink)}
        .am-choice-sub{font-size:.82rem;color:var(--muted)}
        .am-choice-arr{margin-left:auto;color:var(--muted);font-size:.9rem;flex-shrink:0;transition:transform .2s}
        .am-choice:hover .am-choice-arr{transform:translateX(3px)}
        .am-form{display:grid;gap:14px}
        .am-row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .am-field{display:flex;flex-direction:column;gap:6px}
        .am-field label{font-size:.84rem;font-weight:600;color:var(--ink)}
        .am-opt{font-weight:400;color:var(--muted)}
        .am-field input,.am-field select,.am-field textarea{padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-size:.92rem;color:var(--ink);background:#fff;transition:border-color .18s,box-shadow .18s;outline:none;width:100%}
        .am-field input:focus,.am-field select:focus,.am-field textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,169,110,.15)}
        .am-field textarea{resize:vertical;min-height:90px}
        .am-err{font-size:.85rem;color:var(--red);background:var(--red-soft);padding:8px 12px;border-radius:8px}
        .am-submit{width:100%;padding:13px;background:var(--gold);color:var(--ink);border:none;border-radius:12px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;transition:background .18s,transform .15s}
        .am-submit:hover:not(:disabled){background:var(--ink);color:var(--gold);transform:translateY(-1px)}
        .am-submit:disabled{opacity:.6;cursor:not-allowed}
        .am-success{text-align:center;padding:8px 0 0}
        .am-check-wrap{margin:0 auto 18px}
        .am-check{width:60px;height:60px;border-radius:50%;background:var(--green-soft);display:grid;place-items:center;margin:0 auto}
        .am-check svg{width:26px;height:26px;stroke:var(--green);fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
        .am-success h3{font-family:'Bricolage Grotesque',sans-serif;font-size:1.35rem;font-weight:800;margin-bottom:8px}
        .am-success-sub{color:var(--muted);font-size:.9rem;margin-bottom:20px;line-height:1.55}
        .am-proj-card{background:var(--bg-soft);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:20px;text-align:left}
        .am-proj-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)}
        .am-proj-row:last-of-type{border-bottom:none}
        .am-proj-lbl{font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
        .am-proj-val{font-family:'Bricolage Grotesque',monospace;font-weight:700;font-size:1rem;letter-spacing:.06em;color:var(--ink)}
        .am-proj-pin{font-family:'Bricolage Grotesque',monospace;font-weight:700;font-size:1.15rem;letter-spacing:.22em;color:var(--gold-deep)}
        .am-proj-note{font-size:.78rem;color:var(--muted);margin-top:10px;line-height:1.4}
        .am-done-btn{margin-top:0}

        @media(max-width:900px){.cp-actions{grid-template-columns:1fr 1fr}}
        @media(max-width:620px){
          .cp-actions{grid-template-columns:1fr}
          .cp-uname{display:none}
          .cp-proj{grid-template-columns:1fr}
          .cp-p-act{justify-content:flex-start}
          .am-row2{grid-template-columns:1fr}
        }
      `}</style>

      <div className="cp-root">
        {/* NAV */}
        <header className="cp-nav">
          <div className="cp-wrap cp-nav-inner">
            <Link href="/" className="cp-brand">
              <span className="bname">IOT <b>TECHS</b></span>
            </Link>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div className="cp-notif-wrap" ref={notifRef}>
                <button className="cp-notif-btn" onClick={e=>{e.stopPropagation();setNotifOpen(o=>!o);}}>
                  <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  {notifCount>0 && <span className="cp-notif-badge">{notifCount}</span>}
                </button>
                <div className={`cp-notif-panel${notifOpen?" open":""}`}>
                  <div className="cp-np-head">Notifications</div>
                  {notifCount===0 && <div className="cp-no-notif">You're all caught up.</div>}
                  {needsSig.map(p=>(
                    <div key={p.access_id} className="cp-np-item" onClick={()=>document.getElementById("projects")?.scrollIntoView({behavior:"smooth"})}>
                      <span className="cp-np-dot"/><div><div className="cp-np-title">Signature required</div><div className="cp-np-sub">{p.customer} · Proposal needs approval</div></div>
                    </div>
                  ))}
                  {needsQC.map(p=>(
                    <div key={p.access_id} className="cp-np-item" onClick={()=>document.getElementById("projects")?.scrollIntoView({behavior:"smooth"})}>
                      <span className="cp-np-dot"/><div><div className="cp-np-title">QC required</div><div className="cp-np-sub">{p.customer} · Final QC checklist pending</div></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="cp-user-wrap" ref={userRef}>
                <div className="cp-user-chip" onClick={e=>{e.stopPropagation();setUserOpen(o=>!o);}}>
                  <span className="cp-avatar">{avtr}</span>
                  <span className="cp-uname">{first}</span>
                  <span className="cp-caret">▾</span>
                </div>
                <div className={`cp-user-menu${userOpen?" open":""}`}>
                  <div className="cp-um-head"><div className="n">{name}</div><div className="e">{email}</div></div>
                  <form action={logoutAction} style={{margin:0}}>
                    <button type="submit" className="um-link danger">
                      <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
                      Log out
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* WELCOME */}
        <section className="cp-welcome">
          <div className="cp-wrap">
            <h1 className="cp-disp">Welcome back, <em>{first}</em>.</h1>
            {(needsSig.length>0||needsQC.length>0) && (
              <div className="cp-req-actions">
                {needsSig.map(p=>(
                  <div key={p.access_id} className="cp-req-card" onClick={()=>document.getElementById("projects")?.scrollIntoView({behavior:"smooth"})}>
                    <span className="cp-req-ic sig"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span>
                    <div className="cp-req-body"><div className="r-title">Signature required</div><div className="r-sub">{p.customer} · Proposal ready for sign-off</div></div>
                    <span className="cp-req-arrow">→</span>
                  </div>
                ))}
                {needsQC.map(p=>(
                  <div key={p.access_id} className="cp-req-card" onClick={()=>document.getElementById("projects")?.scrollIntoView({behavior:"smooth"})}>
                    <span className="cp-req-ic qc"><svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span>
                    <div className="cp-req-body"><div className="r-title">QC required</div><div className="r-sub">{p.customer} · Final QC checklist pending</div></div>
                    <span className="cp-req-arrow">→</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* QUICK ACTIONS */}
        <section className="cp-section">
          <div className="cp-wrap">
            <div className="cp-sec-head"><h2>What would you like to do?</h2></div>
            <div className="cp-actions">
              <button className="cp-action cp-a-blue" onClick={()=>setActiveModal("new")}>
                <span className="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg></span>
                <h3>Start a New Project</h3>
              </button>
              <button className="cp-action cp-a-gold" onClick={()=>setActiveModal("add")}>
                <span className="ic"><svg viewBox="0 0 24 24"><rect x="2" y="7" width="13" height="10" rx="1"/><path d="M15 10l6-3v10l-6-3"/><path d="M19 19v3M17.5 20.5h3"/></svg></span>
                <h3>Add to My System</h3>
              </button>
              <button className="cp-action cp-a-red" onClick={()=>setActiveModal("service")}>
                <span className="ic"><svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>
                <h3>Service Call</h3>
              </button>
              <button className="cp-action cp-a-purple" onClick={()=>setActiveModal("question")}>
                <span className="ic"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
                <h3>Quick Question</h3>
              </button>
            </div>
          </div>
        </section>

        {/* SERVICE CALLS — renders only when the customer has at least one */}
        {serviceCalls.length > 0 && (
          <section className="cp-section" id="service-calls">
            <div className="cp-wrap">
              <div className="cp-sec-head"><h2>My Service Calls</h2></div>
              <div className="cp-proj-list">
                {serviceCalls.map((c) => {
                  const step = ["resolved", "closed"].includes(c.stage) ? 3 : c.stage === "submitted" ? 1 : 2;
                  const lbl  = step === 3 ? "Resolved" : step === 2 ? "Troubleshooting" : "Received";
                  return (
                    <div key={c.svc_id} className="cp-proj">
                      <div>
                        <div className="p-top">
                          <h4>{c.issue || "Service call"}</h4>
                          <span className={`cp-status ${step === 3 ? "done" : "active"}`}>{lbl}</span>
                        </div>
                        <div className="p-addr">{c.svc_id}{c.created_at ? ` · Opened ${String(c.created_at).slice(0, 10)}` : ""}</div>
                        <div className="cp-bar"><span style={{ width: `${Math.round((step / 3) * 100)}%` }} /></div>
                        <div className="cp-stage">Step {step} of 3 · <b>{lbl}</b></div>
                      </div>
                      <div className="cp-p-act">
                        <Link href={`/service-call/${c.svc_id}`} className="cp-view">Track →</Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* MY PROJECTS */}
        <section className="cp-section" id="projects">
          <div className="cp-wrap">
            <div className="cp-sec-head">
              <h2>My Projects</h2>
              <div className="cp-filters">
                {[["all","All"],["open","Open"],["closed","Closed"],["completed","Completed"]].map(([key,lbl])=>(
                  <button key={key} className={filter===key?"on":""} onClick={()=>setFilter(key)}>
                    {lbl} <span className="cnt">{counts[key]}</span>
                  </button>
                ))}
              </div>
            </div>
            {projects.length===0 ? (
              <div className="cp-empty">
                <div className="cp-empty-icon">📋</div>
                <div className="cp-empty-title">No projects on file</div>
                <div style={{fontSize:".9rem"}}>Your projects will appear here once your account is linked. Contact <a href="mailto:support@iot-techs.com" style={{color:"var(--accent)"}}>support@iot-techs.com</a>.</div>
              </div>
            ) : (
              <div className="cp-proj-list">
                {visible.length===0
                  ? <div className="cp-empty-proj">No projects in this view.</div>
                  : visible.map(p=>{
                      const pct   = stagePct(p.stage);
                      const snum  = stageNum(p.stage);
                      const slbl  = stageLabel(p.stage);
                      const badge = statusBadge(p);
                      return (
                        <div key={p.access_id} className="cp-proj">
                          <div>
                            <div className="p-top">
                              <h4>{p.service||p.service_code}</h4>
                              <span className={`cp-status ${badge.cls}`}>{badge.label}</span>
                            </div>
                            <div className="p-addr">{p.customer}{p.address?` · ${p.address}`:""}</div>
                            <div className="cp-bar"><span style={{width:`${pct}%`}}/></div>
                            <div className="cp-stage">Stage {snum} of {STAGE_TOTAL} · <b>{slbl}{p.date?` — ${p.date}`:""}</b></div>
                            <div className="cp-p-foot">
                              {p.customer_pin && (
                                <span className="cp-pin">
                                  <span className="cp-pin-lbl">PIN</span>
                                  <span className="cp-pin-num">{p.customer_pin}</span>
                                </span>
                              )}
                              <button className={`cp-copy${copiedId===p.access_id?" copied":""}`} onClick={()=>copyLink(p)}>
                                <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
                                {copiedId===p.access_id?"Copied!":"Copy link"}
                              </button>
                            </div>
                          </div>
                          <div className="cp-p-act">
                            <Link href={`/project/${p.access_id}`} className="cp-view">Open →</Link>
                          </div>
                        </div>
                      );
                    })
                }
              </div>
            )}
          </div>
        </section>

        <footer className="cp-footer">
          <div className="cp-wrap cp-foot-inner">
            <Link href="/" className="cp-brand" style={{ gap: 12 }}>
              <span className="bname">IOT <b>TECHS</b></span>
              <TaglinePill tone="dark" style={{ borderColor: "rgba(255,255,255,.3)" }} />
            </Link>
            <div>© 2026 IOT TECHS · La Vague Inc.</div>
            <div><Link href="/">Help</Link> · <Link href="/">Privacy</Link></div>
          </div>
        </footer>
      </div>

      {/* ACTION MODALS */}
      {activeModal && (
        <ActionModal
          type={activeModal}
          user={user}
          projects={projects}
          onClose={()=>setActiveModal(null)}
        />
      )}
    </>
  );
}
