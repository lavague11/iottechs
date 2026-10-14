"use client";

import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import ConfirmDialog from "../components/confirm-dialog";
import { ProjectTypeIcon } from "../components/project-type";
import { adtStatusMeta } from "../../lib/adt";
import { archiveProjectAction } from "./actions";

const CLOSED = new Set(["payment", "completion", "adt_completed"]);
const STAGE_PILL = {
  inquiry: ["s-survey", "Inquiry"], site_survey: ["s-survey", "Survey"],
  proposal: ["s-proposal", "Proposal"], approval_deposit: ["s-proposal", "Approval"],
  schedule: ["s-install", "Schedule"], install: ["s-install", "Install"],
  qc: ["s-qc", "QC"], payment: ["s-qc", "Payment"], completion: ["s-done", "Completed"],
  adt_applied: ["s-proposal", "Applied"], adt_scheduled: ["s-install", "Scheduled"], adt_completed: ["s-done", "Completed"],
};
const stageLabel = (s) => (STAGE_PILL[s] || [null, s])[1];

// Tabs: All · Inquiries · Needs Action · Completed (the old "Active" tab was dropped — "All" plus
// "Needs Action" already give the useful operational split, and "Completed" is the history view).
const TABS = [
  ["all", "All"],
  ["inquiry", "Inquiries"],
  ["needs", "Needs Action"],
  ["completed", "Completed"],
];
function matchesTab(p, filter) {
  if (filter === "all") return true;
  if (filter === "inquiry") return p.stage === "inquiry";
  if (filter === "needs") return ["proposal", "approval_deposit", "qc"].includes(p.stage);
  if (filter === "completed") return p.stage === "completion" || p.stage === "adt_completed";
  return true;
}

// We only have a reliable created_at, so recency reads "Added …" (friendly, not a raw timestamp).
// Formatting is pinned to en-US + America/New_York (the server's timezone) so the server and client
// render the SAME string — otherwise a locale/timezone difference trips a hydration mismatch.
function addedLabel(iso) {
  if (!iso) return "";
  const t = new Date(iso + (iso.includes("T") ? "Z" : " UTC"));
  if (isNaN(t.getTime())) return "";
  const days = Math.floor((Date.now() - t.getTime()) / 86400000);
  if (days <= 0) return "Added today";
  if (days === 1) return "Added yesterday";
  const opts = { month: "short", day: "numeric", timeZone: "America/New_York" };
  if (t.getUTCFullYear() !== new Date().getUTCFullYear()) opts.year = "numeric";
  return "Added " + t.toLocaleDateString("en-US", opts);
}

const SORTS = [["new", "Newest"], ["old", "Oldest"], ["az", "Name A–Z"], ["za", "Name Z–A"]];
function sortProjects(list, mode) {
  const by = [...list];
  const name = (p) => (p.customer || "").toLowerCase();
  const created = (p) => String(p.created_at || "");
  if (mode === "az") by.sort((a, b) => name(a).localeCompare(name(b)));
  else if (mode === "za") by.sort((a, b) => name(b).localeCompare(name(a)));
  else if (mode === "old") by.sort((a, b) => created(a).localeCompare(created(b)));
  else by.sort((a, b) => created(b).localeCompare(created(a)));   // "new" (default): most recent first
  return by;
}

const SKEY = "pjx:list:v1";
function loadState() { try { return JSON.parse(sessionStorage.getItem(SKEY) || "null") || {}; } catch { return {}; } }

const IcFilter = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16M7 12h10M10 19h4" /></svg>;
const IcSort = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l-3 3M17 20l3-3" /></svg>;
const IcMore = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;

export default function ProjectsClient({ user, alerts, projects, initialFilter = "all" }) {
  // Server-safe defaults ONLY on first render — restoring from sessionStorage here would make the client
  // markup differ from the server's and trip a hydration mismatch. The saved state is applied in a mount
  // effect below, after hydration.
  const [filter, setFilter] = useState(TABS.some((t) => t[0] === initialFilter) ? initialFilter : "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("new");
  const [fStages, setFStages] = useState(() => new Set());
  const [fServices, setFServices] = useState(() => new Set());
  const [fUnassigned, setFUnassigned] = useState(false);
  const [sheet, setSheet] = useState(null);         // "filter" | "sort" | null
  const [rowMenu, setRowMenu] = useState(null);     // access_id of the open ••• menu
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [pending, startTx] = useTransition();
  const hydrated = useRef(false);
  const router = useRouter();
  const q = query.trim().toLowerCase();
  const canArchive = ["admin", "manager"].includes(user?.role);

  // Restore saved search / filter / sort once, after mount (reopen the list where you left it).
  useEffect(() => {
    const s = loadState();
    if (s.filter && TABS.some((t) => t[0] === s.filter)) setFilter(s.filter);
    if (typeof s.query === "string") setQuery(s.query);
    if (s.sort) setSort(s.sort);
    if (Array.isArray(s.stages) && s.stages.length) setFStages(new Set(s.stages));
    if (Array.isArray(s.services) && s.services.length) setFServices(new Set(s.services));
    if (s.unassigned) setFUnassigned(true);
    hydrated.current = true;
  }, []);

  // Preserve search / filter / sort across navigation (only after the restore above, so we never clobber
  // the saved state with the first-render defaults).
  useEffect(() => {
    if (!hydrated.current) return;
    try { sessionStorage.setItem(SKEY, JSON.stringify({ filter, query, sort, stages: [...fStages], services: [...fServices], unassigned: fUnassigned })); } catch {}
  }, [filter, query, sort, fStages, fServices, fUnassigned]);

  // Close any open ••• menu on an outside click.
  useEffect(() => {
    if (!rowMenu) return;
    const onDoc = (e) => { if (!e.target.closest?.(".pjx-menu-wrap")) setRowMenu(null); };
    document.addEventListener("click", onDoc); return () => document.removeEventListener("click", onDoc);
  }, [rowMenu]);

  // Filter options come only from the data actually present — never invented fields.
  const stageOpts = useMemo(() => {
    const seen = []; const set = new Set();
    projects.forEach((p) => { if (p.stage && !set.has(p.stage)) { set.add(p.stage); seen.push(p.stage); } });
    return seen;
  }, [projects]);
  const serviceOpts = useMemo(() => {
    const seen = []; const set = new Set();
    projects.forEach((p) => { const s = p.service || ""; if (s && !set.has(s)) { set.add(s); seen.push(s); } });
    return seen.sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const activeFilterCount = fStages.size + fServices.size + (fUnassigned ? 1 : 0);
  function confirmArchive() {
    const id = archiveTarget?.access_id; setArchiveTarget(null);
    if (!id) return;
    startTx(async () => { await archiveProjectAction(id); router.refresh(); });
  }
  function clearFilters() { setFStages(new Set()); setFServices(new Set()); setFUnassigned(false); }
  const toggleIn = (setFn) => (val) => setFn((prev) => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });

  const visible = sortProjects(
    projects
      .filter((p) => matchesTab(p, filter))
      .filter((p) => !q || p.customer.toLowerCase().includes(q) || (p.service || "").toLowerCase().includes(q) || (p.address || "").toLowerCase().includes(q) || p.access_id.toLowerCase().includes(q))
      .filter((p) => fStages.size === 0 || fStages.has(p.stage))
      .filter((p) => fServices.size === 0 || fServices.has(p.service || ""))
      .filter((p) => !fUnassigned || (p.kind !== "adt" && !p.tech)),
    sort
  );

  const counts = Object.fromEntries(TABS.map(([k]) => [k, projects.filter((p) => matchesTab(p, k)).length]));
  const open = (p) => router.push(p.kind === "adt" ? `/adt-applications/${p.access_id}` : `/project/${p.access_id}`);
  const filtered = activeFilterCount > 0 || q;

  return (
    <AdminShell user={user} alerts={alerts} active="projects">
      <div className="apx-wrap pjx">
        <div className="page-head"><h1>Projects</h1><div className="ph-sub">{projects.length} projects</div></div>

        {/* Control row: search + Filter + Sort (search takes the first row on narrow phones). */}
        <div className="pjx-controls">
          <input className="apx-input pjx-search" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className={`pjx-ctl${activeFilterCount ? " on" : ""}`} onClick={() => setSheet("filter")} aria-label="Filter projects">
            <IcFilter />{activeFilterCount ? <span className="pjx-ctl-n">{activeFilterCount}</span> : null}
          </button>
          <button className="pjx-ctl" onClick={() => setSheet("sort")} aria-label="Sort projects"><IcSort /></button>
        </div>

        <div className="pjx-tabs" role="tablist">
          {TABS.map(([k, lbl]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {lbl}<span className="pjx-tab-n">{counts[k]}</span>
            </button>
          ))}
        </div>

        <div className="panel pjx-list">
          {visible.length === 0 ? (
            <div className="pjx-empty">
              <div>{filtered ? "No projects match these filters." : "No projects yet."}</div>
              {filtered && <button className="pjx-clear" onClick={() => { setQuery(""); clearFilters(); }}>Clear filters</button>}
            </div>
          ) : visible.map((p) => {
            const isAdt = p.kind === "adt";
            const pill = isAdt ? adtStatusMeta(p.status) : null;
            const [cls, lbl] = isAdt ? [null, null] : (STAGE_PILL[p.stage] || ["s-survey", p.stage]);
            return (
              <div key={p.access_id} className="pjx-row" onClick={() => open(p)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") open(p); }}>
                <ProjectTypeIcon project={p} size={38} />
                <div className="pjx-main">
                  <div className="pjx-l1">
                    <span className="pjx-name">{p.customer}</span>
                    {isAdt
                      ? <span className="pjx-pill" style={{ background: pill.color + "1a", color: pill.color }}>{pill.label}</span>
                      : <span className={`pjx-pill stage-pill ${cls}`}>{lbl}</span>}
                  </div>
                  <div className="pjx-l2">{p.service}<span className="pjx-id mono"> · {p.access_id}</span></div>
                  <div className="pjx-l3">
                    <span suppressHydrationWarning>{addedLabel(p.created_at)}</span>
                    {p.inventoryShort && <span className="pjx-warn" title="Inventory shortage — allocated qty exceeds available stock">⚠ Inventory</span>}
                  </div>
                </div>
                <div className="pjx-right">
                  {(canArchive && !isAdt) ? (
                    <div className="pjx-menu-wrap" onClick={(e) => e.stopPropagation()}>
                      <button className="pjx-more" aria-label="Project actions" aria-haspopup="menu" aria-expanded={rowMenu === p.access_id}
                        onClick={() => setRowMenu((m) => (m === p.access_id ? null : p.access_id))}><IcMore /></button>
                      {rowMenu === p.access_id && (
                        <div className="pjx-menu" role="menu">
                          <button role="menuitem" onClick={() => { setRowMenu(null); open(p); }}>Open</button>
                          <button role="menuitem" className="danger" disabled={pending} onClick={() => { setRowMenu(null); setArchiveTarget(p); }}>Archive</button>
                        </div>
                      )}
                    </div>
                  ) : null}
                  <span className="pjx-chev" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter bottom sheet */}
      {sheet === "filter" && (
        <div className="pjx-sheet-scrim" onClick={() => setSheet(null)}>
          <div className="pjx-sheet" role="dialog" aria-label="Filter projects" onClick={(e) => e.stopPropagation()}>
            <div className="pjx-sheet-grab" />
            <div className="pjx-sheet-head"><b>Filter</b>{activeFilterCount > 0 && <button className="pjx-sheet-clear" onClick={clearFilters}>Clear all</button>}</div>
            <div className="pjx-sheet-body">
              <div className="pjx-fgroup"><div className="pjx-flabel">Stage</div>
                <div className="pjx-chiprow">
                  {stageOpts.map((s) => <button key={s} className={`pjx-fchip${fStages.has(s) ? " on" : ""}`} onClick={() => toggleIn(setFStages)(s)}>{stageLabel(s)}</button>)}
                </div>
              </div>
              <div className="pjx-fgroup"><div className="pjx-flabel">Service</div>
                <div className="pjx-chiprow">
                  {serviceOpts.map((s) => <button key={s} className={`pjx-fchip${fServices.has(s) ? " on" : ""}`} onClick={() => toggleIn(setFServices)(s)}>{s}</button>)}
                </div>
              </div>
              <div className="pjx-fgroup">
                <button className={`pjx-ftoggle${fUnassigned ? " on" : ""}`} onClick={() => setFUnassigned((v) => !v)}>
                  <span>Unassigned tech</span><span className="pjx-tknob" />
                </button>
              </div>
            </div>
            <button className="pjx-sheet-done" onClick={() => setSheet(null)}>Show {visible.length} {visible.length === 1 ? "project" : "projects"}</button>
          </div>
        </div>
      )}

      {/* Sort bottom sheet */}
      {sheet === "sort" && (
        <div className="pjx-sheet-scrim" onClick={() => setSheet(null)}>
          <div className="pjx-sheet" role="dialog" aria-label="Sort projects" onClick={(e) => e.stopPropagation()}>
            <div className="pjx-sheet-grab" />
            <div className="pjx-sheet-head"><b>Sort</b></div>
            <div className="pjx-sheet-body">
              {SORTS.map(([k, lbl]) => (
                <button key={k} className={`pjx-sortrow${sort === k ? " on" : ""}`} onClick={() => { setSort(k); setSheet(null); }}>
                  <span>{lbl}</span>
                  {sort === k && <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
        .pjx .page-head .ph-sub{font-size:.85rem}
        /* control row — search grows, Filter/Sort are compact icon buttons */
        .pjx .pjx-controls{display:flex;align-items:center;gap:8px;margin:18px 0 12px;flex-wrap:wrap}
        .pjx .pjx-search{flex:1 1 220px;min-width:0;max-width:none}
        .pjx .pjx-ctl{position:relative;flex:0 0 auto;width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--muted);cursor:pointer;transition:.12s}
        .pjx .pjx-ctl:hover{color:var(--ink);border-color:var(--ink)}
        .pjx .pjx-ctl.on{color:var(--gold-deep);border-color:var(--gold-deep);background:rgba(201,169,110,.08)}
        .pjx .pjx-ctl-n{position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;padding:0 3px;border-radius:9px;background:var(--gold-deep);color:#fff;font-size:.62rem;font-weight:800;display:grid;place-items:center}
        /* tabs — compact segmented, count rides each label */
        .pjx .pjx-tabs{display:flex;gap:6px;margin:0 0 14px;overflow-x:auto;scrollbar-width:none}
        .pjx .pjx-tabs::-webkit-scrollbar{display:none}
        .pjx .pjx-tabs button{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border-radius:100px;border:1px solid var(--line);background:#fff;color:var(--muted);font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:.12s}
        .pjx .pjx-tabs button:hover{color:var(--ink)}
        .pjx .pjx-tabs button.on{background:var(--ink);border-color:var(--ink);color:#fff}
        .pjx .pjx-tab-n{font-size:.72rem;font-weight:700;opacity:.65}
        .pjx .pjx-tabs button.on .pjx-tab-n{opacity:.8}
        /* list — one container, thin dividers (no card-in-card) */
        .pjx .pjx-list{padding:0;overflow:hidden}
        .pjx .pjx-row{display:flex;align-items:center;gap:13px;padding:12px 16px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .12s;min-height:72px}
        .pjx .pjx-row:last-child{border-bottom:none}
        .pjx .pjx-row:hover{background:var(--bg-soft)}
        .pjx .pjx-row:focus-visible{outline:2px solid var(--gold-deep);outline-offset:-2px}
        .pjx .pjx-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
        .pjx .pjx-l1{display:flex;align-items:center;gap:10px;min-width:0}
        .pjx .pjx-name{font-weight:700;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
        .pjx .pjx-pill{flex:0 0 auto;font-size:.68rem;font-weight:700;padding:3px 9px;border-radius:100px;white-space:nowrap}
        .pjx .pjx-l2{font-size:.8rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pjx .pjx-id{color:var(--faint,#9aa0a6)}
        .pjx .pjx-l3{display:flex;align-items:center;gap:10px;font-size:.74rem;color:var(--faint,#9aa0a6)}
        .pjx .pjx-warn{color:#c0392b;font-weight:700}
        .pjx .pjx-right{flex:0 0 auto;display:flex;align-items:center;gap:2px}
        .pjx .pjx-menu-wrap{position:relative}
        .pjx .pjx-more{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;border:none;background:transparent;color:var(--muted);cursor:pointer;opacity:0;transition:opacity .12s,background .12s}
        .pjx .pjx-row:hover .pjx-more,.pjx .pjx-more[aria-expanded="true"]{opacity:1}
        .pjx .pjx-more:hover{background:rgba(16,20,24,.06);color:var(--ink)}
        .pjx .pjx-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:20;min-width:140px;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 14px 34px rgba(16,20,24,.16);padding:5px;display:flex;flex-direction:column;gap:2px}
        .pjx .pjx-menu button{text-align:left;padding:9px 11px;border-radius:7px;border:none;background:transparent;font-size:.86rem;font-weight:600;color:var(--ink-soft,#3a4048);cursor:pointer}
        .pjx .pjx-menu button:hover{background:var(--bg-soft)}
        .pjx .pjx-menu button.danger{color:#c0392b}.pjx .pjx-menu button.danger:hover{background:rgba(231,76,60,.08)}
        .pjx .pjx-chev{color:var(--faint,#9aa0a6);display:inline-flex;transition:transform .15s}
        .pjx .pjx-row:hover .pjx-chev{transform:translateX(2px);color:var(--muted)}
        .pjx .pjx-empty{padding:40px 18px;text-align:center;color:var(--muted);font-size:.9rem;display:flex;flex-direction:column;align-items:center;gap:12px}
        .pjx .pjx-clear,.pjx .pjx-sheet-clear{border:1px solid var(--line);background:#fff;color:var(--ink-soft,#3a4048);font-weight:600;font-size:.82rem;padding:7px 14px;border-radius:9px;cursor:pointer}
        .pjx .pjx-clear:hover,.pjx .pjx-sheet-clear:hover{border-color:var(--ink);color:var(--ink)}
        /* on phones: Filter/Sort move below the search field (own row) — mobile-first, no overflow */
        @media (max-width:560px){
          .pjx .pjx-search{flex:1 1 100%;order:0}
          .pjx .pjx-ctl{order:1}
          .pjx .pjx-more{opacity:1}   /* no hover on touch — keep the ••• reachable */
        }
        /* bottom sheets (Filter / Sort) */
        .pjx-sheet-scrim{position:fixed;inset:0;z-index:120;background:rgba(16,20,24,.42);display:flex;align-items:flex-end;justify-content:center;animation:pjxFade .16s ease}
        @keyframes pjxFade{from{opacity:0}to{opacity:1}}
        .pjx-sheet{width:100%;max-width:520px;background:#fff;border-radius:18px 18px 0 0;padding:8px 18px 18px;box-shadow:0 -14px 50px rgba(16,20,24,.26);max-height:82dvh;overflow-y:auto;animation:pjxUp .22s cubic-bezier(.16,1,.3,1)}
        @keyframes pjxUp{from{transform:translateY(22px)}to{transform:none}}
        .pjx-sheet-grab{width:38px;height:4px;border-radius:99px;background:#d9d9d4;margin:4px auto 12px}
        .pjx-sheet-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .pjx-sheet-head b{font-size:1.02rem;font-weight:700;font-family:'Bricolage Grotesque',sans-serif}
        .pjx-fgroup{margin-bottom:16px}
        .pjx-flabel{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--faint,#9aa0a6);font-weight:700;margin-bottom:8px}
        .pjx-chiprow{display:flex;flex-wrap:wrap;gap:7px}
        .pjx-fchip{padding:7px 12px;border-radius:100px;border:1px solid var(--line);background:#fff;color:var(--ink-soft,#3a4048);font-size:.82rem;font-weight:600;cursor:pointer;transition:.12s}
        .pjx-fchip:hover{border-color:var(--ink)}
        .pjx-fchip.on{background:var(--ink);border-color:var(--ink);color:#fff}
        .pjx-ftoggle{width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 2px;border:none;background:transparent;font-size:.92rem;font-weight:600;color:var(--ink);cursor:pointer}
        .pjx-tknob{width:40px;height:23px;border-radius:20px;background:#e7e4dd;position:relative;transition:background .15s;flex:0 0 auto}
        .pjx-tknob::after{content:"";position:absolute;top:2px;left:2px;width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.28);transition:left .15s}
        .pjx-ftoggle.on .pjx-tknob{background:var(--gold-deep)}
        .pjx-ftoggle.on .pjx-tknob::after{left:20px}
        .pjx-sheet-done{width:100%;margin-top:4px;height:46px;border-radius:12px;border:none;background:var(--ink);color:#fff;font-size:.92rem;font-weight:700;cursor:pointer}
        .pjx-sheet-done:hover{background:#000}
        .pjx-sortrow{width:100%;display:flex;align-items:center;justify-content:space-between;padding:13px 2px;border:none;background:transparent;font-size:.94rem;font-weight:600;color:var(--ink-soft,#3a4048);cursor:pointer;border-bottom:1px solid var(--line-soft,#ededea)}
        .pjx-sortrow:last-child{border-bottom:none}
        .pjx-sortrow.on{color:var(--gold-deep)}
      `}</style>
    </AdminShell>
  );
}
