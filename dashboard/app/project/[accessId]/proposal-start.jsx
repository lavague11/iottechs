"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchReusableProposalsAction, previewSourceProposalAction, cloneProposalAction, createProposalFromImportAction, searchDestinationProjectsAction } from "./reuse-actions";
import { reconcileTotals } from "../../../lib/proposal-reuse";

// Reuse a previous proposal — the UI half. Three ways into the ONE proposal editor:
//   <ProposalStart>   Blank · Previous Project · Import Proposal (shown on an empty draft)
//   <ReusePicker>     search → pick → preview + what to copy → Copy          (Path A)
//   <ImportSheet>     upload → extracting → IMPORT REVIEW → Create Draft     (Path B)
//   <PricingReview>   after a copy: "N items differ from current rates" → Keep copied / Use current
//   <UseForAnother>   ••• from an existing proposal → pick a destination → Create Draft (same clone)
// Every action re-checks the role server-side (reuse-actions.js); this file only renders.

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (t) => { if (!t) return ""; try { return new Date(String(t).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", year: "numeric" }); } catch { return ""; } };
const STATUS = { draft: "Draft", sent: "Sent", accepted: "Accepted", changes_requested: "Changes", declined: "Declined", superseded: "Superseded" };
const X = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const Sheet = ({ title, onClose, children, wide }) => (
  <div className="rp-veil" onClick={(e) => { if (e.target.classList.contains("rp-veil")) onClose?.(); }}>
    <style>{RP_CSS}</style>
    <div className={`rp-sheet${wide ? " wide" : ""}`} role="dialog" aria-label={title}>
      <div className="rp-head"><span className="rp-title">{title}</span><button type="button" className="rp-x" onClick={onClose} aria-label="Close"><X /></button></div>
      {children}
    </div>
  </div>
);

export function ProposalStart({ accessId, serviceKey, onCreated, onBlank, initialImport = null }) {
  const [mode, setMode] = useState(null);   // null | "previous" | "import"
  // The ?import= hand-off opens the review after mount (never during SSR — the sheet is client-only).
  useEffect(() => { if (initialImport?.mediaId) setMode("import"); }, [initialImport?.mediaId]);
  return (
    <div className="rp-start">
      <style>{RP_CSS}</style>
      <span className="rp-start-k">Start from</span>
      <button type="button" className="rp-start-btn" onClick={() => onBlank?.()}>Blank</button>
      <button type="button" className="rp-start-btn" onClick={() => setMode("previous")}>Previous Project</button>
      <button type="button" className="rp-start-btn" onClick={() => setMode("import")}>Import Proposal</button>
      {mode === "previous" && <ReusePicker accessId={accessId} onClose={() => setMode(null)} onCreated={(r) => { setMode(null); onCreated?.(r); }} />}
      {mode === "import" && <ImportSheet accessId={accessId} serviceKey={serviceKey} initial={initialImport} onClose={() => setMode(null)} onCreated={(r) => { setMode(null); onCreated?.(r); }} />}
    </div>
  );
}

// ---- Path A ----
// selectOnly: the New Project form uses the same picker BEFORE a project exists — the choice is
// handed back (onSelect) and the clone happens server-side at Create Project. `hint` groups
// "From this customer" for a project that isn't created yet; `serviceCode` drives the
// "Different service" note.
export function ReusePicker({ accessId = null, hint = null, serviceCode = null, selectOnly = false, onClose, onCreated, onSelect }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(null);       // preview payload
  const [opts, setOpts] = useState({ optionIds: null, includeNotes: true, includePaymentPlan: true, includeDiscount: true, includeInternal: true, addendumIds: [] });
  const [err, setErr] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { searchReusableProposalsAction(accessId, q, hint).then((r) => { if (r?.ok) setRows(r.rows || []); }); }, q ? 200 : 0);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessId, q, hint?.customer, hint?.email, hint?.phone]);
  async function choose(row) {
    setBusy(true); setErr(null);
    const r = await previewSourceProposalAction(row.proposalId);
    setBusy(false);
    if (!r?.ok) { setErr(r?.error || "Couldn't load that proposal."); return; }
    const acc = r.preview.options.filter((o) => o.accepted).map((o) => o.id);
    setOpts((o) => ({ ...o, optionIds: acc.length ? acc : null, addendumIds: [] }));
    setPick({ ...r.preview, row });
  }
  async function copy() {
    if (selectOnly) { onSelect?.({ sourceProposalId: pick.id, options: opts, preview: pick }); return; }
    setBusy(true); setErr(null);
    const r = await cloneProposalAction(accessId, { sourceProposalId: pick.id, options: opts });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onCreated?.(r);
  }
  const differentService = !!(pick && serviceCode && pick.service && String(pick.service).toUpperCase() !== String(serviceCode).toUpperCase());
  const mine = rows.filter((r) => r.sameCustomer), others = rows.filter((r) => !r.sameCustomer);
  const rowEl = (r) => (
    <button type="button" key={r.proposalId} className="rp-row" disabled={busy} onClick={() => choose(r)}>
      <span className="rp-row-id">{r.accessId}</span>
      <span className="rp-row-main"><b>{r.customer}</b><span className="rp-row-sub">{[r.service, r.address].filter(Boolean).join(" · ")}</span></span>
      <span className="rp-row-meta">{STATUS[r.status] || r.status}{r.date ? ` · ${when(r.date)}` : ""}<br />{r.items} items · {money(r.total)}</span>
    </button>
  );
  return (
    <Sheet title={pick ? "Copy from" : "Previous proposals"} onClose={onClose} wide>
      {err && <div className="rp-err">{err}</div>}
      {!pick ? (
        <>
          <input className="rp-search" placeholder="Search" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
          <div className="rp-list">
            {mine.length > 0 && <div className="rp-group">From this customer</div>}
            {mine.map(rowEl)}
            {mine.length > 0 && others.length > 0 && <div className="rp-group">Other projects</div>}
            {others.map(rowEl)}
            {!rows.length && <div className="rp-empty">No proposals</div>}
          </div>
        </>
      ) : (
        <div className="rp-preview">
          <button type="button" className="rp-back" onClick={() => setPick(null)}>← Back</button>
          <div className="rp-pv-head">
            <div><b>{pick.accessId} · {pick.customer}</b><div className="rp-row-sub">{[pick.service, pick.address].filter(Boolean).join(" · ")}</div></div>
            <div className="rp-pv-meta">{STATUS[pick.status] || pick.status}{pick.date ? ` · ${when(pick.date)}` : ""}<br />{pick.items} line items · {money(pick.total)} original total</div>
          </div>
          {pick.options.length > 1 && (
            <div className="rp-opts">
              <label className="rp-chk"><input type="checkbox" checked={opts.optionIds == null} onChange={() => setOpts((o) => ({ ...o, optionIds: null }))} />All options</label>
              {pick.options.map((o) => (
                <label key={o.id} className="rp-chk"><input type="checkbox" checked={!!opts.optionIds?.includes(o.id)} onChange={(e) => setOpts((s) => { const cur = s.optionIds || []; const next = e.target.checked ? [...new Set([...cur, o.id])] : cur.filter((x) => x !== o.id); return { ...s, optionIds: next.length ? next : null }; })} />{o.name}{o.accepted ? " · accepted" : ""}</label>
              ))}
            </div>
          )}
          <div className="rp-opts">
            <label className="rp-chk"><input type="checkbox" checked disabled />Line items, quantities, pricing</label>
            <label className="rp-chk"><input type="checkbox" checked={opts.includeNotes} onChange={(e) => setOpts((o) => ({ ...o, includeNotes: e.target.checked }))} />Notes</label>
            <label className="rp-chk"><input type="checkbox" checked={opts.includePaymentPlan} onChange={(e) => setOpts((o) => ({ ...o, includePaymentPlan: e.target.checked }))} />Payment structure &amp; tax</label>
            <label className="rp-chk"><input type="checkbox" checked={opts.includeDiscount} onChange={(e) => setOpts((o) => ({ ...o, includeDiscount: e.target.checked }))} />Discount / credit</label>
            <label className="rp-chk"><input type="checkbox" checked={opts.includeInternal} onChange={(e) => setOpts((o) => ({ ...o, includeInternal: e.target.checked }))} />Internal pricing (where permitted)</label>
            {pick.addendums?.map((a) => (
              <label key={a.id} className="rp-chk"><input type="checkbox" checked={opts.addendumIds.includes(a.id)} onChange={(e) => setOpts((o) => ({ ...o, addendumIds: e.target.checked ? [...o.addendumIds, a.id] : o.addendumIds.filter((x) => x !== a.id) }))} />Add-on: {a.title} ({a.items} items · {money(a.total)})</label>
            ))}
          </div>
          <div className="rp-note">Signatures, approvals, payments and dates stay with the original.</div>
          {differentService && <div className="rp-warn">Different service</div>}
          <div className="rp-actions"><button type="button" className="rp-btn primary" disabled={busy} onClick={copy}>{busy ? "…" : selectOnly ? "Use" : "Copy"}</button></div>
        </div>
      )}
    </Sheet>
  );
}

// ---- Path B ----
// `initial` = { mediaId, fileName, candidate? } when the file was already uploaded (New Project →
// Import Proposal): the sheet opens straight on IMPORT REVIEW, re-running extraction if no candidate.
export function ImportSheet({ accessId, serviceKey, onClose, onCreated, initial = null }) {
  const [phase, setPhase] = useState(initial?.mediaId ? (initial.candidate ? "review" : "extracting") : "upload");   // upload | extracting | review | creating
  const [mediaId, setMediaId] = useState(initial?.mediaId || null);
  const [fileName, setFileName] = useState(initial?.fileName || "");
  const [cand, setCand] = useState(initial?.candidate || null);
  const [err, setErr] = useState(null);
  useEffect(() => { if (initial?.mediaId && !initial.candidate) retry(); /* eslint-disable-next-line */ }, []);
  async function upload(file) {
    if (!file) return;
    setFileName(file.name); setPhase("extracting"); setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("project", accessId);
      const r = await fetch("/api/proposal-import", { method: "POST", body: fd }).then((x) => x.json());
      if (!r?.ok) throw new Error(r?.error || "upload failed");
      setMediaId(r.mediaId);
      if (!r.candidate) { setErr(r.error || "Couldn't read the document."); setCand({ items: [], uncertain: [] }); setPhase("review"); return; }
      setCand(r.candidate); setPhase("review");
    } catch (e) { setErr(String(e.message || e)); setPhase("upload"); }
  }
  async function retry() {
    if (!mediaId) return;
    setPhase("extracting"); setErr(null);
    const r = await fetch("/api/proposal-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaId, project: accessId }) }).then((x) => x.json()).catch(() => null);
    if (r?.candidate) setCand(r.candidate); else setErr(r?.error || "Couldn't read the document.");
    setPhase("review");
  }
  async function create() {
    setPhase("creating"); setErr(null);
    const r = await createProposalFromImportAction(accessId, { candidate: cand, serviceKey, mediaId });
    if (r?.error) { setErr(r.error); setPhase("review"); return; }
    onCreated?.(r);
  }
  const setItem = (i, patch) => setCand((c) => ({ ...c, items: c.items.map((it, k) => (k === i ? { ...it, ...patch, confidence: "high" } : it)) }));
  const delItem = (i) => setCand((c) => ({ ...c, items: c.items.filter((_, k) => k !== i) }));
  const addItem = () => setCand((c) => ({ ...c, items: [...c.items, { name: "", qty: 1, unit_price: 0, total: 0, confidence: "high" }] }));
  const rec = cand ? reconcileTotals(cand) : null;
  const uncertain = new Set((cand?.uncertain || []).map((s) => String(s).toLowerCase()));
  return (
    <Sheet title="Import proposal" onClose={onClose} wide>
      {err && <div className="rp-err">{err}</div>}
      {phase === "upload" && (
        <label className="rp-drop">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Choose file</span><small>PDF · JPG · PNG</small>
          <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      )}
      {(phase === "extracting" || phase === "creating") && <div className="rp-empty">{phase === "extracting" ? "Extracting proposal…" : "Creating draft…"}</div>}
      {phase === "review" && cand && (
        <div className="rp-review">
          <div className="rp-pv-head">
            <div><b>Import review</b><div className="rp-row-sub">{fileName}{cand.customer ? ` · ${cand.customer}` : ""}{cand.date ? ` · ${cand.date}` : ""}</div></div>
            <div className="rp-pv-meta">{cand.items.length} line items<br />{rec.subtotal != null ? `Subtotal ${money(rec.subtotal)}` : ""}{rec.tax ? ` · Tax ${money(rec.tax)}` : ""}{rec.total != null ? ` · Total ${money(rec.total)}` : ""}</div>
          </div>
          {!rec.ok && <div className="rp-warn">Totals need review — lines sum to {money(rec.lines)}{rec.total != null ? `, document says ${money(rec.total)}` : ""}.</div>}
          <div className="rp-table">
            <div className="rp-tr rp-th"><span>Item</span><span>Qty</span><span>Price</span><span>Total</span><span /></div>
            {cand.items.map((it, i) => {
              const low = it.confidence === "low" || uncertain.has(String(it.name).toLowerCase());
              return (
                <div key={i} className={`rp-tr${low ? " low" : ""}`}>
                  <input className="rp-in" value={it.name} placeholder="Item" onChange={(e) => setItem(i, { name: e.target.value })} />
                  <input className="rp-in n" type="number" min="0" value={it.qty ?? ""} onChange={(e) => setItem(i, { qty: +e.target.value })} />
                  <input className="rp-in n" type="number" min="0" step="0.01" value={it.unit_price ?? ""} placeholder="?" onChange={(e) => setItem(i, { unit_price: +e.target.value })} />
                  <span className="rp-tot">{it.unit_price != null ? money((+it.qty || 0) * (+it.unit_price || 0)) : <em>Review</em>}</span>
                  <button type="button" className="rp-x sm" onClick={() => delItem(i)} aria-label="Remove"><X /></button>
                </div>
              );
            })}
            <button type="button" className="rp-add" onClick={addItem}>+ Add</button>
          </div>
          {(cand.payment_terms || cand.notes) && <div className="rp-note">{[cand.payment_terms, cand.notes].filter(Boolean).join(" · ")}</div>}
          <div className="rp-note">The current project keeps its own customer, address and property type. The original file stays attached as the source.</div>
          <div className="rp-actions">
            {mediaId && <button type="button" className="rp-btn" onClick={retry}>Retry extraction</button>}
            <span style={{ flex: 1 }} />
            <button type="button" className="rp-btn primary" disabled={!cand.items.some((it) => String(it.name).trim())} onClick={create}>Create Draft</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ---- After a copy: prices that differ from today's rates ----
export function PricingReview({ diffs = [], onApply, onDismiss }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState({});   // itemId → "current" | "copied"
  if (!diffs.length) return null;
  const apply = (mode) => {
    const updates = {};
    for (const d of diffs) { const c = mode || choice[d.itemId] || "copied"; if (c === "current") updates[d.itemId] = d.current; }
    onApply?.(updates); onDismiss?.();
  };
  return (
    <div className="rp-pr">
      <style>{RP_CSS}</style>
      <span className="rp-pr-k">{diffs.length} item{diffs.length === 1 ? "" : "s"} differ from current rates</span>
      <button type="button" className="rp-btn sm" onClick={() => setOpen((v) => !v)}>Review</button>
      <button type="button" className="rp-x sm" onClick={onDismiss} aria-label="Dismiss"><X /></button>
      {open && (
        <div className="rp-pr-list">
          {diffs.map((d) => (
            <div key={d.itemId} className="rp-pr-row">
              <span className="rp-pr-name">{d.name}</span>
              <button type="button" className={`rp-chip${(choice[d.itemId] || "copied") === "copied" ? " on" : ""}`} onClick={() => setChoice((c) => ({ ...c, [d.itemId]: "copied" }))}>{money(d.copied)}</button>
              <button type="button" className={`rp-chip${choice[d.itemId] === "current" ? " on" : ""}`} onClick={() => setChoice((c) => ({ ...c, [d.itemId]: "current" }))}>{money(d.current)}</button>
            </div>
          ))}
          <div className="rp-actions">
            <button type="button" className="rp-btn" onClick={() => apply("copied")}>Keep Copied Prices</button>
            <button type="button" className="rp-btn" onClick={() => apply("current")}>Use Current Rates</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="rp-btn primary" onClick={() => apply(null)}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Reverse entry: from an existing proposal, into another project ----
export function UseForAnother({ accessId, proposalId, onClose }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setRows([]); return; }
    timer.current = setTimeout(() => searchDestinationProjectsAction(q, accessId).then((r) => { if (r?.ok) setRows(r.rows); }), 200);
    return () => clearTimeout(timer.current);
  }, [q, accessId]);
  async function go(dest) {
    setBusy(true); setErr(null);
    const r = await cloneProposalAction(dest.accessId, { sourceProposalId: proposalId, options: { includeNotes: true, includePaymentPlan: true, includeDiscount: true, includeInternal: true } });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    router.push(`/project/${dest.accessId}?deck=1`);
  }
  return (
    <Sheet title="Use for another project" onClose={onClose}>
      <style>{RP_CSS}</style>
      {err && <div className="rp-err">{err}</div>}
      <input className="rp-search" placeholder="Project ID, customer, address" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
      <div className="rp-list">
        {rows.map((r) => (
          <button type="button" key={r.accessId} className="rp-row" disabled={busy || r.hasProposal} title={r.hasProposal ? "Already has a proposal — revise it there" : undefined} onClick={() => go(r)}>
            <span className="rp-row-id">{r.accessId}</span>
            <span className="rp-row-main"><b>{r.customer}</b><span className="rp-row-sub">{[r.service, r.address].filter(Boolean).join(" · ")}</span></span>
            <span className="rp-row-meta">{r.hasProposal ? "Has proposal" : "Create Draft"}</span>
          </button>
        ))}
        {q.trim() && !rows.length && <div className="rp-empty">No projects</div>}
      </div>
    </Sheet>
  );
}

export const RP_CSS = `
.rp-start{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;margin:0 0 10px;border:1px dashed var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA)}
.rp-start-k{font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-right:2px}
.rp-start-btn{height:32px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418);border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
.rp-start-btn:hover{border-color:var(--dv-ink,#101418)}
.rp-veil{position:fixed;inset:0;z-index:90;background:rgba(16,20,24,.32);display:flex;justify-content:flex-end}
.rp-sheet{width:min(440px,100%);height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-8px 0 32px -12px rgba(0,0,0,.35);font-family:inherit;color:var(--dv-ink,#101418)}
.rp-sheet.wide{width:min(560px,100%)}
.rp-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.rp-title{flex:1;font-size:.95rem;font-weight:700}
.rp-x{width:32px;height:32px;border:none;background:none;color:var(--dv-meta,#787D84);cursor:pointer;display:grid;place-items:center;border-radius:8px}
.rp-x.sm{width:26px;height:26px}
.rp-x:hover{background:var(--dv-paper,#F4F4F2)}
.rp-err{margin:10px 14px 0;font-size:.8rem;color:var(--dv-red,#C4553D);background:#fbe9e6;border:1px solid #e3b4ab;border-radius:8px;padding:8px 10px}
.rp-warn{margin:0 0 10px;font-size:.8rem;color:#b45309;background:#fdf0e6;border:1px solid #f0cfae;border-radius:8px;padding:8px 10px}
.rp-search{margin:12px 14px 0;height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:0 12px;font-size:.9rem;font-family:inherit;outline:none}
.rp-search:focus{border-color:var(--dv-gold,#C9A96E)}
.rp-list{flex:1;overflow:auto;padding:10px 14px 14px;display:flex;flex-direction:column;gap:6px}
.rp-group{font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin:8px 0 2px}
.rp-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;text-align:left;padding:9px 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);cursor:pointer;font-family:inherit;color:inherit}
.rp-row:hover:not(:disabled){border-color:var(--dv-ink,#101418)}
.rp-row:disabled{opacity:.55;cursor:default}
.rp-row-id{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.72rem;font-weight:700;color:var(--dv-meta,#787D84)}
.rp-row-main{min-width:0;display:flex;flex-direction:column;font-size:.86rem}
.rp-row-sub{font-size:.74rem;color:var(--dv-meta,#787D84);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rp-row-meta{font-size:.7rem;color:var(--dv-meta,#787D84);text-align:right;white-space:nowrap}
.rp-empty{color:var(--dv-faint,#A1A6AC);font-size:.86rem;padding:24px 0;text-align:center}
.rp-preview,.rp-review{flex:1;overflow:auto;padding:12px 14px 14px;display:flex;flex-direction:column;gap:12px}
.rp-back{align-self:flex-start;background:none;border:none;color:var(--dv-meta,#787D84);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit;padding:0}
.rp-pv-head{display:flex;justify-content:space-between;gap:12px;font-size:.9rem}
.rp-pv-meta{font-size:.74rem;color:var(--dv-meta,#787D84);text-align:right;flex-shrink:0;max-width:46%}
.rp-opts{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px}
.rp-chk{display:flex;align-items:center;gap:8px;font-size:.84rem}
.rp-note{font-size:.76rem;color:var(--dv-meta,#787D84)}
.rp-actions{display:flex;align-items:center;gap:8px;padding-top:4px}
.rp-btn{height:34px;padding:0 14px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418);border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
.rp-btn.sm{height:28px;padding:0 10px;font-size:.74rem}
.rp-btn.primary{background:var(--dv-ink,#101418);color:#fff;border-color:var(--dv-ink,#101418)}
.rp-btn:disabled{opacity:.5;cursor:default}
.rp-drop{margin:14px;flex:1;min-height:180px;border:1.5px dashed var(--dv-line,#E4E4DF);border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--dv-meta,#787D84);cursor:pointer;font-size:.86rem;font-weight:600}
.rp-drop small{font-weight:500;font-size:.72rem}
.rp-drop:hover{border-color:var(--dv-ink,#101418);color:var(--dv-ink,#101418)}
.rp-table{display:flex;flex-direction:column;gap:4px}
.rp-tr{display:grid;grid-template-columns:1fr 56px 84px 78px 26px;gap:6px;align-items:center}
.rp-th{font-size:.64rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--dv-meta,#787D84);padding:0 2px}
.rp-tr.low .rp-in{border-color:#f0cfae;background:#fffaf4}
.rp-in{height:32px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;padding:0 8px;font-size:.82rem;font-family:inherit;min-width:0;outline:none}
.rp-in.n{text-align:right}
.rp-in:focus{border-color:var(--dv-gold,#C9A96E)}
.rp-tot{font-size:.8rem;text-align:right;font-variant-numeric:tabular-nums}
.rp-tot em{color:#b45309;font-style:normal;font-weight:700;font-size:.7rem}
.rp-add{align-self:flex-start;background:none;border:none;color:var(--dv-meta,#787D84);font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit;padding:4px 2px}
.rp-pr{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;margin:0 0 10px;border:1px solid #f0cfae;border-radius:10px;background:#fffaf4}
.rp-pr-k{flex:1;font-size:.8rem;font-weight:600;color:#b45309}
.rp-pr-list{flex:1 1 100%;display:flex;flex-direction:column;gap:6px;padding-top:6px;border-top:1px solid #f0cfae}
.rp-pr-row{display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;font-size:.82rem}
.rp-pr-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-chip{height:28px;padding:0 10px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;border-radius:100px;font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit;font-variant-numeric:tabular-nums}
.rp-chip.on{background:var(--dv-ink,#101418);color:#fff;border-color:var(--dv-ink,#101418)}
@media (max-width:767px){
  .rp-veil{align-items:flex-end}
  .rp-sheet,.rp-sheet.wide{width:100%;height:min(92vh,100%);border-radius:16px 16px 0 0;box-shadow:0 -8px 32px -12px rgba(0,0,0,.35)}
  .rp-row{grid-template-columns:auto 1fr}
  .rp-row-meta{grid-column:1 / -1;text-align:left;white-space:normal}
  .rp-tr{grid-template-columns:1fr 48px 72px 26px}
  .rp-tot{display:none}
  .rp-pv-head{flex-direction:column}
  .rp-pv-meta{text-align:left;white-space:normal}
}
`;
