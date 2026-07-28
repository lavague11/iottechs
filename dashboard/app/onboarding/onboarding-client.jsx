"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";

// Hiring pipeline — same list language as Service Calls: filter tabs, search, one row per
// application, click through to review.
const STAGE_PILL = {
  applied:   ["s-survey",   "Applied"],
  reviewing: ["s-proposal", "In review"],
  interview: ["s-install",  "Interview"],
  offer:     ["s-qc",       "Offer"],
  hired:     ["s-done",     "Hired"],
  declined:  ["s-lost",     "Declined"],
};
const OPEN = new Set(["applied", "reviewing", "interview", "offer"]);
const digits = (s) => String(s || "").replace(/\D/g, "");
function initials(n) { return (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }

export default function OnboardingClient({ user, alerts, rows = [] }) {
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");

  const q = qLower(query);
  const qd = digits(query);
  const visible = useMemo(() => rows.filter((r) => {
    if (filter === "open" && !OPEN.has(r.stage)) return false;
    if (filter === "hired" && r.stage !== "hired") return false;
    if (filter === "declined" && r.stage !== "declined") return false;
    if (!q) return true;
    return (r.name || "").toLowerCase().includes(q)
      || r.app_id.toLowerCase().includes(q)
      || (r.position_label || "").toLowerCase().includes(q)
      || (r.address || "").toLowerCase().includes(q)
      || (qd && digits(r.phone).includes(qd));
  }), [rows, q, qd, filter]);

  const counts = {
    open: rows.filter((r) => OPEN.has(r.stage)).length,
    hired: rows.filter((r) => r.stage === "hired").length,
    declined: rows.filter((r) => r.stage === "declined").length,
    all: rows.length,
  };

  return (
    <AdminShell user={user} alerts={alerts} active="onboarding">
      <div className="apx-wrap">
        <div className="page-head ob-head">
          <div>
            <h1>Hiring</h1>
            <div className="ph-sub">{counts.open} open · {counts.hired} hired · {rows.length} total</div>
          </div>
          <a href="/apply" target="_blank" rel="noopener noreferrer" className="ob-apply-link">Application form ↗</a>
        </div>

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 420 }} placeholder="Search name, position, phone, or application ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="ob-tabs">
            {[["open", "Open", counts.open], ["hired", "Hired", counts.hired], ["declined", "Declined", counts.declined], ["all", "All", counts.all]].map(([k, l, n]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l} {n}</button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q ? "No applications match." : "No applications yet — share the form and they'll land here."}</div></div>
        ) : (
          <div className="panel ob-panel">
            <table className="ob-table">
              <thead><tr><th>Applicant</th><th>Role</th><th>Experience</th><th>Stage</th><th>Reviewer</th><th /></tr></thead>
              <tbody>
                {visible.map((r) => {
                  const [cls, label] = STAGE_PILL[r.stage] || ["s-survey", r.stage_label];
                  return (
                    <tr key={r.app_id}>
                      <td>
                        <div className="ob-who">
                          <span className="ob-av">{initials(r.name)}</span>
                          <div>
                            <div className="ob-name">{r.name || "—"}</div>
                            <div className="ob-meta"><span className="mono">{r.app_id}</span>{r.address ? ` · ${r.address}` : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td>{r.position_label}</td>
                      <td className="ob-dim">{r.experience || "—"}</td>
                      <td><span className={`stage-pill ${cls}`}>{label}</span></td>
                      <td className="ob-dim">{r.reviewer_name || (r.rating ? `${r.rating}★` : "—")}</td>
                      <td className="ob-act"><Link href={`/onboarding/${r.app_id}`} className="ob-open">Review</Link></td>
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

function qLower(s) { return String(s || "").trim().toLowerCase(); }

const CSS = `
.apx .ob-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.apx .ob-apply-link{font-size:.85rem;font-weight:700;color:var(--gold-deep,#b08f4f);text-decoration:none;white-space:nowrap;padding-top:6px}
.apx .ob-apply-link:hover{text-decoration:underline}
.apx .ob-tabs{display:flex;gap:6px}
.apx .ob-tabs button{height:34px;padding:0 14px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .ob-tabs button.on{background:var(--gold-deep,#b08f4f);border-color:var(--gold-deep,#b08f4f);color:#fff}
.apx .ob-panel{padding:0;overflow:hidden}
.apx .ob-table{width:100%;border-collapse:collapse;font-size:.88rem}
.apx .ob-table th{text-align:left;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);padding:12px 16px;border-bottom:1px solid var(--line)}
.apx .ob-table td{padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:middle}
.apx .ob-table tr:last-child td{border-bottom:none}
.apx .ob-table tr:hover td{background:var(--bg-soft,#fafaf8)}
.apx .ob-who{display:flex;align-items:center;gap:10px}
.apx .ob-av{width:32px;height:32px;flex-shrink:0;border-radius:50%;background:#f8f0e0;color:var(--gold-deep,#b08f4f);display:grid;place-items:center;font-size:.72rem;font-weight:800}
.apx .ob-name{font-weight:700}
.apx .ob-meta{font-size:.74rem;color:var(--muted)}
.apx .ob-meta .mono{font-family:Menlo,Consolas,monospace;color:var(--gold-deep,#b08f4f);font-weight:600}
.apx .ob-dim{color:var(--muted)}
.apx .ob-act{text-align:right}
.apx .ob-open{font-size:.8rem;font-weight:700;color:#fff;background:linear-gradient(135deg,#C9A96E,#b08f4f);border-radius:8px;padding:7px 14px;text-decoration:none;white-space:nowrap}
.apx .ob-open:hover{filter:brightness(1.05)}
.apx .stage-pill.s-lost{background:#fdecec;color:#c9382b}
`;
