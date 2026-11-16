"use client";
// "Sent versions" log at the bottom of the proposal — every version ever sent, newest first. Each row opens a
// read-only snapshot of exactly what was sent (lib/proposal-version-snapshot.js); add-ons listed below open
// the same treatment. Lazily fetched, staff only.
import { useEffect, useState } from "react";
import { getProposalHistoryAction, getProposalVersionAction, getAddendumSnapshotAction } from "./proposal-actions";
import VersionSnapshot, { Chevron } from "./proposal-version-snapshot";
import { addendumRowText } from "../../../lib/addendum-display";

const fmt = (d) => { if (!d) return ""; try { return new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return String(d).slice(0, 10); } };

export default function ProposalVersionLog({ accessId, fileBase = null, customerName, customerAddress, customerPhone, customerEmail }) {
  const [versions, setVersions] = useState(null);
  const [addenda, setAddenda] = useState([]);
  const [open, setOpen] = useState(null);      // "v:<n>" | "a:<id>"
  const [snaps, setSnaps] = useState({});      // key → snapshot (fetched on first open)
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  // An addendum created/changed in the editor below the proposal refreshes this list (no shared state needed).
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("iot:addendum-changed", bump);
    return () => window.removeEventListener("iot:addendum-changed", bump);
  }, []);
  useEffect(() => {
    let live = true;
    getProposalHistoryAction(accessId).then((r) => { if (live) { setVersions(r?.ok ? r.versions : []); setAddenda(r?.ok ? (r.addenda || []) : []); } }).catch(() => { if (live) setVersions([]); });
    return () => { live = false; };
  }, [accessId, tick]);
  if (!versions || (versions.length === 0 && addenda.length === 0)) return null;

  // Refetch on every open: the snapshot carries its diff against the working draft, which may have moved.
  async function toggle(key, load) {
    if (open === key) { setOpen(null); return; }
    setOpen(key);
    setSnaps((s) => { const { [key]: _gone, ...rest } = s; return rest; });
    const r = await load().catch(() => null);
    setSnaps((s) => ({ ...s, [key]: r?.ok ? r.snapshot : false }));
  }
  async function download(snap) {
    setBusy(true);
    try {
      const { saveFillableProposalPdf } = await import("../../../lib/proposal-acroform");
      await saveFillableProposalPdf(snap.pdf, { customerName, customerAddress, customerPhone, customerEmail, mode: "standard", fileBase, projectId: accessId });
    } finally { setBusy(false); }
  }
  const row = (key, load, cells, badge) => (
    <div key={key}>
      <button type="button" className={`pvl-row${open === key ? " open" : ""}`} aria-expanded={open === key} onClick={() => toggle(key, load)}>
        {cells}
        <span className="pvl-sp" />
        {badge}
        <span className="pvl-chev"><Chevron /></span>
      </button>
      {open === key && (snaps[key] ? <VersionSnapshot snap={snaps[key]} busy={busy} onDownload={() => download(snaps[key])} /> : <div className="pvl-load">{snaps[key] === false ? "Unavailable" : "Loading"}</div>)}
    </div>
  );
  return (
    <section className="pvl">
      <style>{CSS}</style>
      <div className="pvl-head">Sent versions</div>
      <div className="pvl-list">
        {versions.map((v) => row(`v:${v.version}`, () => getProposalVersionAction(accessId, v.version),
          <>
            <span className="pvl-v">v{v.version}</span>
            <span className="pvl-when">{fmt(v.sent_at)}</span>
            {v.sent_by_name && <span className="pvl-by">by {v.sent_by_name}</span>}
          </>,
          v.signed_at
            ? <span className="pvl-badge signed">Signed{v.signed_name ? ` · ${v.signed_name}` : ""} · {fmt(v.signed_at)}</span>
            : <span className="pvl-badge">{v.status === "superseded" ? "Superseded" : "Sent"}</span>))}
        {addenda.map((a, i) => row(`a:${a.id}`, () => getAddendumSnapshotAction(accessId, a.id),
          <span className="pvl-v pvl-a">{addendumRowText(a, a.label ? Number(a.label.slice(1)) - 1 : i)}</span>,
          null))}
      </div>
    </section>
  );
}

const CSS = `
.pvl{max-width:900px;margin:24px auto 0;border-top:1px solid var(--dv-line,var(--line,#E4E4DF));padding-top:16px}
.pvl-head{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--dv-meta,var(--meta,#787D84));margin-bottom:10px}
.pvl-list{display:flex;flex-direction:column}
.pvl-row{display:flex;align-items:center;gap:12px;width:100%;padding:9px 8px;border:0;border-top:1px solid var(--dv-line,var(--line,#EDEDE9));background:transparent;color:inherit;font:inherit;font-size:13.5px;text-align:left;cursor:pointer;border-radius:var(--r-sm,8px)}
.pvl-list>div:first-child .pvl-row{border-top:0}
.pvl-row:hover,.pvl-row:focus-visible{background:var(--dv-raise,#f0f2f7)}
.pvl-v{font-weight:800;color:var(--dv-ink,var(--ink,#101418));font-variant-numeric:tabular-nums;min-width:30px}
.pvl-a{min-width:0;font-weight:600}
.pvl-when{color:var(--dv-ink,var(--ink,#101418))}
.pvl-by{color:var(--dv-meta,var(--meta,#787D84))}
.pvl-sp{flex:1}
.pvl-badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:var(--dv-raise,#f0f2f7);color:var(--dv-meta,var(--meta,#787D84));white-space:nowrap}
.pvl-badge.signed{background:color-mix(in srgb,var(--dv-green) 14%,transparent);color:var(--dv-green)}
.pvl-chev{display:inline-flex;color:var(--dv-meta,var(--meta,#787D84));transition:transform .15s}
.pvl-row.open .pvl-chev{transform:rotate(90deg)}
.pvl-load{padding:6px 0 12px 42px;color:var(--dv-meta,var(--meta,#787D84))}
`;
