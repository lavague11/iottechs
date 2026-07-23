"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";

// Stage → pill class + short label, reusing the project stage-pill palette.
const STAGE_PILL = {
  submitted:  ["s-survey",   "Submitted"],
  diagnosing: ["s-survey",   "Diagnosing"],
  quoted:     ["s-proposal", "Quoted"],
  scheduled:  ["s-install",  "Scheduled"],
  onsite:     ["s-install",  "On-site"],
  resolved:   ["s-qc",       "Resolved"],
  billed:     ["s-qc",       "Billed"],
  closed:     ["s-done",     "Closed"],
};
const CATEGORY = { camera: "Camera", dropout: "Cutting out", nvr: "Recorder", other: "Other" };
const OPEN = new Set(["submitted", "diagnosing", "quoted", "scheduled", "onsite"]);
const URGENT = new Set(["urgent", "high"]);
function initials(name) { return (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }

export default function ServiceCallsClient({ user, alerts, calls = [], initialFilter = "open" }) {
  const [tab, setTab] = useState(initialFilter);
  const [q, setQ] = useState("");

  const counts = useMemo(() => ({
    all: calls.length,
    open: calls.filter((c) => OPEN.has(c.stage)).length,
    urgent: calls.filter((c) => OPEN.has(c.stage) && URGENT.has(c.priority)).length,
    closed: calls.filter((c) => !OPEN.has(c.stage)).length,
  }), [calls]);

  const query = q.trim().toLowerCase();
  const visible = useMemo(() => calls
    .filter((c) => tab === "all" ? true : tab === "open" ? OPEN.has(c.stage) : tab === "urgent" ? (OPEN.has(c.stage) && URGENT.has(c.priority)) : !OPEN.has(c.stage))
    .filter((c) => !query || [c.svc_id, c.customer, c.issue, c.address].some((v) => (v || "").toLowerCase().includes(query))),
    [calls, tab, query]);

  return (
    <AdminShell user={user} alerts={alerts} active="service-calls">
      <div className="apx-wrap">
        <div className="page-head">
          <h1>Service Calls</h1>
          <div className="ph-sub">{counts.open} open · {counts.urgent} urgent</div>
        </div>

        <div className="sec-head svc-head">
          <div className="filters">
            {[["open", "Open"], ["urgent", "Urgent"], ["all", "All"], ["closed", "Closed"]].map(([k, l]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l} <span style={{ opacity: .6 }}>{counts[k]}</span></button>
            ))}
          </div>
          <input className="apx-input" style={{ maxWidth: 340 }} placeholder="Search ID, customer, issue…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">No service calls{tab !== "all" ? ` in ${tab}` : ""}.</div></div>
        ) : (
          <div className="panel svc-panel">
            <table className="apx-table svc-table">
              <thead><tr><th>Call</th><th>Issue</th><th>Type</th><th>Stage</th><th>Priority</th><th>Tech</th><th></th></tr></thead>
              <tbody>
                {visible.map((c) => {
                  const [pcls, plabel] = STAGE_PILL[c.stage] || ["s-survey", c.stage];
                  return (
                    <tr key={c.svc_id}>
                      <td>
                        <div className="svc-cust">{c.customer || "—"}</div>
                        <div className="svc-id mono">{c.svc_id}{c.address ? ` · ${c.address}` : ""}</div>
                      </td>
                      <td className="svc-issue">{c.issue || "—"}</td>
                      <td><span className="svc-cat">{CATEGORY[c.category] || c.category || "—"}</span></td>
                      <td><span className={`spill ${pcls}`}>{plabel}</span></td>
                      <td>{URGENT.has(c.priority) ? <span className={`svc-pri ${c.priority}`}>{c.priority}</span> : <span className="svc-pri-low">{c.priority || "—"}</span>}</td>
                      <td>{c.assignee_name ? <span className="svc-av" title={c.assignee_name}>{initials(c.assignee_name)}</span> : <span className="svc-unassigned">—</span>}</td>
                      <td><Link href={`/service-calls/${c.svc_id}`} className="svc-open">Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{CSS}</style>
    </AdminShell>
  );
}

const CSS = `
.apx .svc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.apx .svc-panel{padding:0;overflow:hidden}
.apx .svc-table{width:100%;border-collapse:collapse}
.apx .svc-table th{text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;padding:12px 16px;border-bottom:1px solid var(--line)}
.apx .svc-table td{padding:13px 16px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:.88rem}
.apx .svc-table tr:last-child td{border-bottom:none}
.apx .svc-table tr:hover td{background:var(--bg-soft,#fafaf8)}
.apx .svc-cust{font-weight:700;color:var(--ink)}
.apx .svc-id{font-size:.72rem;color:var(--muted)}
.apx .svc-id.mono{font-family:Menlo,Consolas,monospace}
.apx .svc-issue{color:var(--muted);max-width:280px}
.apx .svc-cat{font-size:.76rem;font-weight:700;color:var(--gold-deep,#b08f4f);background:#f8f0e0;border-radius:20px;padding:2px 10px;white-space:nowrap}
.apx .spill{font-size:.72rem;font-weight:800;padding:3px 10px;border-radius:20px;white-space:nowrap}
.apx .spill.s-survey{background:#eef1f6;color:#5b6472}
.apx .spill.s-proposal{background:#f3ecdc;color:#8a6d2f}
.apx .spill.s-install{background:#e6eefc;color:#2f5fbf}
.apx .spill.s-qc{background:#e7f6ec;color:#1c8a45}
.apx .spill.s-done{background:#eceff3;color:#8a94a8}
.apx .svc-pri{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:2px 9px;border-radius:20px}
.apx .svc-pri.urgent{color:#c9382b;background:#fdecec;border:1px solid #f2c4c4}
.apx .svc-pri.high{color:#b3541e;background:#fdf0e5;border:1px solid #f3d3b6}
.apx .svc-pri-low{font-size:.76rem;color:var(--muted);text-transform:capitalize}
.apx .svc-av{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#f8f0e0;color:#8a6d2f;font-size:.72rem;font-weight:800;border:2px solid var(--line)}
.apx .svc-unassigned{color:var(--muted)}
.apx .svc-open{font-size:.82rem;font-weight:700;color:var(--gold-deep,#b08f4f);text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:6px 14px}
.apx .svc-open:hover{border-color:var(--gold,#C9A96E);background:#f8f0e0}
`;
