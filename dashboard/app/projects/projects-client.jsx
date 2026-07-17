"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import ConfirmDialog from "../components/confirm-dialog";
import { archiveProjectAction } from "./actions";

const money = (n) => "$" + (n || 0).toLocaleString();
const CLOSED = new Set(["payment", "completion"]);
const STAGE_PILL = {
  inquiry: ["s-survey", "Inquiry"], site_survey: ["s-survey", "Survey"],
  proposal: ["s-proposal", "Proposal"], approval_deposit: ["s-proposal", "Approval"],
  schedule: ["s-install", "Schedule"], install: ["s-install", "Install"],
  qc: ["s-qc", "QC"], payment: ["s-qc", "Payment"], completion: ["s-done", "Completed"],
};
function initials(name) { return (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }
function daysSince(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso + (iso.includes("T") ? "Z" : " UTC"))) / 86400000);
  return d < 0 ? 0 : d;
}
function daysLabel(d) {
  if (d === 0) return "Today";
  if (d === 1) return "1d";
  return `${d}d`;
}
function daysColor(d, stage) {
  if (["payment","completion"].includes(stage)) return { bg: "rgba(91,184,122,.12)", color: "#1c8a45" };
  if (d <= 3)  return { bg: "rgba(91,184,122,.12)",  color: "#1c8a45" };
  if (d <= 7)  return { bg: "rgba(224,154,58,.12)",  color: "#b87300" };
  if (d <= 14) return { bg: "rgba(231,76,60,.1)",    color: "#c0392b" };
  return              { bg: "rgba(231,76,60,.18)",   color: "#a93226" };
}

const TABS = [
  ["all",       "All"],
  ["inquiry",   "Inquiries"],
  ["active",    "Active"],
  ["needs",     "Needs Action"],
  ["completed", "Completed"],
];

function matches(p, filter) {
  if (filter === "all") return true;
  if (filter === "inquiry") return p.stage === "inquiry";
  if (filter === "active") return !CLOSED.has(p.stage);
  if (filter === "needs") return ["proposal", "approval_deposit", "qc"].includes(p.stage);
  if (filter === "completed") return p.stage === "completion";
  return true;
}

export default function ProjectsClient({ user, alerts, projects, initialFilter = "all" }) {
  const [filter, setFilter] = useState(TABS.some((t) => t[0] === initialFilter) ? initialFilter : "all");
  const [query, setQuery]   = useState("");
  const [archiveTarget, setArchiveTarget] = useState(null);   // project pending archive-confirm
  const [pending, startTx]  = useTransition();
  const router = useRouter();
  const q = query.trim().toLowerCase();
  const canArchive = ["admin", "manager"].includes(user?.role);

  function confirmArchive() {
    const id = archiveTarget?.access_id;
    setArchiveTarget(null);
    if (!id) return;
    startTx(async () => { await archiveProjectAction(id); router.refresh(); });
  }

  const visible = projects
    .filter((p) => matches(p, filter))
    .filter((p) => !q || p.customer.toLowerCase().includes(q) || (p.service || "").toLowerCase().includes(q) || (p.address || "").toLowerCase().includes(q) || p.access_id.toLowerCase().includes(q));

  const counts = Object.fromEntries(TABS.map(([k]) => [k, projects.filter((p) => matches(p, k)).length]));

  return (
    <AdminShell user={user} alerts={alerts} active="dashboard">
      <div className="apx-wrap">
        <div className="page-head"><h1>Projects</h1><div className="ph-sub">{projects.length} projects · most recent first</div></div>

        <div className="sec-head">
          <div className="filters">
            {TABS.map(([k, lbl]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{lbl} <span style={{ opacity: .6 }}>{counts[k]}</span></button>
            ))}
          </div>
          <input className="apx-input" style={{ maxWidth: 320 }} placeholder="Search customer, service, address, ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="panel mb">
          {visible.length === 0 ? <div className="empty">No projects in this view.</div> : visible.map((p) => {
            const [cls, lbl] = STAGE_PILL[p.stage] || ["s-survey", p.stage];
            const days = daysSince(p.created_at);
            const dc   = days !== null ? daysColor(days, p.stage) : null;
            return (
              <div key={p.access_id} className="crow" onClick={() => router.push(`/project/${p.access_id}`)}>
                <span className="cav">{initials(p.customer)}</span>
                <div className="c-main">
                  <div className="c-name">{p.customer}</div>
                  <div className="c-contact">{p.service}{p.address ? ` · ${p.address}` : ""}</div>
                  <div className="c-addr mono" style={{ fontSize: ".72rem" }}>{p.access_id}{p.tech ? ` · ${p.tech}` : ""}{p.date ? ` · ${p.date}` : ""}</div>
                </div>
                <div className="c-chips">
                  <span className={`stage-pill ${cls}`}>{lbl}</span>
                  {p.value ? <span className="chip value">{money(p.value)}</span> : null}
                  {dc && (
                    <span title={`Opened ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}`}
                      style={{ fontSize: ".7rem", fontWeight: 700, padding: "2px 7px", borderRadius: 100, background: dc.bg, color: dc.color, letterSpacing: ".02em" }}>
                      {daysLabel(days)}
                    </span>
                  )}
                  {p.inventoryShort && (
                    <span title="Inventory shortage — allocated qty exceeds available stock" style={{ fontSize: ".7rem", fontWeight: 700, padding: "2px 7px", borderRadius: 100, background: "rgba(231,76,60,.1)", color: "#c0392b" }}>
                      ⚠ Inventory
                    </span>
                  )}
                </div>
                {canArchive && (
                  <button
                    className="prj-arch"
                    title="Archive project"
                    disabled={pending}
                    onClick={(e) => { e.stopPropagation(); setArchiveTarget(p); }}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>
                  </button>
                )}
                <span className="c-arr">→</span>
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        open={!!archiveTarget}
        title="Archive this project?"
        message={<>“{archiveTarget?.customer}” — {archiveTarget?.access_id} will be moved to <strong>Archives</strong>. You can restore it anytime; the customer’s other projects are untouched.</>}
        confirmLabel="Archive"
        busy={pending}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />

      <style>{`
        .apx .prj-arch{flex-shrink:0;width:30px;height:30px;display:grid;place-items:center;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--muted);cursor:pointer;transition:background .12s,color .12s,border-color .12s}
        .apx .prj-arch:hover{background:rgba(231,76,60,.08);border-color:rgba(231,76,60,.35);color:#c0392b}
        .apx .prj-arch:disabled{opacity:.4;cursor:default}
      `}</style>
    </AdminShell>
  );
}
