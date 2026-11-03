"use client";

// Customer homepage (admin side) — one place to see a client and act on them: start a project or a
// service call, log an interaction, and review their projects, quotes, inquiries and full activity.
// Presentation only: every project/quote/call/number comes from the canonical tables via getCustomerHub.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminShell, { NewProjectModal } from "../../components/admin-shell";
import { STATUS, STATUS_TONE } from "../../../lib/spec";
import { updateCustomerAction, customerProjectsAction } from "../../components/crm-actions";
import { createServiceCallAction } from "../../service-calls/actions";
import { addCustomerNoteAction } from "./actions";

const money = (n) => "$" + (Math.round(+n || 0)).toLocaleString();
const fmtDay = (d) => { if (!d) return ""; try { return new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return String(d).slice(0, 10); } };
const fmtWhen = (d) => { if (!d) return ""; const s = String(d).replace("T", " "); try { return new Date(s.replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return s.slice(0, 16); } };
const initials = (name) => (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// tone → [text, bg, border]
const TONE = {
  green: ["#1c8a45", "#e7f6ec", "#bfe6cf"], gold: ["#b08f4f", "#faf4e8", "#ecd9b0"],
  blue:  ["#3257ff", "#eef1ff", "#cdd6ff"], amber: ["#b45309", "#fef3c7", "#f3d68b"],
  red:   ["#d23c3c", "#fdeaea", "#f3c9c9"], gray: ["#5b6275", "#f0f2f7", "#e6e8ee"],
};
const toneOf = (status) => TONE[STATUS_TONE[status]] || TONE.gray;
const QUOTE_TONE = { draft: TONE.gray, sent: TONE.blue, signed: TONE.green, accepted: TONE.green, superseded: TONE.amber, void: TONE.red };
const SVC_TONE = { new: TONE.blue, scheduled: TONE.gold, in_progress: TONE.amber, resolved: TONE.green, closed: TONE.gray };

const I = {
  project: <path d="M3 7h18M3 7l2-3h14l2 3M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7" />,
  service: <><path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.8 2.8-2.1-2.1z" /></>,
  note:    <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  phone:   <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  mail:    <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  back:    <polyline points="15 18 9 12 15 6" />,
};
const Icon = ({ d, w = 16 }) => <svg viewBox="0 0 24 24" width={w} height={w} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;

function chip(tc = "var(--muted)", bg = "var(--bg-tint)", bd = "var(--line)") {
  return { fontSize: ".74rem", fontWeight: 700, padding: "4px 12px", borderRadius: 100, color: tc, background: bg, border: `1px solid ${bd}`, alignSelf: "center", whiteSpace: "nowrap" };
}
function Badge({ tone, children }) {
  const [tc, bg, bd] = tone || TONE.gray;
  return <span style={{ fontSize: ".66rem", fontWeight: 700, padding: "3px 9px", borderRadius: 100, color: tc, background: bg, border: `1px solid ${bd}`, textTransform: "capitalize", whiteSpace: "nowrap" }}>{children}</span>;
}

const CATS = [
  { key: "all", label: "All" }, { key: "open", label: "Active" }, { key: "pending", label: "Pending" },
  { key: "upgrade", label: "Upgrades" }, { key: "service", label: "Work Orders" }, { key: "completed", label: "Completed" },
];

export default function CustomerHubClient({ user, alerts, hub }) {
  const router = useRouter();
  const { summary } = hub;
  const [npOpen, setNpOpen] = useState(false);
  const [svcOpen, setSvcOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [contact, setContact] = useState({ name: summary.name || "", email: summary.email || "", phone: summary.phone || "" });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cErr, setCErr] = useState("");
  const [note, setNote] = useState("");
  const [activity, setActivity] = useState(hub.activity || []);
  const [isPending, startTransition] = useTransition();

  const projects = hub.projects || [];
  const quotes = hub.quotes || [];
  const serviceCalls = hub.serviceCalls || [];
  const inquiries = hub.inquiries || [];
  const activeCount = projects.filter((p) => ["open", "pending"].includes(p.category)).length;
  const doneCount = projects.filter((p) => p.category === "completed").length;
  const totalValue = projects.reduce((s, p) => s + (+p.value || 0), 0);
  const visibleJobs = tab === "all" ? projects : projects.filter((p) => p.category === tab);

  function saveContact() {
    setCErr("");
    startTransition(async () => {
      const r = await updateCustomerAction(summary.id, contact);
      if (r?.ok) { setEditing(false); setSaved(true); setTimeout(() => setSaved(false), 2200); }
      else setCErr(r?.error || "Couldn't save.");
    });
  }
  function addNote() {
    const body = note.trim();
    if (!body) return;
    startTransition(async () => {
      const r = await addCustomerNoteAction(summary.id, body);
      if (r?.ok) { setNote(""); setActivity(r.activity || activity); }
    });
  }

  return (
    <AdminShell user={user} alerts={alerts} active="customers">
      <div className="apx-wrap">
        {/* Header */}
        <div className="page-head" style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
          <button onClick={() => router.push("/customers")} aria-label="Customers"
            style={{ background: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: "var(--muted)", display: "flex", flexShrink: 0, marginTop: 2 }}>
            <Icon d={I.back} w={14} />
          </button>
          <div style={{ width: 52, height: 52, borderRadius: "50%", flexShrink: 0, background: "var(--gold-soft, #faf4e8)", border: "1px solid #ecd9b0", color: "var(--gold-deep, #b08f4f)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.1rem", fontFamily: "'Bricolage Grotesque',sans-serif" }}>
            {initials(summary.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: "1.5rem", color: "var(--ink)", margin: 0 }}>{summary.name || "Customer"}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 16px", color: "var(--muted)", fontSize: ".86rem", marginTop: 3 }}>
              {summary.company && <span>{summary.company}</span>}
              {summary.email && <a href={`mailto:${summary.email}`} style={{ color: "var(--muted)" }}>{summary.email}</a>}
              {summary.phone && <a href={`tel:${summary.phone}`} style={{ color: "var(--muted)" }}>{summary.phone}</a>}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "flex-end" }}>
            <span style={chip()}>{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
            {activeCount > 0 && <span style={chip("#3257ff", "#eef1ff", "#cdd6ff")}>{activeCount} active</span>}
            {doneCount > 0 && <span style={chip("#1c8a45", "#e7f6ec", "#bfe6cf")}>{doneCount} done</span>}
            {totalValue > 0 && <span style={chip("#b08f4f", "#faf4e8", "#ecd9b0")}>{money(totalValue)}</span>}
          </div>
        </div>

        {/* Action rail */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          <RailBtn primary icon={I.project} onClick={() => setNpOpen(true)}>Project</RailBtn>
          <RailBtn icon={I.service} onClick={() => setSvcOpen(true)}>Service</RailBtn>
          {summary.phone && <RailBtn icon={I.phone} href={`tel:${summary.phone}`}>Call</RailBtn>}
          {summary.email && <RailBtn icon={I.mail} href={`mailto:${summary.email}`}>Email</RailBtn>}
        </div>

        {/* Contact */}
        <div className="panel mb">
          <div className="panel-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3>Contact</h3>
            {saved ? <span style={chip("#1c8a45", "#e7f6ec", "#bfe6cf")}>Saved</span>
              : !editing && <button className="btn" style={{ border: "1px solid var(--line)", background: "#fff", padding: "6px 14px" }} onClick={() => setEditing(true)}>Edit</button>}
          </div>
          <div style={{ padding: 18 }}>
            {editing ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="np-f"><label>Name</label><input className="apx-input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></div>
                <div className="np-f"><label>Email</label><input className="apx-input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></div>
                <div className="np-f"><label>Phone</label><input className="apx-input" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
                {cErr && <div style={{ gridColumn: "1 / -1", color: "var(--red, #d23c3c)", fontSize: ".82rem", fontWeight: 600 }}>{cErr}</div>}
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
                  <button className="btn btn-primary" onClick={saveContact} disabled={isPending}>{isPending ? "Saving…" : "Save"}</button>
                  <button className="btn" style={{ border: "1px solid var(--line)", background: "#fff" }} onClick={() => { setEditing(false); setContact({ name: summary.name || "", email: summary.email || "", phone: summary.phone || "" }); setCErr(""); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 28px" }}>
                <Field label="Name" value={summary.name} />
                <Field label="Email" value={summary.email} href={summary.email ? `mailto:${summary.email}` : null} />
                <Field label="Phone" value={summary.phone} href={summary.phone ? `tel:${summary.phone}` : null} />
                {summary.company && <Field label="Company" value={summary.company} />}
              </div>
            )}
          </div>
        </div>

        {/* Projects */}
        <div className="panel mb">
          <div className="panel-head" style={{ flexWrap: "wrap", gap: 10 }}>
            <h3>Projects ({projects.length})</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CATS.map((cat) => {
                const count = cat.key === "all" ? projects.length : projects.filter((j) => j.category === cat.key).length;
                if (cat.key !== "all" && count === 0) return null;
                const on = tab === cat.key;
                return (
                  <button key={cat.key} onClick={() => setTab(cat.key)}
                    style={{ fontFamily: "inherit", fontSize: ".78rem", fontWeight: 600, padding: "5px 12px", borderRadius: 100, cursor: "pointer",
                      border: `1.5px solid ${on ? "var(--ink)" : "var(--line)"}`, background: on ? "var(--ink)" : "#fff", color: on ? "#fff" : "var(--muted)" }}>
                    {cat.label} <span style={{ opacity: .7 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {visibleJobs.length === 0 ? (
              <div style={{ padding: "26px 12px", textAlign: "center", color: "var(--muted)", fontSize: ".88rem" }}>No projects.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
                {visibleJobs.map((j) => <ProjectCard key={j.access_id} job={j} onOpen={() => router.push(`/project/${j.access_id}`)} />)}
              </div>
            )}
          </div>
        </div>

        {/* Quotes — render only when real */}
        {quotes.length > 0 && (
          <div className="panel mb">
            <div className="panel-head"><h3>Quotes ({quotes.length})</h3></div>
            <div style={{ padding: "6px 0" }}>
              {quotes.map((q) => (
                <Row key={q.access_id} onClick={() => router.push(`/project/${q.access_id}?open=proposal`)}>
                  <span className="mono" style={{ fontWeight: 700, color: "var(--ink)" }}>{q.access_id}</span>
                  <span style={{ color: "var(--muted)", fontSize: ".82rem" }}>v{q.version}</span>
                  <Badge tone={QUOTE_TONE[q.status]}>{q.status}</Badge>
                  <span style={{ flex: 1 }} />
                  {q.value > 0 && <span style={{ fontWeight: 700, color: "var(--ink)" }}>{money(q.value)}</span>}
                  <span style={{ color: "var(--muted)", fontSize: ".8rem", minWidth: 86, textAlign: "right" }}>{fmtDay(q.sent_at || q.created_at)}</span>
                </Row>
              ))}
            </div>
          </div>
        )}

        {/* Service calls — render only when real */}
        {serviceCalls.length > 0 && (
          <div className="panel mb">
            <div className="panel-head"><h3>Service Calls ({serviceCalls.length})</h3></div>
            <div style={{ padding: "6px 0" }}>
              {serviceCalls.map((c) => (
                <Row key={c.svc_id} onClick={() => router.push(`/service-calls/${c.svc_id}`)}>
                  <span className="mono" style={{ fontWeight: 700, color: "var(--ink)" }}>{c.svc_id}</span>
                  <Badge tone={SVC_TONE[c.stage]}>{c.stage_label || c.stage}</Badge>
                  <span style={{ flex: 1, minWidth: 0, color: "var(--muted)", fontSize: ".82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.issue}</span>
                  <span style={{ color: "var(--muted)", fontSize: ".8rem", minWidth: 86, textAlign: "right" }}>{fmtDay(c.created_at)}</span>
                </Row>
              ))}
            </div>
          </div>
        )}

        {/* Inquiries — render only when real */}
        {inquiries.length > 0 && (
          <div className="panel mb">
            <div className="panel-head"><h3>Inquiries ({inquiries.length})</h3></div>
            <div style={{ padding: "6px 0" }}>
              {inquiries.map((q) => (
                <Row key={q.access_id} onClick={() => router.push(`/project/${q.access_id}`)}>
                  <span className="mono" style={{ fontWeight: 700, color: "var(--ink)" }}>{q.access_id}</span>
                  <Badge tone={TONE.gold}>{q.stageLabel || q.stage}</Badge>
                  {q.source && <span style={{ color: "var(--muted)", fontSize: ".78rem", textTransform: "capitalize" }}>{q.source}</span>}
                  <span style={{ flex: 1, minWidth: 0, color: "var(--muted)", fontSize: ".82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.address || ""}</span>
                  <span style={{ color: "var(--muted)", fontSize: ".8rem", minWidth: 86, textAlign: "right" }}>{fmtDay(q.created_at)}</span>
                </Row>
              ))}
            </div>
          </div>
        )}

        {/* Activity + log */}
        <div className="panel">
          <div className="panel-head"><h3>Activity</h3></div>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input className="apx-input" placeholder="Log a call, note, follow-up…" value={note}
                onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={addNote} disabled={isPending || !note.trim()}>Add</button>
            </div>
            {activity.length === 0 ? (
              <div style={{ padding: "18px 12px", textAlign: "center", color: "var(--muted)", fontSize: ".86rem" }}>No activity yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {activity.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 6, flexShrink: 0, background: e.source === "service" ? "#b45309" : e.source === "customer" ? "#b08f4f" : "#3257ff" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: ".86rem", color: "var(--ink)" }}>{e.label || e.kind}</div>
                      <div style={{ fontSize: ".74rem", color: "var(--muted)", marginTop: 1 }}>
                        {[e.ref, e.actor, fmtWhen(e.at)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {npOpen && <NewProjectModal user={user} initialClientId={summary.id} onClose={() => setNpOpen(false)} />}
      {svcOpen && <ServiceCallModal customerId={summary.id} onClose={() => setSvcOpen(false)} onCreated={(svcId) => router.push(`/service-calls/${svcId}`)} />}
    </AdminShell>
  );
}

function RailBtn({ icon, children, onClick, href, primary }) {
  const style = {
    display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 10,
    fontFamily: "inherit", fontSize: ".86rem", fontWeight: 700, cursor: "pointer", textDecoration: "none",
    border: `1px solid ${primary ? "var(--ink)" : "var(--line)"}`,
    background: primary ? "var(--ink)" : "#fff", color: primary ? "#fff" : "var(--ink)",
  };
  const inner = <><Icon d={icon} w={16} />{children}</>;
  return href ? <a href={href} style={style}>{inner}</a> : <button type="button" onClick={onClick} style={style}>{inner}</button>;
}

function Row({ children, onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", cursor: "pointer", borderTop: "1px solid var(--line)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-tint, #f7f8fa)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      {children}
    </div>
  );
}

function ProjectCard({ job, onOpen }) {
  const [tc, bg, bd] = toneOf(job.status);
  return (
    <div onClick={onOpen}
      style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: "15px 16px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(14,19,32,.08)"; e.currentTarget.style.borderColor = "var(--gold)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--line)"; }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="mono" style={{ fontWeight: 700, color: "var(--ink)", fontSize: ".9rem" }}>{job.access_id}</span>
        <span style={{ fontSize: ".68rem", fontWeight: 700, padding: "3px 9px", borderRadius: 100, color: tc, background: bg, border: `1px solid ${bd}` }}>{STATUS[job.status] || job.status}</span>
      </div>
      <div style={{ fontSize: ".82rem", color: "var(--muted)" }}>{job.issue ? job.issue : `${job.cameras} camera${job.cameras !== 1 ? "s" : ""}`} · {job.stageLabel}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: ".8rem" }}>
        <span style={{ fontWeight: 700, color: "var(--ink)" }}>{job.value ? money(job.value) : "—"}</span>
        <span style={{ color: "var(--muted)" }}>{job.tech || ""}{job.date ? ` · ${job.date}` : ""}</span>
      </div>
    </div>
  );
}

function Field({ label, value, href }) {
  return (
    <div>
      <div style={{ fontSize: ".68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: ".9rem", color: "var(--ink)" }}>
        {value ? (href ? <a href={href} style={{ color: "var(--gold-deep)", textDecoration: "none" }}>{value}</a> : value) : <span style={{ color: "var(--muted)" }}>—</span>}
      </div>
    </div>
  );
}

// Compact service-call starter: pick one of the client's systems (optional) + describe the issue. Reuses
// createServiceCallAction (which inherits customer/contact/address from the project or the CRM record).
function ServiceCallModal({ customerId, onClose, onCreated }) {
  const [rows, setRows] = useState(null);
  const [projectAccessId, setProject] = useState("");
  const [issue, setIssue] = useState("");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (rows === null) customerProjectsAction(customerId).then((r) => setRows(r?.rows || [])).catch(() => setRows([]));

  async function submit() {
    const text = issue.trim();
    if (!text) { setErr("Describe the issue."); return; }
    setBusy(true); setErr("");
    const r = await createServiceCallAction({ customerId, projectAccessId: projectAccessId || null, issue: text, priority, category });
    setBusy(false);
    if (r?.ok) onCreated(r.svcId); else setErr(r?.error || "Couldn't start the call.");
  }

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(16,20,24,.42)", padding: 20 }}>
      <div role="dialog" aria-modal="true" style={{ width: "100%", maxWidth: 440, background: "#fff", border: "1px solid var(--line)", borderRadius: 16, boxShadow: "0 18px 48px rgba(16,20,24,.22)", padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "var(--ink)" }}>New Service Call</h3>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "none", fontSize: "1.4rem", lineHeight: 1, color: "var(--muted)", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="np-f"><label>System <em style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</em></label>
            <select className="apx-input" value={projectAccessId} onChange={(e) => setProject(e.target.value)}>
              <option value="">No specific project</option>
              {(rows || []).map((p) => <option key={p.access_id} value={p.access_id}>{p.access_id} · {p.service_label}{p.address ? ` · ${p.address}` : ""}</option>)}
            </select>
          </div>
          <div className="np-f"><label>Issue</label>
            <textarea className="apx-input" rows={3} placeholder="What's happening?" value={issue} onChange={(e) => setIssue(e.target.value)} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="np-f"><label>Priority</label>
              <select className="apx-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select></div>
            <div className="np-f"><label>Category</label>
              <select className="apx-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="camera">Camera</option><option value="dropout">Dropout</option><option value="nvr">NVR</option><option value="other">Other</option>
              </select></div>
          </div>
          {err && <div style={{ color: "var(--red, #d23c3c)", fontSize: ".82rem", fontWeight: 600 }}>{err}</div>}
          <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ width: "100%", height: 42 }}>{busy ? "Starting…" : "Start Service Call"}</button>
        </div>
      </div>
    </div>
  );
}
