"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";

const STAGE_PILL = {
  install: ["s-install", "Install"], schedule: ["s-install", "Schedule"],
  survey: ["s-survey", "Survey"], site_survey: ["s-survey", "Survey"],
  qc: ["s-qc", "QC"], inquiry: ["s-survey", "Inquiry"],
  proposal: ["s-proposal", "Proposal"], approval_deposit: ["s-proposal", "Approval"],
  payment: ["s-qc", "Payment"], completion: ["s-done", "Completed"],
};
function Pill({ stage }) { const [cls, lbl] = STAGE_PILL[stage] || ["s-survey", stage]; return <span className={`stage-pill ${cls}`}>{lbl}</span>; }
const money = (n) => "$" + (n || 0).toLocaleString();
const normExpStatus = (s) => s === "approved" ? "paid" : s === "rejected" ? "declined" : (s || "pending");

const TOOLS_LIST = [
  "Drill & bits", "Fish tape", "Cable stapler", "Crimping tool",
  "Multimeter", "Ladder", "Level", "Label maker",
  "Cat6 cable (50ft+)", "RJ45 connectors", "PoE injector", "Safety glasses",
];
const VEHICLE_CHECKLIST = [
  "Fuel level", "Oil level", "Tire pressure", "Brake lights",
  "Turn signals", "Windshield wipers", "First aid kit", "Fire extinguisher",
];

export default function TechClient({ user, alerts, myJobs, unassignedJobs, expenses, tickets, today }) {
  const [woFilter, setWoFilter]   = useState("all");
  const [toolsChecked, setToolsChecked] = useState({});
  const [vehicleChecked, setVehicleChecked] = useState({});
  const [nowStr, setNowStr]       = useState("");

  const first = (user.name || "Tech").split(/\s+/)[0].replace(/\(.*\)/, "").trim();

  useEffect(() => {
    function tick() {
      const d = new Date(), h = d.getHours();
      const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const hr = h % 12 || 12, mm = String(d.getMinutes()).padStart(2,"0");
      setNowStr(`${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} · ${hr}:${mm} ${h >= 12 ? "PM" : "AM"}`);
    }
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  const allJobs  = [...myJobs, ...unassignedJobs];
  const filtered = woFilter === "mine" ? myJobs : woFilter === "open" ? unassignedJobs : allJobs;

  const openTickets = (tickets || []).filter(t => t.status !== "closed");
  const myExpenses  = expenses || [];
  const chargebacks = []; // placeholder

  const KPI = [
    { cls: "c-blue",   label: "My Work Orders",       val: myJobs.length },
    { cls: "c-gold",   label: "Available Jobs",        val: unassignedJobs.length },
    { cls: "c-purple", label: "Open Tickets",          val: openTickets.length },
    { cls: "c-red",    label: "Chargebacks",           val: chargebacks.length },
  ];

  function toggleTool(item) { setToolsChecked(p => ({ ...p, [item]: !p[item] })); }
  function toggleVehicle(item) { setVehicleChecked(p => ({ ...p, [item]: !p[item] })); }

  return (
    <AdminShell user={user} alerts={alerts} active="tech">
      <style>{TK_CSS}</style>
      <div className="apx-wrap">

        <div className="welcome">
          <h1>Hey, <em>{first}</em>. You&apos;ve got <em>{myJobs.length}</em> open work orders.</h1>
          <div className="w-sub">{nowStr}</div>
        </div>

        <div className="kpi-row k4">
          {KPI.map((k) => (
            <div key={k.label} className={`kpi ${k.cls}`}>
              <div className="k-label">{k.label}</div>
              <div className="k-val">{k.val}</div>
            </div>
          ))}
        </div>

        {/* ── Work Orders ── */}
        <div className="panel mb">
          <div className="panel-head">
            <h3>Work Orders</h3>
            <div className="ph-right"><div className="tab-row">
              {[["all",`All (${allJobs.length})`],["mine",`Mine (${myJobs.length})`],["open",`Available (${unassignedJobs.length})`]].map(([k,l]) => (
                <button key={k} className={woFilter===k?"on":""} onClick={()=>setWoFilter(k)}>{l}</button>
              ))}
            </div></div>
          </div>
          {filtered.length === 0 && <div className="empty">No work orders in this view.</div>}
          {filtered.map((j) => {
            const isMine = j.tech && j.tech.split(/\s+/)[0].toLowerCase() === first.toLowerCase();
            return (
              <div className="tk-wo" key={j.access_id}>
                <div className="tk-wo-main">
                  <div className="tk-wo-title">{j.customer} — {j.service}</div>
                  <div className="tk-wo-addr">{j.address}</div>
                  <div className="tk-wo-pills">
                    <Pill stage={j.stage} />
                    <span className={`chip ${isMine ? "done" : "value"}`}>{isMine ? "Mine" : "Unassigned"}</span>
                    {j.date && <span className="tk-mut"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-1px", marginRight: 3 }}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>{j.date}</span>}
                    {j.cameras > 0 && <span className="tk-mut"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-1px", marginRight: 3 }}><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>{j.cameras} cams</span>}
                  </div>
                </div>
                <div className="tk-wo-act">
                  {!isMine && <button className="btn btn-gold btn-sm">Claim</button>}
                  <Link href={`/project/${j.access_id}`} className="btn btn-primary btn-sm">Open →</Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Tickets & Service Calls ── */}
        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Tickets</h3>
              <Link href="/tickets" className="btn btn-ghost btn-sm">View All</Link>
            </div>
            {openTickets.length === 0 && <div className="empty">No open tickets assigned to you.</div>}
            {openTickets.slice(0,5).map(t => (
              <div className="tk-ticket" key={t.id}>
                <div className="tk-t-left">
                  <span className={`tk-t-pri tk-pri-${t.priority}`}>{t.priority}</span>
                  <div>
                    <div className="tk-t-subj">{t.subject}</div>
                    {t.access_id && <div className="tk-t-meta">Project #{t.access_id}</div>}
                  </div>
                </div>
                <span className={`chip ${t.status === "open" ? "value" : "done"}`}>{t.status}</span>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Service Calls</h3>
              <button className="btn btn-ghost btn-sm">+ Log Call</button>
            </div>
            <div className="empty">No service calls logged yet.</div>
          </div>
        </div>

        {/* ── Expenses & Chargebacks ── */}
        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Expenses</h3>
              <Link href="/expenses" className="btn btn-ghost btn-sm">View All</Link>
            </div>
            {myExpenses.length === 0 && <div className="empty">No expenses on record.</div>}
            {myExpenses.slice(0,5).map(e => {
              const st = normExpStatus(e.status);
              return (
                <div className="tk-exp" key={e.id}>
                  <div className="tk-exp-l">
                    <div>
                      <div className="tk-exp-desc">{e.description}</div>
                      <div className="tk-exp-meta">{e.category || "Misc"}{e.vendor ? ` · ${e.vendor}` : ""}</div>
                    </div>
                  </div>
                  <div className="tk-exp-r">
                    <span className="tk-amt">{money(e.amount)}</span>
                    <span className={`pay-badge ${st}`}>{st}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Chargebacks</h3>
              <span className="chip">0</span>
            </div>
            <div className="empty">No chargebacks on record.</div>
          </div>
        </div>

        {/* ── Tools Checklist & Vehicle Inspection ── */}
        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Tools Checklist</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setToolsChecked({})}>Reset</button>
            </div>
            <div className="tk-checklist">
              {TOOLS_LIST.map(item => (
                <label key={item} className="tk-check-row">
                  <input type="checkbox" checked={!!toolsChecked[item]} onChange={() => toggleTool(item)} />
                  <span className={toolsChecked[item] ? "tk-chk-done" : ""}>{item}</span>
                </label>
              ))}
            </div>
            <div className="tk-check-foot">
              {Object.values(toolsChecked).filter(Boolean).length} / {TOOLS_LIST.length} checked
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Vehicle Inspection</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setVehicleChecked({})}>Reset</button>
            </div>
            <div className="tk-checklist">
              {VEHICLE_CHECKLIST.map(item => (
                <label key={item} className="tk-check-row">
                  <input type="checkbox" checked={!!vehicleChecked[item]} onChange={() => toggleVehicle(item)} />
                  <span className={vehicleChecked[item] ? "tk-chk-done" : ""}>{item}</span>
                </label>
              ))}
            </div>
            <div className="tk-check-foot">
              {Object.values(vehicleChecked).filter(Boolean).length} / {VEHICLE_CHECKLIST.length} checked
            </div>
          </div>
        </div>

        {/* ── Training & Certifications ── */}
        <div className="panel mb">
          <div className="panel-head">
            <h3>Training &amp; Certifications</h3>
            <button className="btn btn-ghost btn-sm">+ Add</button>
          </div>
          <div className="tk-certs">
            {[
              { name: "Low-Voltage Wiring (NEC)", status: "current", expires: "2027-06-01" },
              { name: "OSHA 10 Safety",            status: "current", expires: "2027-01-15" },
              { name: "IP Camera Configuration",   status: "pending", expires: null },
              { name: "Access Control Systems",    status: "pending", expires: null },
            ].map(c => (
              <div className="tk-cert-row" key={c.name}>
                <div className="tk-cert-name">{c.name}</div>
                <div className="tk-cert-right">
                  {c.expires && <span className="tk-cert-exp">Expires {c.expires}</span>}
                  <span className={`chip ${c.status === "current" ? "done" : "value"}`}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AdminShell>
  );
}

const TK_CSS = `
.apx .tk-wo{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);transition:.12s}
.apx .tk-wo:last-child{border-bottom:none}
.apx .tk-wo:hover{background:var(--bg-soft)}
.apx .tk-wo-main{min-width:0}
.apx .tk-wo-title{font-weight:600;font-size:.9rem;margin-bottom:3px}
.apx .tk-wo-addr{font-size:.78rem;color:var(--muted);margin-bottom:7px}
.apx .tk-wo-pills{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.apx .tk-mut{font-size:.74rem;color:var(--muted)}
.apx .tk-wo-act{display:flex;gap:7px;align-items:center;flex-shrink:0}
.apx .tk-wo-act .btn{text-decoration:none}

.apx .tk-ticket{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;border-bottom:1px solid var(--line)}
.apx .tk-ticket:last-child{border-bottom:none}
.apx .tk-t-left{display:flex;align-items:center;gap:10px;min-width:0}
.apx .tk-t-pri{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border-radius:6px;white-space:nowrap;flex-shrink:0}
.apx .tk-pri-urgent{background:rgba(231,76,60,.12);color:#c0392b}
.apx .tk-pri-medium{background:rgba(224,154,58,.12);color:#8a5f00}
.apx .tk-pri-low{background:rgba(99,117,155,.1);color:#5a6d8a}
.apx .tk-t-subj{font-weight:600;font-size:.86rem}
.apx .tk-t-meta{font-size:.74rem;color:var(--muted);margin-top:2px}

.apx .tk-exp{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;border-bottom:1px solid var(--line)}
.apx .tk-exp:last-child{border-bottom:none}
.apx .tk-exp-l{display:flex;align-items:center;gap:10px;min-width:0}
.apx .tk-exp-desc{font-weight:600;font-size:.85rem}
.apx .tk-exp-meta{font-size:.74rem;color:var(--muted);margin-top:2px}
.apx .tk-exp-r{display:flex;align-items:center;gap:10px;flex-shrink:0}
.apx .tk-amt{font-weight:700;font-size:.9rem}
.apx .pay-badge{font-size:.72rem;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:6px}
.apx .pay-badge.pending{background:rgba(224,154,58,.12);color:#8a5f00}
.apx .pay-badge.paid{background:rgba(28,138,69,.1);color:#1c6b3a}
.apx .pay-badge.declined{background:rgba(231,76,60,.1);color:#c0392b}

.apx .tk-checklist{padding:4px 18px 8px;display:flex;flex-direction:column;gap:2px}
.apx .tk-check-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);cursor:pointer;font-size:.86rem}
.apx .tk-check-row:last-child{border-bottom:none}
.apx .tk-check-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent-primary);flex-shrink:0;cursor:pointer}
.apx .tk-chk-done{text-decoration:line-through;color:var(--muted)}
.apx .tk-check-foot{padding:10px 18px;font-size:.78rem;color:var(--muted);border-top:1px solid var(--line);font-weight:600}

.apx .tk-certs{padding:0}
.apx .tk-cert-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 18px;border-bottom:1px solid var(--line)}
.apx .tk-cert-row:last-child{border-bottom:none}
.apx .tk-cert-name{font-weight:600;font-size:.86rem}
.apx .tk-cert-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
.apx .tk-cert-exp{font-size:.74rem;color:var(--muted)}
`;
