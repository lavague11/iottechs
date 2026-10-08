"use client";
import { useState } from "react";
import { PROPOSAL_ACKS, PROPOSAL_TERMS, PROPOSAL_TERMS_TITLE, PROPOSAL_TERMS_INTRO, PROPOSAL_TERMS_VERSION } from "../../../../lib/proposal-terms";
import { Icon } from "./icons";

// The Section 83 acknowledgments + Master Terms (same wording the old modal showed — owned by
// lib/proposal-terms.js, not copied here). Required ones must be checked before the document can be signed.
export default function ConsentSheet({ acks, initial = {}, onConfirm, onCancel, busy = false, error = null, confirmLabel = "Sign" }) {
  const [checks, setChecks] = useState(() => Object.fromEntries(acks.map((a) => [a.key, !!initial[a.key]])));
  const [showTerms, setShowTerms] = useState(false);
  const defs = acks.map((a) => ({ ...a, label: PROPOSAL_ACKS.find((x) => x.key === a.key)?.label || a.key }));
  const ok = defs.every((a) => !a.required || checks[a.key]);
  return (
    <div className="esg-sheet-bg" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.(); }}>
      <div className="esg-sheet" role="dialog" aria-label="Agreement" data-testid="esign-consent">
        <div className="esg-row">
          <span className="sp esg-lbl">{PROPOSAL_TERMS_TITLE}</span>
          <button type="button" className="esg-ico" aria-label="Close" title="Close" onClick={onCancel} disabled={busy}>{Icon.close}</button>
        </div>
        <div className="esg-acks">
          {defs.map((a) => (
            <label key={a.key} className="esg-ack">
              <input type="checkbox" data-testid={`esign-ack-${a.key}`} checked={!!checks[a.key]} onChange={(e) => setChecks((c) => ({ ...c, [a.key]: e.target.checked }))} />
              <span>{a.label}{a.required ? <i className="esg-req"> *</i> : null}</span>
            </label>
          ))}
        </div>
        <button type="button" className="esg-link" aria-expanded={showTerms} onClick={() => setShowTerms((s) => !s)}>{showTerms ? "Hide terms" : "Read terms"}</button>
        {showTerms && (
          <div className="esg-terms" role="region" aria-label="Terms">
            <p><b>{PROPOSAL_TERMS_TITLE} — {PROPOSAL_TERMS_VERSION}</b></p>
            <p>{PROPOSAL_TERMS_INTRO}</p>
            {PROPOSAL_TERMS.map((t) => <p key={t.n ?? t.h}><b>{t.n != null ? `${t.n}. ` : ""}{t.h}.</b> {t.b}</p>)}
          </div>
        )}
        {error && <div className="esg-err" role="alert">{error}</div>}
        <div className="esg-row">
          <span className="sp esg-fine">By signing electronically, you agree your electronic signature is the legal equivalent of your handwritten signature.</span>
          <button type="button" className="esg-go" data-testid="esign-confirm" disabled={!ok || busy} onClick={() => onConfirm?.(checks)}>{busy ? "Saving…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
