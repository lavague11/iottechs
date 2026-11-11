"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import { HIRING_STATUSES } from "../../lib/hiring";
import { setAppInterestAction, setAppReviewAction, bulkInterestAction, bulkArchiveAction } from "../onboarding/actions";

const ORDER = Object.fromEntries(HIRING_STATUSES.map((s, i) => [s.key, i]));
const TONE = { neutral: "t-neutral", active: "t-active", good: "t-good", bad: "t-bad" };
function initials(n) { return (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }
function fmtDate(s) { try { return new Date(String(s).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } }
function daysAgo(s) { try { const d = Math.floor((Date.now() - Date.parse(String(s).replace(" ", "T"))) / 86400000); return d <= 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`; } catch { return ""; } }

// The pipeline buckets that become the status tabs across the top (Indeed-style).
const TABS = [
  { key: "all",          label: "All",          test: () => true },
  { key: "new",          label: "New",          test: (r) => r.status === "applied" },
  { key: "assessment",   label: "Assessment",   test: (r) => r.status === "assessment" },
  { key: "interviewing", label: "Interviewing", test: (r) => r.portal === 1 && ["phone", "in_person", "sop", "ride_along", "final_review"].includes(r.status) },
  { key: "compliance",   label: "Compliance",   test: (r) => r.portal === 2 },
  { key: "training",     label: "Training",     test: (r) => r.portal === 3 },
  { key: "declined",     label: "Not Selected", test: (r) => r.status === "declined" || r.disp_key === "not_selected" },
];

const INTEREST = [
  { key: "yes",   title: "Interested",     cls: "yes" },
  { key: "maybe", title: "Maybe",          cls: "maybe" },
  { key: "no",    title: "Not interested", cls: "no" },
];

// Inline SVG icon set (no emoji — house rule).
const Icon = {
  check: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  q: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>,
  x: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  doc: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /></svg>,
};

export default function HiringBoard({ user, alerts, rows: initial = [] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [pending, startTx] = useTransition();
  const q = query.trim().toLowerCase();
  const isAdmin = user.role === "admin";

  // Secondary filters (search + mine + overdue) scope what the tabs count and show.
  const scoped = useMemo(() => rows.filter((r) => {
    if (q && !((r.name || "").toLowerCase().includes(q) || (r.app_id || "").toLowerCase().includes(q) || (r.position_label || "").toLowerCase().includes(q))) return false;
    if (mine && r.owner_id !== user.id) return false;
    if (overdue && !r.overdue) return false;
    return true;
  }), [rows, q, mine, overdue, user.id]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, scoped.filter(t.test).length])), [scoped]);

  const visible = useMemo(() => {
    const t = TABS.find((x) => x.key === tab) || TABS[0];
    return scoped.filter(t.test).sort((a, b) =>
      (b.overdue - a.overdue) || (ORDER[a.status] ?? 99) - (ORDER[b.status] ?? 99) || String(b.created_at).localeCompare(String(a.created_at)));
  }, [scoped, tab]);

  const visibleIds = visible.map((r) => r.app_id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => sel.has(id));
  const toggleAll = () => setSel((p) => { const n = new Set(p); if (allSelected) visibleIds.forEach((id) => n.delete(id)); else visibleIds.forEach((id) => n.add(id)); return n; });
  const toggleOne = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => setSel(new Set());

  // Optimistic local patch, then persist + refresh.
  function patch(id, fields) { setRows((p) => p.map((r) => r.app_id === id ? { ...r, ...fields } : r)); }

  function setInterest(id, next) {
    const cur = rows.find((r) => r.app_id === id)?.interest || null;
    const val = cur === next ? null : next;         // click the active one again to clear
    patch(id, { interest: val });
    startTx(async () => { await setAppInterestAction(id, val); router.refresh(); });
  }
  function setRating(id, n) {
    const cur = rows.find((r) => r.app_id === id)?.rating || 0;
    const val = cur === n ? 0 : n;                  // click the current star to clear
    patch(id, { rating: val });
    startTx(async () => { await setAppReviewAction(id, { rating: val }); router.refresh(); });
  }
  function bulkInterest(next) {
    const ids = [...sel]; if (!ids.length) return;
    setRows((p) => p.map((r) => sel.has(r.app_id) ? { ...r, interest: next } : r));
    clearSel();
    startTx(async () => { await bulkInterestAction(ids, next); router.refresh(); });
  }
  function bulkArchive() {
    const ids = [...sel]; if (!ids.length) return;
    setRows((p) => p.filter((r) => !sel.has(r.app_id)));
    clearSel();
    startTx(async () => { await bulkArchiveAction(ids, true); router.refresh(); });
  }

  return (
    <AdminShell user={user} alerts={alerts} active="onboarding">
      <div className="hb">
        <div className="hb-head">
          <div>
            <h1>Hiring Pipeline</h1>
            <p className="hb-sub">Every technician candidate, one list. Rate, mark interest, and open to review.</p>
          </div>
          <div className="hb-tools">
            <input className="hb-search" placeholder="Search name, role or ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Link href="/apply" className="hb-new" target="_blank">Application form ↗</Link>
          </div>
        </div>

        {/* Status tabs + secondary toggles */}
        <div className="hb-tabbar">
          <div className="hb-tabs">
            {TABS.map((t) => (counts[t.key] || t.key === "all" || tab === t.key) ? (
              <button key={t.key} className={`hb-tab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
                {t.label}<span className="hb-tab-n">{counts[t.key] || 0}</span>
              </button>
            ) : null)}
          </div>
          <div className="hb-toggles">
            <button className={`hb-tgl${mine ? " on" : ""}`} onClick={() => setMine((v) => !v)}>Mine</button>
            <button className={`hb-tgl${overdue ? " on" : ""}${!overdue && rows.some((r) => r.overdue) ? " flag" : ""}`} onClick={() => setOverdue((v) => !v)}>Overdue</button>
          </div>
        </div>

        {/* Bulk action bar */}
        {sel.size > 0 && (
          <div className="hb-bulk">
            <span className="hb-bulk-n">{sel.size} selected</span>
            <div className="hb-bulk-acts">
              <span className="hb-bulk-lbl">Mark</span>
              {INTEREST.map((i) => (
                <button key={i.key} className={`hb-ib ${i.cls}`} title={i.title} onClick={() => bulkInterest(i.key)} disabled={pending}>
                  {i.key === "yes" ? Icon.check : i.key === "maybe" ? Icon.q : Icon.x}
                </button>
              ))}
              {isAdmin && <button className="hb-bulk-arch" onClick={bulkArchive} disabled={pending}>Archive</button>}
              <button className="hb-bulk-clear" onClick={clearSel}>Clear</button>
            </div>
          </div>
        )}

        {/* The list */}
        <div className="hb-wrap">
          {visible.length === 0 ? (
            <div className="hb-empty">No candidates{tab === "all" ? "" : " in this stage"}.</div>
          ) : (
            <table className="hb-table">
              <thead>
                <tr>
                  <th className="hb-cb"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
                  <th>Candidate</th>
                  <th className="hb-c-exp">Experience</th>
                  <th>Stage</th>
                  <th className="hb-c-rate">Rating</th>
                  <th className="hb-c-app">Applied</th>
                  <th className="hb-c-int">Interest</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.app_id} className={`${sel.has(r.app_id) ? "sel " : ""}${r.status === "declined" ? "dim" : ""}`}>
                    <td className="hb-cb"><input type="checkbox" checked={sel.has(r.app_id)} onChange={() => toggleOne(r.app_id)} aria-label={`Select ${r.name}`} /></td>
                    <td>
                      <div className="hb-cand">
                        <span className="hb-av">{initials(r.name)}</span>
                        <div className="hb-cand-b">
                          <Link href={`/onboarding/${r.app_id}`} className="hb-name">{r.name || "—"}</Link>
                          <div className="hb-cand-sub">
                            {r.position_label && <span>{r.position_label}</span>}
                            {r.owner_name && <span className="hb-owner" title={`Owner · ${r.owner_name}`}>{initials(r.owner_name)}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hb-c-exp">
                      {(r.experience || r.skills || r.resume_name) ? (
                        <div className="hb-exp">
                          {r.experience && <span className="hb-exp-yrs">{r.experience}</span>}
                          {r.skills && <span className="hb-exp-sk" title={r.skills}>{r.skills}</span>}
                          {r.resume_name && <a className="hb-exp-res" href={`/api/apply/resume?id=${encodeURIComponent(r.app_id)}`} target="_blank" rel="noreferrer">{Icon.doc} Résumé</a>}
                        </div>
                      ) : <span className="hb-muted">—</span>}
                    </td>
                    <td>
                      <div className="hb-stage">
                        <span className={`hb-pill ${TONE[r.status_tone] || "t-neutral"}`}>{r.status_label}</span>
                        {r.assessment_state && <span className="hb-chip d-muted">{r.assessment_state === "graded" ? "Graded" : r.assessment_state === "submitted" ? "Submitted" : r.assessment_state === "in_progress" ? "In progress" : "Sent"}</span>}
                        {r.overdue && <span className="hb-chip d-over" title={`In stage ${r.days_in_stage}d`}>Overdue {r.days_in_stage}d</span>}
                      </div>
                    </td>
                    <td className="hb-c-rate">
                      <div className="hb-stars" role="radiogroup" aria-label={`Rate ${r.name}`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} className={`hb-star${(r.rating || 0) >= n ? " on" : ""}`} disabled={pending}
                            onClick={() => setRating(r.app_id, n)} title={`${n} of 5`} aria-label={`${n} star${n > 1 ? "s" : ""}`}>★</button>
                        ))}
                      </div>
                    </td>
                    <td className="hb-c-app">
                      <div className="hb-app"><span>{fmtDate(r.created_at)}</span><span className="hb-app-ago">{daysAgo(r.created_at)}</span></div>
                    </td>
                    <td className="hb-c-int">
                      <div className="hb-int">
                        {INTEREST.map((i) => (
                          <button key={i.key} className={`hb-ib ${i.cls}${r.interest === i.key ? " on" : ""}`} title={i.title}
                            aria-label={i.title} aria-pressed={r.interest === i.key} disabled={pending} onClick={() => setInterest(r.app_id, i.key)}>
                            {i.key === "yes" ? Icon.check : i.key === "maybe" ? Icon.q : Icon.x}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <style>{CSS}</style>
    </AdminShell>
  );
}

const CSS = `
.hb{--gold:#C9A96E;--gold-deep:#A8842F;--green:#2E7D5B;--red:#C4553D;--slate:#5E7C9C;--sage:#3F8F6A;
  padding:22px 26px 60px;max-width:1240px;margin:0 auto}
.hb-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.hb h1{margin:0;font-size:1.5rem;font-weight:800;letter-spacing:-.02em;color:var(--ink,#101418)}
.hb-sub{margin:3px 0 0;color:var(--muted,#787D84);font-size:.9rem}
.hb-tools{display:flex;gap:10px;align-items:center}
.hb-search{border:1px solid var(--line,#E4E4DF);border-radius:9px;padding:9px 13px;font:inherit;font-size:.9rem;background:#fff;min-width:230px;outline:none}
.hb-search:focus{border-color:var(--gold)}
.hb-new{font-size:.82rem;font-weight:600;color:var(--gold-deep);text-decoration:none;white-space:nowrap}

/* status tabs */
.hb-tabbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;border-bottom:1px solid var(--line,#E4E4DF);margin-bottom:14px}
.hb-tabs{display:flex;gap:2px;flex-wrap:wrap}
.hb-tab{position:relative;display:inline-flex;align-items:center;gap:7px;background:none;border:none;border-bottom:2px solid transparent;padding:9px 13px;margin-bottom:-1px;font:inherit;font-size:.88rem;font-weight:600;color:var(--muted,#787D84);cursor:pointer}
.hb-tab:hover{color:var(--ink,#101418)}
.hb-tab.on{color:var(--ink,#101418);border-bottom-color:var(--gold)}
.hb-tab-n{font-family:var(--font-mono,ui-monospace);font-size:.72rem;font-weight:700;color:#fff;background:var(--faint,#B4B8BE);border-radius:999px;padding:1px 7px;min-width:20px;text-align:center}
.hb-tab.on .hb-tab-n{background:var(--gold-deep)}
.hb-toggles{display:flex;gap:7px}
.hb-tgl{border:1px solid var(--line,#E4E4DF);background:#fff;border-radius:999px;padding:6px 13px;font:inherit;font-size:.8rem;font-weight:600;color:var(--muted,#787D84);cursor:pointer}
.hb-tgl:hover{border-color:var(--gold)}
.hb-tgl.on{background:var(--ink,#101418);color:#fff;border-color:var(--ink,#101418)}
.hb-tgl.flag{color:var(--red);border-color:#E7C6BC}

/* bulk bar */
.hb-bulk{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--ink,#101418);color:#fff;border-radius:11px;padding:9px 15px;margin-bottom:12px}
.hb-bulk-n{font-weight:700;font-size:.88rem}
.hb-bulk-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hb-bulk-lbl{font-size:.78rem;color:rgba(255,255,255,.65)}
.hb-bulk-arch{background:transparent;border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:8px;padding:6px 12px;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer}
.hb-bulk-arch:hover{background:rgba(255,255,255,.12)}
.hb-bulk-clear{background:none;border:none;color:rgba(255,255,255,.75);font:inherit;font-size:.82rem;cursor:pointer;text-decoration:underline}

/* table */
.hb-wrap{overflow-x:auto;border:1px solid var(--line,#E4E4DF);border-radius:13px;background:#fff}
.hb-table{width:100%;border-collapse:collapse;font-size:.9rem}
.hb-table thead th{text-align:left;font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#787D84);padding:11px 14px;border-bottom:1px solid var(--line,#E4E4DF);white-space:nowrap}
.hb-table tbody td{padding:12px 14px;border-bottom:1px solid var(--line,#EEEEEA);vertical-align:middle}
.hb-table tbody tr:last-child td{border-bottom:none}
.hb-table tbody tr:hover{background:var(--bg-soft,#FAFAF8)}
.hb-table tbody tr.sel{background:#FBF6EA}
.hb-table tbody tr.dim{opacity:.55}
.hb-cb{width:38px;text-align:center}
.hb-cb input{width:16px;height:16px;cursor:pointer}

.hb-cand{display:flex;align-items:center;gap:11px;min-width:0}
.hb-av{width:34px;height:34px;border-radius:9px;background:var(--bg-soft,#F0EFEA);display:grid;place-items:center;font-weight:700;font-size:.78rem;color:var(--ink-soft,#3A4048);flex:none}
.hb-cand-b{min-width:0}
.hb-name{font-weight:600;font-size:.94rem;color:var(--ink,#101418);text-decoration:none}
.hb-name:hover{color:var(--gold-deep);text-decoration:underline}
.hb-cand-sub{display:flex;align-items:center;gap:8px;margin-top:2px;font-size:.78rem;color:var(--muted,#787D84)}
.hb-owner{width:20px;height:20px;border-radius:50%;background:#F6F0E2;color:var(--gold-deep,#A8842F);display:grid;place-items:center;font-size:.58rem;font-weight:800;border:1px solid #E7D4A6}

.hb-exp{display:flex;flex-direction:column;gap:3px;max-width:260px}
.hb-exp-yrs{font-weight:600;font-size:.84rem;color:var(--ink,#101418)}
.hb-exp-sk{font-size:.78rem;color:var(--muted,#787D84);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hb-exp-res{display:inline-flex;align-items:center;gap:4px;font-size:.76rem;font-weight:600;color:var(--gold-deep);text-decoration:none;width:fit-content}
.hb-exp-res:hover{text-decoration:underline}
.hb-muted{color:var(--faint,#A6ABB1)}

.hb-stage{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.hb-pill{font-family:var(--font-mono,ui-monospace);font-size:.63rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;padding:2px 8px;border-radius:999px;white-space:nowrap}
.hb-pill.t-neutral{color:var(--muted,#787D84);background:#EEEEEA}
.hb-pill.t-active{color:var(--gold-deep);background:#F3ECDD}
.hb-pill.t-good{color:var(--green);background:#E6F0EA}
.hb-pill.t-bad{color:var(--red);background:#F6E7E2}
.hb-chip{font-size:.62rem;font-weight:700;letter-spacing:.02em;padding:2px 8px;border-radius:999px;white-space:nowrap}
.hb-chip.d-muted{color:var(--muted,#787D84);background:#EEEEEA}
.hb-chip.d-over{color:var(--red);background:#F6E7E2}

.hb-stars{display:inline-flex;gap:1px}
.hb-star{background:none;border:none;cursor:pointer;font-size:1rem;line-height:1;color:var(--line,#DAD9D2);padding:1px;transition:.1s}
.hb-star:hover{transform:scale(1.12)}
.hb-star.on{color:var(--gold)}
.hb-star:disabled{cursor:default}

.hb-app{display:flex;flex-direction:column;gap:1px;white-space:nowrap}
.hb-app span{font-size:.84rem;color:var(--ink,#101418)}
.hb-app-ago{font-size:.72rem;color:var(--faint,#A6ABB1)!important}

.hb-int{display:inline-flex;gap:5px}
.hb-ib{width:30px;height:30px;border-radius:8px;border:1px solid var(--line,#E4E4DF);background:#fff;display:grid;place-items:center;cursor:pointer;color:var(--faint,#A6ABB1);transition:.12s;flex:none}
.hb-ib:hover{border-color:currentColor}
.hb-ib.yes:hover,.hb-ib.yes.on{color:#fff;background:var(--green);border-color:var(--green)}
.hb-ib.maybe:hover,.hb-ib.maybe.on{color:#fff;background:var(--gold-deep);border-color:var(--gold-deep)}
.hb-ib.no:hover,.hb-ib.no.on{color:#fff;background:var(--red);border-color:var(--red)}
.hb-ib:disabled{cursor:default;opacity:.7}
.hb-bulk .hb-ib{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25);color:#fff}

.hb-empty{color:var(--faint,#A6ABB1);font-size:.9rem;padding:34px 16px;text-align:center;font-style:italic}

@media(max-width:820px){
  .hb{padding:16px 14px 50px}
  .hb-c-exp{display:none}
  .hb-c-app{display:none}
}
`;
