"use client";
// ONE frameless, state-driven action area for the staff proposal workspace. Two rows max: a compact
// metadata line, then a single action row — primary (gold) + Download (secondary). Pure presentation;
// every handler comes from proposal-builder.jsx and the state flags (hasUnsent / isSentUnsigned /
// isDraftNew / isLocked) are computed there against the published-vs-working resolver — nothing is
// recomputed here. States:
//   • Draft, never sent      — Draft · save state              → [ Submit ]           [ Download ]
//   • Sent / unsigned        — Sent · date · by · v4           → [ Request Signature ][ Download ]
//   • Unsent changes         — N unsent changes · ±$  (tap→diff)→ [ Send Revision ]    [ Download ]
//   • Signed / locked        — Accepted · v4                   → [ Revise ]            [ Download ]
// Edit-to-revise: a sent/unsigned proposal is edited directly in the workspace; there is no Revise here —
// Revise returns only once the proposal is lifecycle-locked (accepted/signed). No ••• menu: Copy Link /
// Email live inside Request Signature, Views on the header eye, Configuration on the header gear.
import { useState, useEffect, useRef } from "react";
import { skipOutsideClose } from "../../../lib/outside-click";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n) => `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`;

export default function ProposalFooter({
  status, version, authBlocked, isStaff, busy, statusChip, saveStateEl,
  changeState, hasUnsent, isSentUnsigned, isDraftNew, isLocked,
  emailAsk, onEmailSend, onEmailDismiss, onSend, onRevise, onRequestSign,
  dlBusy, onDownload, canRecordPayment, onRecordPayment,
}) {
  const [changesOpen, setChangesOpen] = useState(false);
  const pubV = changeState?.publishedVersion ?? null;
  const delta = changeState?.financialDelta;
  const n = changeState?.changeCount || 0;
  const canRequestSign = isStaff && ["sent", "changes_requested"].includes(status);

  // After a send/send-revision: ask whether to email the customer (the email is no longer auto-pushed).
  if (emailAsk) {
    return (
      <div className="prop-foot prop-foot-ask">
        <span className="prop-foot-askq">Sent. Email it to the customer now?</span>
        <div className="prop-foot-acts">
          <button type="button" className="prop-dock-ghost" disabled={busy} onClick={onEmailDismiss}>Not now</button>
          <button type="button" className="prop-dock-cta" disabled={busy} onClick={onEmailSend}>Send email</button>
        </div>
      </div>
    );
  }

  const download = <DownloadBtn dlBusy={dlBusy} onDownload={onDownload} />;
  // Record Payment — on-demand ledger entry (opens a modal); a quiet secondary utility, never the
  // gold primary. Available to staff whenever there's a priced proposal to bill against.
  const recordPay = canRecordPayment ? (
    <button type="button" className="prop-foot-pay" disabled={busy} onClick={onRecordPayment} title="Record a payment">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
      Record Payment
    </button>
  ) : null;

  // Metadata (left) + primary action (right), by canonical state. Primary dominates; Download is quiet.
  let meta, primary;
  if (hasUnsent) {
    meta = (
      <button type="button" className="prop-foot-chg" onClick={() => setChangesOpen(true)} title="See what changed">
        <b>{n} unsent {n === 1 ? "change" : "changes"}</b>
        {typeof delta === "number" && delta !== 0 && <span className={`prop-foot-delta${delta < 0 ? " neg" : ""}`}>· {signed(delta)}</span>}
        {saveStateEl}
      </button>
    );
    primary = !authBlocked ? <button type="button" className="prop-dock-cta" disabled={busy} onClick={onSend}>Send Revision</button> : null;
  } else if (isSentUnsigned) {
    meta = <span className="prop-foot-meta">{statusChip}{version != null && <span className="prop-foot-v">· v{version}</span>}</span>;
    primary = canRequestSign ? (
      <button type="button" className="prop-dock-cta" disabled={busy} onClick={onRequestSign}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M15.5 4.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
        Request Signature
      </button>
    ) : null;
  } else if (isLocked) {
    meta = <span className="prop-foot-meta">{statusChip}{version != null && <span className="prop-foot-v">· v{version}</span>}</span>;
    primary = isStaff && !authBlocked ? <button type="button" className="prop-dock-cta" disabled={busy} onClick={onRevise} title="Reopen this agreed proposal for changes">Revise</button> : null;
  } else if (isDraftNew) {
    meta = <span className="prop-foot-meta">{statusChip}{saveStateEl}</span>;
    primary = !authBlocked ? <button type="button" className="prop-dock-cta" disabled={busy} onClick={onSend}>Submit</button> : null;
  } else {
    // Clean revision opened over a published version, unedited — nothing to send yet.
    meta = <span className="prop-foot-meta">{statusChip}{pubV != null && <span className="prop-foot-v">· no changes since v{pubV}</span>}{saveStateEl}</span>;
    primary = null;
  }

  return (
    <div className="prop-foot">
      <div className="prop-foot-metarow">{meta}</div>
      <div className="prop-foot-acts">{primary}{recordPay}{download}</div>
      {changesOpen && hasUnsent && <ChangesModal changeState={changeState} onClose={() => setChangesOpen(false)} />}
    </div>
  );
}

// Download — a labelled secondary button that opens a small Standard / Detailed menu (upward),
// outside-click / Escape close. No Survey here; the proposal PDF modes only.
function DownloadBtn({ dlBusy, onDownload }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e) { if (skipOutsideClose(e)) return; if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const act = (mode) => () => { onDownload(mode); setOpen(false); };
  return (
    <div className="prop-foot-dlwrap" ref={ref}>
      <button type="button" className="prop-foot-dl" disabled={dlBusy} aria-haspopup="menu" aria-expanded={open} title={dlBusy ? "Preparing…" : "Download"} onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download
      </button>
      {open && (
        <div className="prop-dock-menu l" role="menu">
          <button type="button" className="prop-dock-mi" role="menuitem" disabled={dlBusy} onClick={act("standard")}>Standard</button>
          <button type="button" className="prop-dock-mi" role="menuitem" disabled={dlBusy} onClick={act("detailed")}>Detailed</button>
        </div>
      )}
    </div>
  );
}

// ---- View Changes (read-only) -----------------------------------------------------------------
// Renders proposalDiff output in business language. Never prints raw JSON; every figure is a value the
// diff already carries.
const fmtDisc = (d) => {
  if (d == null) return "None";
  if (typeof d === "object") return +d.value ? (d.type === "pct" ? `${+d.value}%` : money(d.value)) : "None";
  return +d ? money(d) : "None";
};
const fmtPct = (v) => `${+v || 0}%`;

function lineChanges(c) {
  const rows = [];
  if (c.from.price !== c.to.price) rows.push(["Price", money(c.from.price), money(c.to.price)]);
  if (c.from.qty !== c.to.qty) rows.push(["Quantity", c.from.qty, c.to.qty]);
  if (c.from.waived !== c.to.waived) rows.push([c.to.waived ? "Waived" : "Waiver", c.from.waived ? "Waived" : "Charged", c.to.waived ? "Waived" : "Charged"]);
  if (!rows.length) rows.push(["Included items", "", "updated"]);
  return rows;
}

function ChangesModal({ changeState, onClose }) {
  const diff = changeState.structuredChanges || { options: [] };
  const multi = (diff.options || []).length > 1;
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const delta = changeState.financialDelta;
  const opts = (diff.options || []).filter((o) => o.optionAdded || o.optionRemoved || o.added?.length || o.removed?.length || o.changed?.length || o.discount || o.pcp || (o.total && o.total.from !== o.total.to));
  return (
    <div className="prop-chg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="prop-chg" role="dialog" aria-modal="true" aria-label="Changes">
        <div className="prop-chg-head">
          <span className="prop-chg-title">Changes since Version {changeState.publishedVersion}</span>
          {typeof delta === "number" && delta !== 0 && <span className={`prop-dock-delta${delta < 0 ? " neg" : ""}`}>{signed(delta)}</span>}
          <button type="button" className="prop-chg-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="prop-chg-body">
          {opts.map((o) => (
            <section key={o.id} className="prop-chg-opt">
              {(multi || o.optionAdded || o.optionRemoved) && (
                <div className="prop-chg-opthead">
                  <b>Option {o.id}{o.name ? ` · ${o.name}` : ""}</b>
                  {o.optionAdded && <span className="prop-chg-tag add">Added</span>}
                  {o.optionRemoved && <span className="prop-chg-tag rem">Removed</span>}
                  {o.total && o.total.from !== o.total.to && <span className="prop-chg-arrow">{money(o.total.from)} → {money(o.total.to)}</span>}
                </div>
              )}
              {!(multi || o.optionAdded || o.optionRemoved) && o.total && o.total.from !== o.total.to && (
                <div className="prop-chg-opthead"><b>Total</b><span className="prop-chg-arrow">{money(o.total.from)} → {money(o.total.to)}</span></div>
              )}
              {o.added?.length > 0 && <Group label="Added" tag="add">{o.added.map((a, i) => (
                <Row key={`a${i}`} name={a.name} svc={a.svc} right={`${a.qty} × ${money(a.price)}`} />
              ))}</Group>}
              {o.removed?.length > 0 && <Group label="Removed" tag="rem">{o.removed.map((a, i) => (
                <Row key={`r${i}`} name={a.name} svc={a.svc} right={`${a.qty} × ${money(a.price)}`} />
              ))}</Group>}
              {o.changed?.length > 0 && <Group label="Changed" tag="chg">{o.changed.map((c, i) => (
                <div key={`c${i}`} className="prop-chg-line">
                  <div className="prop-chg-name">{c.name}{c.svc ? <span className="prop-chg-svc"> · {c.svc}</span> : null}</div>
                  {lineChanges(c).map(([k, f, t]) => (
                    <div key={k} className="prop-chg-sub"><span>{k}</span><span>{f !== "" ? `${f} → ${t}` : t}</span></div>
                  ))}
                </div>
              ))}</Group>}
              {(o.discount || o.pcp) && <Group label="Terms" tag="chg">
                {o.discount && <div className="prop-chg-sub"><span>Discount</span><span>{fmtDisc(o.discount.from)} → {fmtDisc(o.discount.to)}</span></div>}
                {o.pcp && <div className="prop-chg-sub"><span>PCP credit</span><span>{money(o.pcp.from)} → {money(o.pcp.to)}</span></div>}
              </Group>}
            </section>
          ))}
          {(diff.tax || diff.deposit || diff.discount || diff.pcp) && (
            <section className="prop-chg-opt">
              <Group label="Payment" tag="chg">
                {diff.discount && <div className="prop-chg-sub"><span>Discount</span><span>{fmtDisc(diff.discount.from)} → {fmtDisc(diff.discount.to)}</span></div>}
                {diff.pcp && <div className="prop-chg-sub"><span>PCP credit</span><span>{fmtDisc(diff.pcp.from)} → {fmtDisc(diff.pcp.to)}</span></div>}
                {diff.deposit && <div className="prop-chg-sub"><span>Deposit</span><span>{fmtPct(diff.deposit.from)} → {fmtPct(diff.deposit.to)}</span></div>}
                {diff.tax && <div className="prop-chg-sub"><span>Tax</span><span>{fmtPct(diff.tax.from)} → {fmtPct(diff.tax.to)}</span></div>}
              </Group>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ label, tag, children }) {
  return (
    <div className="prop-chg-grp">
      <div className={`prop-chg-lbl ${tag}`}>{label}</div>
      {children}
    </div>
  );
}
function Row({ name, svc, right }) {
  return (
    <div className="prop-chg-line row">
      <div className="prop-chg-name">{name}{svc ? <span className="prop-chg-svc"> · {svc}</span> : null}</div>
      <span className="prop-chg-right">{right}</span>
    </div>
  );
}
