"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../../components/admin-shell";
import { STATUS, STATUS_TONE } from "../../../lib/spec";
import { saveCustomerContact } from "./actions";

const money = (n) => "$" + (n || 0).toLocaleString();

const CATS = [
  { key: "all",       label: "All" },
  { key: "open",      label: "Active" },
  { key: "pending",   label: "Pending" },
  { key: "upgrade",   label: "Upgrades" },
  { key: "service",   label: "Work Orders" },
  { key: "completed", label: "Completed" },
];

// tone → [text, bg, border]
const TONE = {
  green: ["#1c8a45", "#e7f6ec", "#bfe6cf"],
  gold:  ["#b08f4f", "#faf4e8", "#ecd9b0"],
  blue:  ["#3257ff", "#eef1ff", "#cdd6ff"],
  amber: ["#b45309", "#fef3c7", "#f3d68b"],
  red:   ["#d23c3c", "#fdeaea", "#f3c9c9"],
  gray:  ["#5b6275", "#f0f2f7", "#e6e8ee"],
};
function toneOf(status) { return TONE[STATUS_TONE[status]] || TONE.gray; }

function ProjectCard({ job, onOpen }) {
  const [tc, bg, bd] = toneOf(job.status);
  return (
    <div
      onClick={() => onOpen(job.access_id)}
      style={{
        background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: "15px 16px",
        cursor: "pointer", transition: "box-shadow .15s, border-color .15s", display: "flex", flexDirection: "column", gap: 8,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(14,19,32,.08)"; e.currentTarget.style.borderColor = "var(--gold)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--line)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="mono" style={{ fontWeight: 700, color: "var(--ink)", fontSize: ".9rem" }}>{job.access_id}</span>
        <span style={{ fontSize: ".68rem", fontWeight: 700, padding: "3px 9px", borderRadius: 100, color: tc, background: bg, border: `1px solid ${bd}` }}>
          {STATUS[job.status] || job.status}
        </span>
      </div>
      <div style={{ fontSize: ".82rem", color: "var(--muted)" }}>
        {job.issue ? job.issue : `${job.cameras} camera${job.cameras !== 1 ? "s" : ""}`} · {job.stageLabel}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: ".8rem" }}>
        <span style={{ fontWeight: 700, color: "var(--ink)" }}>{job.value ? money(job.value) : "—"}</span>
        <span style={{ color: "var(--muted)" }}>{job.tech || ""}{job.date ? ` · ${job.date}` : ""}</span>
      </div>
    </div>
  );
}

export default function CustomerProfileClient({ user, alerts, customer, jobs, notFoundName }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [fields, setFields] = useState(() => ({
    contact_name:    customer?.contact_name    || "",
    contact_email:   customer?.contact_email   || "",
    contact_phone:   customer?.contact_phone   || "",
    contact_message: customer?.contact_message || "",
    source:          customer?.source          || "internal",
  }));
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("all");

  if (notFoundName) {
    return (
      <AdminShell user={user} alerts={alerts} active="customers">
        <div className="apx-wrap" style={{ paddingTop: 30 }}>
          <button className="btn" style={{ border: "1px solid var(--line)", background: "#fff", marginBottom: 18 }} onClick={() => router.push("/customers")}>← Customers</button>
          <div className="panel" style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
            No customer found for &ldquo;{notFoundName}&rdquo;.
          </div>
        </div>
      </AdminShell>
    );
  }

  const visibleJobs = tab === "all" ? jobs : jobs.filter((j) => j.category === tab);

  function handleSave() {
    startTransition(async () => {
      await saveCustomerContact(customer.customer, fields);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2500);
    });
  }
  function handleCancel() {
    setFields({
      contact_name:    customer.contact_name    || "",
      contact_email:   customer.contact_email   || "",
      contact_phone:   customer.contact_phone   || "",
      contact_message: customer.contact_message || "",
      source:          customer.source          || "internal",
    });
    setEditing(false);
  }

  return (
    <AdminShell user={user} alerts={alerts} active="customers">
      <div className="apx-wrap">
        {/* Back + header */}
        <div className="page-head" style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 22 }}>
          <button
            onClick={() => router.push("/customers")}
            style={{ background: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: ".82rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 4 }}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Customers
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: "1.5rem", color: "var(--ink)", margin: 0 }}>{customer.customer}</h1>
            {customer.address && <div className="ph-sub" style={{ color: "var(--muted)", fontSize: ".86rem", marginTop: 3 }}>{customer.address}</div>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
            {saved && <span style={{ fontSize: ".74rem", fontWeight: 700, color: "var(--green)", background: "var(--green-soft)", border: "1px solid #bfe6cf", borderRadius: 100, padding: "4px 12px", alignSelf: "center" }}>Saved</span>}
            <span style={chip()}>{customer.total_projects} project{customer.total_projects !== 1 ? "s" : ""}</span>
            {customer.active_count > 0 && <span style={chip("#3257ff", "#eef1ff", "#cdd6ff")}>{customer.active_count} active</span>}
            {customer.completed_count > 0 && <span style={chip("#1c8a45", "#e7f6ec", "#bfe6cf")}>{customer.completed_count} done</span>}
            <span style={chip("#b08f4f", "#faf4e8", "#ecd9b0")}>{money(customer.total_value)}</span>
          </div>
        </div>

        {/* Contact card */}
        <div className="panel mb">
          <div className="panel-head">
            <h3>Contact Information</h3>
            {!editing && <button className="btn" style={{ border: "1px solid var(--line)", background: "#fff", padding: "6px 14px" }} onClick={() => setEditing(true)}>Edit</button>}
          </div>
          <div style={{ padding: "18px" }}>
            {editing ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="np-f"><label>Name</label><input className="apx-input" value={fields.contact_name} onChange={(e) => setFields({ ...fields, contact_name: e.target.value })} placeholder="Contact name" /></div>
                <div className="np-f"><label>Email</label><input className="apx-input" type="email" value={fields.contact_email} onChange={(e) => setFields({ ...fields, contact_email: e.target.value })} placeholder="email@example.com" /></div>
                <div className="np-f"><label>Phone</label><input className="apx-input" value={fields.contact_phone} onChange={(e) => setFields({ ...fields, contact_phone: e.target.value })} placeholder="(000) 000-0000" /></div>
                <div className="np-f">
                  <label>Source</label>
                  <select className="apx-input" value={fields.source} onChange={(e) => setFields({ ...fields, source: e.target.value })}>
                    <option value="internal">Internal</option>
                    <option value="web">Web</option>
                    <option value="referral">Referral</option>
                    <option value="existing">Existing</option>
                    <option value="cold_call">Cold Call</option>
                  </select>
                </div>
                <div className="np-f" style={{ gridColumn: "1 / -1" }}><label>Notes</label><textarea className="apx-input" rows={3} value={fields.contact_message} onChange={(e) => setFields({ ...fields, contact_message: e.target.value })} placeholder="Notes from intake or follow-up…" /></div>
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
                  <button className="btn btn-primary" onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : "Save Changes"}</button>
                  <button className="btn" style={{ border: "1px solid var(--line)", background: "#fff" }} onClick={handleCancel} disabled={isPending}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 28px" }}>
                <Field label="Name" value={fields.contact_name} />
                <Field label="Email" value={fields.contact_email} href={fields.contact_email ? `mailto:${fields.contact_email}` : null} />
                <Field label="Phone" value={fields.contact_phone} href={fields.contact_phone ? `tel:${fields.contact_phone}` : null} />
                <Field label="Source" value={fields.source} capitalize />
                {fields.contact_message && <div style={{ gridColumn: "1 / -1" }}><Field label="Notes" value={fields.contact_message} /></div>}
              </div>
            )}
          </div>
        </div>

        {/* Projects */}
        <div className="panel">
          <div className="panel-head" style={{ flexWrap: "wrap", gap: 10 }}>
            <h3>Projects ({jobs.length})</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CATS.map((cat) => {
                const count = cat.key === "all" ? jobs.length : jobs.filter((j) => j.category === cat.key).length;
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
              <div style={{ padding: "28px 12px", textAlign: "center", color: "var(--muted)", fontSize: ".88rem" }}>No projects in this category.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
                {visibleJobs.map((j) => <ProjectCard key={j.access_id} job={j} onOpen={(id) => router.push(`/project/${id}`)} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function chip(tc = "var(--muted)", bg = "var(--bg-tint)", bd = "var(--line)") {
  return { fontSize: ".74rem", fontWeight: 700, padding: "4px 12px", borderRadius: 100, color: tc, background: bg, border: `1px solid ${bd}`, alignSelf: "center", whiteSpace: "nowrap" };
}

function Field({ label, value, href, capitalize }) {
  return (
    <div>
      <div style={{ fontSize: ".68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: ".9rem", color: "var(--ink)", textTransform: capitalize ? "capitalize" : "none" }}>
        {value ? (href ? <a href={href} style={{ color: "var(--gold-deep)", textDecoration: "none" }}>{value}</a> : value) : <span style={{ color: "var(--muted)" }}>—</span>}
      </div>
    </div>
  );
}
