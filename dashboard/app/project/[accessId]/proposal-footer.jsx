"use client";
// ONE stable, state-driven action footer for the staff proposal workspace (replaces the old floating dock).
// Pure presentation: every handler is passed in from proposal-builder.jsx and reused verbatim; the
// "unsent changes" numbers come from getProposalChangeStateAction (proposalChangeState) — nothing is
// recomputed here. Three states:
//   1. Draft, never sent      — Draft · save state            | Download · Submit
//   2. Published, no changes  — Sent · date · by · Version N  | Revise · Download · Request Signature
//   3. Unsent changes         — N unsent changes since Vn ±$  | View Changes · Download · Send Revision
import { useState, useEffect, useRef } from "react";
import { skipOutsideClose } from "../../../lib/outside-click";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n) => `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`;

export default function ProposalFooter({
  status, version, readOnly, authBlocked, isStaff, busy, statusChip, saveStateEl,
  changeState, emailAsk, onEmailSend, onEmailDismiss, onSend, onRevise, onRequestSign,
  dlBusy, copied, onDownload, onCopyLink, onEmail, onConfig, viewCount = 0, onViews = null,
}) {
  const [changesOpen, setChangesOpen] = useState(false);
  const unsent = !!changeState?.hasUnsentChanges && !readOnly;
  const pubV = changeState?.publishedVersion ?? null;
  const delta = changeState?.financialDelta;
  const n = changeState?.changeCount || 0;
  // A working draft opened over a published version but not edited yet (nothing to send).
  const cleanRevision = !readOnly && pubV != null && !unsent && !!changeState;
  const canRequestSign = isStaff && ["sent", "changes_requested"].includes(status);

  // After a send/send-revision: ask whether to email the customer (the email is no longer auto-pushed).
  if (emailAsk) {
    return (
      <div className="prop-dock">
        <div className="prop-dock-row">
          <span className="prop-dock-ask">Sent. Email it to the customer now?</span>
          <span className="prop-dock-sp" />
          <button type="button" className="prop-dock-ghost" disabled={busy} onClick={onEmailDismiss}>Not now</button>
          <button type="button" className="prop-dock-cta" disabled={busy} onClick={onEmailSend}>Send email</button>
        </div>
      </div>
    );
  }

  const download = <DockMenu kind="download" dlBusy={dlBusy} onDownload={onDownload} />;
  const more = <DockMenu kind="more" copied={copied} onCopyLink={onCopyLink} onEmail={onEmail} onConfig={onConfig} viewCount={viewCount} onViews={onViews} />;

  let left, right;
  if (unsent) {
    left = (
      <span className="prop-dock-state prop-dock-unsent">
        <b>{n} unsent {n === 1 ? "change" : "changes"}</b>
        <span className="prop-dock-meta">since Version {pubV}</span>
        {typeof delta === "number" && delta !== 0 && <span className={`prop-dock-delta${delta < 0 ? " neg" : ""}`}>· {signed(delta)}</span>}
        {saveStateEl}
      </span>
    );
    right = (
      <>
        <button type="button" className="prop-dock-sec" onClick={() => setChangesOpen(true)}>View Changes</button>
        {download}{more}
        {!authBlocked && <button type="button" className="prop-dock-cta" disabled={busy} onClick={onSend}>Send Revision</button>}
      </>
    );
  } else if (!readOnly) {
    left = (
      <span className="prop-dock-state">
        {statusChip}
        {cleanRevision && <span className="prop-dock-meta">· no changes since Version {pubV}</span>}
        {saveStateEl}
      </span>
    );
    right = (
      <>
        {download}{more}
        {!authBlocked && !cleanRevision && <button type="button" className="prop-dock-cta" disabled={busy} onClick={onSend}>Submit</button>}
      </>
    );
  } else {
    left = (
      <span className="prop-dock-state">
        {statusChip}
        {version != null && <span className="prop-dock-meta">· Version {version}</span>}
      </span>
    );
    right = (
      <>
        {isStaff && !authBlocked && (
          <button type="button" className="prop-dock-sec" disabled={busy} onClick={onRevise} title="Reopen an editable version of this proposal">Revise</button>
        )}
        {download}{more}
        {canRequestSign && (
          <button type="button" className="prop-dock-cta" disabled={busy} onClick={onRequestSign}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M15.5 4.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            Request Signature
          </button>
        )}
      </>
    );
  }

  return (
    <div className="prop-dock">
      <div className="prop-dock-row">
        {left}
        <span className="prop-dock-sp" />
        <div className="prop-dock-acts">{right}</div>
      </div>
      {changesOpen && unsent && <ChangesModal changeState={changeState} onClose={() => setChangesOpen(false)} />}
    </div>
  );
}

// Download (Standard / Detailed / Survey) and ••• (Share + Configuration). Both open UPWARD, outside-click / Escape close.
function DockMenu({ kind, dlBusy, copied, onCopyLink, onEmail, onDownload, onConfig, viewCount = 0, onViews = null }) {
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
  const act = (fn) => () => { fn(); setOpen(false); };
  return (
    <div className="prop-dock-menuwrap" ref={ref}>
      {kind === "download" ? (
        <button type="button" className="prop-dock-sec" disabled={dlBusy} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
          {dlBusy ? "Preparing…" : "Download"}
        </button>
      ) : (
        <button type="button" className="prop-dock-more" aria-label="More actions" title="More" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
        </button>
      )}
      {open && (
        <div className={`prop-dock-menu${kind === "download" ? " l" : ""}`} role="menu">
          {kind === "download" ? (
            <>
              <button type="button" className="prop-dock-mi" role="menuitem" disabled={dlBusy} onClick={act(() => onDownload("standard"))}>Standard</button>
              <button type="button" className="prop-dock-mi" role="menuitem" disabled={dlBusy} onClick={act(() => onDownload("detailed"))}>Detailed</button>
              <button type="button" className="prop-dock-mi" role="menuitem" disabled={dlBusy} onClick={act(() => onDownload("survey"))}>Survey</button>
            </>
          ) : (
            <>
              <div className="prop-dock-mlbl">Share</div>
              <button type="button" className="prop-dock-mi" role="menuitem" onClick={act(onCopyLink)}>Copy Link{copied ? " ✓" : ""}</button>
              <button type="button" className="prop-dock-mi" role="menuitem" onClick={act(onEmail)}>Email Customer</button>
              <div className="prop-dock-msep" />
              {onViews && <button type="button" className="prop-dock-mi" role="menuitem" title={viewCount ? `Customer opened this ${viewCount} time${viewCount === 1 ? "" : "s"}` : "Customer hasn't opened it yet"} onClick={act(onViews)}>Views · {viewCount}</button>}
              <button type="button" className="prop-dock-mi" role="menuitem" onClick={act(onConfig)}>Configuration</button>
            </>
          )}
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
  const opts = (diff.options || []).filter((o) => o.optionAdded || o.optionRemoved || o.added?.length || o.removed?.length || o.changed?.length || o.discount || o.pcp);
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
          {(diff.tax || diff.deposit) && (
            <section className="prop-chg-opt">
              <Group label="Payment" tag="chg">
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
