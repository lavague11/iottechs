"use client";
// The ONE project header — used by the staff Project Hub and the customer portal so they cannot drift.
// Brand mark (link) · project name + id (centered) · a right slot (Portal menu / My projects). The whole bar
// toggles the contact drop-down; the drop-down is ProjectContactCard fed the gateway's `deckCustomer`, whose
// `actions` / `canEdit` are already role-resolved (customer = Navigate + Share only; add-person and edit are
// staff caps, and the edit itself is enforced server-side inside `updateProjectInfoAction`).
import { useState } from "react";
import ProjectContactCard from "./project-contact-card";

export const HEADER_CSS = `
.cpv-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;position:static}
.cpv-head[role="button"]{cursor:pointer}
.cpv-head[role="button"]:hover{background:var(--raise)}
.cpv-head.open{border-bottom:0}
.cpv-htitle{justify-self:center;display:inline-flex;align-items:center;gap:7px;background:none;border:0;font-family:inherit;color:var(--ink);padding:6px 12px;border-radius:999px;max-width:100%;min-width:0;cursor:inherit;pointer-events:none}
.cpv-htitle-name{font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpv-htitle-id{color:var(--meta);font-size:13px;font-family:var(--font-mono),ui-monospace,monospace;flex:0 0 auto}
.cpv-portwrap{justify-self:end}
.cpv-headdrop{border-bottom:1px solid var(--line);background:rgba(255,255,255,.75)}
.cpv-headdrop .pcc-flush{max-width:1040px;margin:0 auto}
.cpv-mark-link{text-decoration:none;color:var(--ink);cursor:pointer;justify-self:start}
.cpv-mark-link:hover{color:var(--gold-text)}
`;

export default function PortalHeader({ accessId, projName, contact = null, brandHref = "/", brandLabel = "Home", children }) {
  const [open, setOpen] = useState(false);   // collapsed on open — click the bar to expand the contact details
  return (
    <>
      <style>{HEADER_CSS}</style>
      <div className={`cpv-head${contact && open ? " open" : ""}`} onClick={() => contact && setOpen((v) => !v)}
        role={contact ? "button" : undefined} aria-expanded={contact ? open : undefined} aria-label={contact ? (open ? "Hide contact details" : "Show contact details") : undefined}>
        <a className="cpv-mark cpv-mark-link" href={brandHref} onClick={(e) => e.stopPropagation()} aria-label={brandLabel}>IOT TECHS</a>
        <span className="cpv-htitle">
          <span className="cpv-htitle-name">{projName}</span>
          <span className="cpv-htitle-id">· {String(accessId)}</span>
        </span>
        {/* Right slot — stops propagation so its controls don't toggle the bar. */}
        <div className="cpv-portwrap" onClick={(e) => e.stopPropagation()}>{children}</div>
      </div>
      {contact && open && (
        <div className="cpv-headdrop">
          <ProjectContactCard customer={contact} open flush />
        </div>
      )}
    </>
  );
}
