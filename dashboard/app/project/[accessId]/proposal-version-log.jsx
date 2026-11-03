"use client";
// A read-only "Sent versions" log shown at the very bottom of the proposal — every version that was ever
// sent, newest first, with its send date/author and whether it was signed. Lazily fetched (staff only).
import { useEffect, useState } from "react";
import { getProposalHistoryAction } from "./proposal-actions";

const fmt = (d) => { if (!d) return ""; try { return new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return String(d).slice(0, 10); } };

export default function ProposalVersionLog({ accessId }) {
  const [versions, setVersions] = useState(null);
  useEffect(() => {
    let live = true;
    getProposalHistoryAction(accessId).then((r) => { if (live) setVersions(r?.ok ? r.versions : []); }).catch(() => { if (live) setVersions([]); });
    return () => { live = false; };
  }, [accessId]);
  if (!versions || versions.length === 0) return null;
  return (
    <section className="pvl">
      <style>{CSS}</style>
      <div className="pvl-head">Sent versions</div>
      <div className="pvl-list">
        {versions.map((v) => (
          <div className="pvl-row" key={v.version}>
            <span className="pvl-v">v{v.version}</span>
            <span className="pvl-when">{fmt(v.sent_at)}</span>
            {v.sent_by_name && <span className="pvl-by">by {v.sent_by_name}</span>}
            <span className="pvl-sp" />
            {v.signed_at
              ? <span className="pvl-badge signed">Signed{v.signed_name ? ` · ${v.signed_name}` : ""} · {fmt(v.signed_at)}</span>
              : <span className="pvl-badge">{v.status === "superseded" ? "Superseded" : "Sent"}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

const CSS = `
.pvl{max-width:900px;margin:24px auto 0;border-top:1px solid var(--dv-line,var(--line,#E4E4DF));padding-top:16px}
.pvl-head{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--dv-meta,var(--meta,#787D84));margin-bottom:10px}
.pvl-list{display:flex;flex-direction:column}
.pvl-row{display:flex;align-items:baseline;gap:12px;padding:9px 0;border-top:1px solid var(--dv-line,var(--line,#EDEDE9));font-size:13.5px}
.pvl-row:first-child{border-top:0}
.pvl-v{font-weight:800;color:var(--dv-ink,var(--ink,#101418));font-variant-numeric:tabular-nums;min-width:30px}
.pvl-when{color:var(--dv-ink,var(--ink,#101418))}
.pvl-by{color:var(--dv-meta,var(--meta,#787D84))}
.pvl-sp{flex:1}
.pvl-badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:var(--dv-raise,#f0f2f7);color:var(--dv-meta,var(--meta,#787D84));white-space:nowrap}
.pvl-badge.signed{background:#e7f6ec;color:#1c8a45}
`;
