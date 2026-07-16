"use client";
import { fmtSignStamp } from "../../../lib/proposal";

// Reduce a full street address to just "City, ST" for the pre-acceptance technician board —
// the tech sees the neighborhood, not the exact door, until they accept the work order.
export function generalLocation(address) {
  if (!address) return "Location on file";
  const parts = String(address).split(",").map(s => s.trim()).filter(Boolean);
  let si = parts.findIndex(p => /^[A-Z]{2}\b/.test(p) && /\d/.test(p));   // "NJ 07083"
  if (si < 0) si = parts.findIndex(p => /^[A-Z]{2}$/.test(p));            // "NJ"
  if (si > 0) {
    const st = parts[si].match(/^[A-Z]{2}/)?.[0] || parts[si];
    return `${parts[si - 1]}, ${st}`;
  }
  return parts.length > 1 ? parts.slice(1).join(", ").replace(/\s+\d{5}(-\d{4})?/, "").replace(/,?\s*USA$/i, "") : parts[0];
}
const mapsUrl = (q) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q || "");

// Pre-acceptance overview for the technician on the Work Order Created stage: what/where at a
// glance, general location only, NO contact details. Full address is revealed at Install.
export default function TechProjectBoard({ project }) {
  const name = project?.customer || project?.contact_name || "Customer";
  const loc = generalLocation(project?.address);
  const svc = project?.service || project?.service_code || "Low-voltage install";
  const cams = project?.cameras;
  const date = project?.install_date || project?.date;

  return (
    <div className="tpb-root">
      <style>{TPB_CSS}</style>
      <div className="tpb-head">
        <span className="tpb-title">Job Overview</span>
        <span className="tpb-tag">Technician</span>
      </div>
      <div className="tpb-grid">
        <div className="tpb-cell">
          <span className="tpb-lbl">Customer</span>
          <b>{name}</b>
        </div>
        <div className="tpb-cell">
          <span className="tpb-lbl">Area</span>
          <b>{loc}</b>
          <a className="tpb-dir" href={mapsUrl(loc)} target="_blank" rel="noopener noreferrer">Directions ↗</a>
        </div>
        <div className="tpb-cell">
          <span className="tpb-lbl">Service</span>
          <b>{svc}{cams ? ` · ${cams} camera${cams === 1 ? "" : "s"}` : ""}</b>
        </div>
        {date && (
          <div className="tpb-cell">
            <span className="tpb-lbl">Scheduled</span>
            <b>{fmtSignStamp(date + " 00:00").replace(/ · .*/, "") || date}</b>
          </div>
        )}
      </div>
      <div className="tpb-foot">Exact address &amp; equipment checklist unlock once you accept the work order.</div>
    </div>
  );
}

const TPB_CSS = `
.tpb-root{background:var(--ink);border-radius:14px;padding:16px 18px;margin-bottom:14px;color:#fff;
  font-family:var(--font);border-top:4px solid var(--green)}
.tpb-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.tpb-title{font-size:.95rem;font-weight:800;letter-spacing:.02em}
.tpb-tag{font-size:.62rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#5FB88A;border:1px solid rgba(95,184,138,.45);border-radius:100px;padding:4px 11px}
.tpb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
.tpb-cell{display:flex;flex-direction:column;gap:3px;min-width:0}
.tpb-lbl{font-size:.6rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8a93a8}
.tpb-cell b{font-size:.9rem;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpb-dir{font-size:.72rem;color:#9fc0e8;text-decoration:none;margin-top:1px}
.tpb-dir:hover{color:var(--gold)}
.tpb-foot{margin-top:12px;font-size:.72rem;color:#9aa1af;border-top:1px solid rgba(255,255,255,.08);padding-top:10px}
`;
