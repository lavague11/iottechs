"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";
import { PORTALS, HIRING_STATUSES } from "../../lib/hiring";

const ORDER = Object.fromEntries(HIRING_STATUSES.map((s, i) => [s.key, i]));
const TONE = { neutral: "t-neutral", active: "t-active", good: "t-good", bad: "t-bad" };
function initials(n) { return (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }
function fmtDate(s) { try { return new Date(String(s).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } }

export default function HiringBoard({ user, alerts, rows = [] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");   // all | mine | overdue
  const q = query.trim().toLowerCase();

  const mineCount = useMemo(() => rows.filter((r) => r.owner_id === user.id).length, [rows, user.id]);
  const overdueCount = useMemo(() => rows.filter((r) => r.overdue).length, [rows]);

  const byPortal = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (q && !((r.name || "").toLowerCase().includes(q) || (r.app_id || "").toLowerCase().includes(q))) return false;
      if (filter === "mine" && r.owner_id !== user.id) return false;
      if (filter === "overdue" && !r.overdue) return false;
      return true;
    });
    const map = { 1: [], 2: [], 3: [] };
    for (const r of filtered) (map[r.portal] || map[1]).push(r);
    // Overdue first, then by pipeline order, then newest.
    for (const n of [1, 2, 3]) map[n].sort((a, b) => (b.overdue - a.overdue) || (ORDER[a.status] ?? 99) - (ORDER[b.status] ?? 99) || String(b.created_at).localeCompare(String(a.created_at)));
    return map;
  }, [rows, q, filter, user.id]);

  const activeCount = (n) => byPortal[n].filter((r) => r.status !== "declined").length;
  const FILTERS = [["all", "All", rows.length], ["mine", "Mine", mineCount], ["overdue", "Overdue", overdueCount]];

  return (
    <AdminShell user={user} alerts={alerts} active="onboarding">
      <div className="hb">
        <div className="hb-head">
          <div>
            <h1>Hiring Pipeline</h1>
            <p className="hb-sub">Every technician candidate across the three portals. Click a card to review.</p>
          </div>
          <div className="hb-tools">
            <input className="hb-search" placeholder="Search name or ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Link href="/apply" className="hb-new" target="_blank">Application form ↗</Link>
          </div>
        </div>

        <div className="hb-filters">
          {FILTERS.map(([k, label, count]) => (
            <button key={k} className={`hb-filter${filter === k ? " on" : ""}${k === "overdue" && count ? " has-over" : ""}`} onClick={() => setFilter(k)}>
              {label}<span className="hb-filter-n">{count}</span>
            </button>
          ))}
        </div>

        <div className="hb-cols">
          {PORTALS.map((p) => (
            <section className={`hb-col p${p.n}`} key={p.n}>
              <header className="hb-col-h">
                <span className="hb-col-n">{p.n}</span>
                <div>
                  <div className="hb-col-t">{p.label}</div>
                  <div className="hb-col-ask">{p.ask}</div>
                </div>
                <span className="hb-col-ct">{activeCount(p.n)}</span>
              </header>
              <div className="hb-list">
                {byPortal[p.n].length === 0 && <div className="hb-empty">No candidates here.</div>}
                {byPortal[p.n].map((r) => (
                  <Link href={`/onboarding/${r.app_id}`} key={r.app_id} className={`hb-card${r.status === "declined" ? " dim" : ""}${r.overdue ? " over" : ""}`}>
                    <span className="hb-av">{initials(r.name)}</span>
                    <div className="hb-card-b">
                      <div className="hb-card-top">
                        <span className="hb-name">{r.name || "—"}</span>
                        {r.rating ? <span className="hb-rate">{"★".repeat(r.rating)}<span className="hb-rate-off">{"★".repeat(5 - r.rating)}</span></span> : null}
                        {r.owner_name && <span className="hb-owner" title={`Owner · ${r.owner_name}`}>{initials(r.owner_name)}</span>}
                      </div>
                      <div className="hb-card-meta">
                        <span className={`hb-pill ${TONE[r.status_tone] || "t-neutral"}`}>{r.status_label}</span>
                        {r.disp_key !== "active" && r.disp_key !== "hired" && r.disp_key !== "not_selected" && <span className={`hb-chip d-${r.disp_tone}`}>{r.disp_label}</span>}
                        {r.overdue && <span className="hb-chip d-over">Overdue {r.days_in_stage}d</span>}
                        <span className="hb-date">{fmtDate(r.created_at)}</span>
                      </div>
                      {r.next_label && r.status !== "declined" && (
                        <div className="hb-next"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>{r.next_label}</div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <style>{CSS}</style>
    </AdminShell>
  );
}

const CSS = `
.hb{--gold:#C9A96E;--gold-deep:#A8842F;--green:#2E7D5B;--red:#C4553D;--slate:#5E7C9C;--sage:#3F8F6A;
  padding:22px 26px 60px;max-width:1240px;margin:0 auto}
.hb-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.hb h1{margin:0;font-size:1.5rem;font-weight:800;letter-spacing:-.02em;color:var(--ink,#101418)}
.hb-sub{margin:3px 0 0;color:var(--muted,#787D84);font-size:.9rem}
.hb-tools{display:flex;gap:10px;align-items:center}
.hb-search{border:1px solid var(--line,#E4E4DF);border-radius:9px;padding:9px 13px;font:inherit;font-size:.9rem;background:#fff;min-width:210px;outline:none}
.hb-search:focus{border-color:var(--gold)}
.hb-new{font-size:.82rem;font-weight:600;color:var(--gold-deep);text-decoration:none;white-space:nowrap}
.hb-filters{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
.hb-filter{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line,#E4E4DF);background:#fff;border-radius:999px;padding:6px 14px;font:inherit;font-size:.83rem;font-weight:600;color:var(--muted,#787D84);cursor:pointer}
.hb-filter:hover{border-color:var(--gold)}
.hb-filter.on{background:var(--ink,#101418);color:#fff;border-color:var(--ink,#101418)}
.hb-filter-n{font-family:var(--font-mono,ui-monospace);font-size:.72rem;opacity:.7}
.hb-filter.has-over:not(.on){color:var(--red);border-color:#E7C6BC}
.hb-filter.has-over:not(.on) .hb-filter-n{opacity:1;font-weight:700}
.hb-owner{margin-left:auto;flex:none;width:22px;height:22px;border-radius:50%;background:#F6F0E2;color:var(--gold-deep,#A8842F);display:grid;place-items:center;font-size:.62rem;font-weight:800;border:1px solid #E7D4A6}
.hb-chip{font-size:.62rem;font-weight:700;letter-spacing:.02em;padding:2px 8px;border-radius:999px}
.hb-chip.d-warn{color:#B0801F;background:#F6EEDC}
.hb-chip.d-muted{color:var(--muted,#787D84);background:#EEEEEA}
.hb-chip.d-over{color:var(--red);background:#F6E7E2}
.hb-card.over{border-color:#E7C6BC}
.hb-next{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:.78rem;font-weight:600;color:var(--gold-deep,#A8842F)}
.hb-next svg{flex:none;opacity:.85}
.hb-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:900px){.hb-cols{grid-template-columns:1fr}}
.hb-col{background:var(--bg-soft,#F4F4F2);border:1px solid var(--line,#E4E4DF);border-radius:14px;padding:12px;display:flex;flex-direction:column;min-height:120px}
.hb-col-h{display:flex;align-items:center;gap:11px;padding:4px 6px 12px}
.hb-col-n{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:.85rem;flex:none;font-family:var(--font-mono,ui-monospace)}
.hb-col.p1 .hb-col-n{background:var(--gold)}.hb-col.p2 .hb-col-n{background:var(--slate)}.hb-col.p3 .hb-col-n{background:var(--sage)}
.hb-col-t{font-weight:700;font-size:.98rem;color:var(--ink,#101418);line-height:1.1}
.hb-col-ask{font-size:.74rem;color:var(--muted,#787D84)}
.hb-col-ct{margin-left:auto;font-family:var(--font-mono,ui-monospace);font-size:.9rem;font-weight:700;color:var(--muted,#787D84)}
.hb-list{display:flex;flex-direction:column;gap:8px}
.hb-empty{color:var(--faint,#A6ABB1);font-size:.84rem;padding:10px 6px;font-style:italic}
.hb-card{display:flex;gap:11px;align-items:center;background:#fff;border:1px solid var(--line,#E4E4DF);border-radius:11px;padding:11px 12px;text-decoration:none;transition:.12s;box-shadow:0 1px 2px rgba(16,20,24,.03)}
.hb-card:hover{border-color:var(--gold);box-shadow:0 6px 18px -8px rgba(16,20,24,.18);transform:translateY(-1px)}
.hb-card.dim{opacity:.55}
.hb-av{width:34px;height:34px;border-radius:9px;background:var(--bg-soft,#F0EFEA);display:grid;place-items:center;font-weight:700;font-size:.8rem;color:var(--ink-soft,#3A4048);flex:none}
.hb-card-b{min-width:0;flex:1}
.hb-card-top{display:flex;align-items:center;gap:8px;justify-content:space-between}
.hb-name{font-weight:600;font-size:.94rem;color:var(--ink,#101418);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hb-rate{font-size:.74rem;color:var(--gold-deep);letter-spacing:1px;flex:none}
.hb-rate-off{color:var(--line,#E4E4DF)}
.hb-card-meta{display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap}
.hb-pill{font-family:var(--font-mono,ui-monospace);font-size:.63rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;padding:2px 8px;border-radius:999px}
.hb-pill.t-neutral{color:var(--muted,#787D84);background:#EEEEEA}
.hb-pill.t-active{color:var(--gold-deep);background:#F3ECDD}
.hb-pill.t-good{color:var(--green);background:#E6F0EA}
.hb-pill.t-bad{color:var(--red);background:#F6E7E2}
.hb-pos{font-size:.76rem;color:var(--muted,#787D84)}
.hb-date{font-size:.74rem;color:var(--faint,#A6ABB1);margin-left:auto;font-family:var(--font-mono,ui-monospace)}
`;
