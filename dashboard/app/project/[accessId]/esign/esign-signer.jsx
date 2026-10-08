"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PdfPages from "./pdf-pages";
import { ESG_CSS } from "./esign-css";
import { prepareSignDocAction } from "../esign-actions";

// The signer: the ACTUAL generated proposal PDF, page by page, with the signature / name / date fields
// laid over the acceptance block. Full-screen, mobile-first (sticky Next/Finish bar, large tap targets).

const I = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
export const Icon = {
  close: <svg {...I}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  plus: <svg {...I}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  minus: <svg {...I}><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  pen: <svg {...I} width="14" height="14"><path d="M3 21h18" /><path d="M15.5 4.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>,
  user: <svg {...I} width="14" height="14"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  cal: <svg {...I} width="14" height="14"><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>,
  check: <svg {...I} width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>,
};
const TAG = { signature: ["Sign", Icon.pen], name: ["Name", Icon.user], date: ["Date", Icon.cal] };

export default function EsignSigner({ accessId, optKey, optLabel, reference, onClose }) {
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [active, setActive] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    let live = true;
    prepareSignDocAction(accessId, optKey).then((r) => { if (!live) return; if (r?.error) setErr(r.error); else setDoc(r.doc); }).catch(() => live && setErr("Couldn't open the document."));
    return () => { live = false; };
  }, [accessId, optKey]);

  const fields = doc?.fields || [];
  const byPage = useMemo(() => fields.reduce((m, f, i) => { (m[f.page] ||= []).push({ ...f, i }); return m; }, {}), [fields]);

  function goTo(i) {
    setActive(i);
    const el = scrollRef.current?.querySelector(`[data-field="${fields[i]?.key}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  const overlay = (page) => (byPage[page] || []).map((f) => {
    const [label, icon] = TAG[f.type] || [f.type, null];
    return (
      <button key={f.key} type="button" data-field={f.key} data-type={f.type} data-ro="1" data-testid="esign-field"
        className={`esg-f${f.i === active ? " on" : ""}`} aria-label={label}
        style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
        onClick={() => setActive(f.i)}>
        {icon}{label}
      </button>
    );
  });

  // Portaled to <body>: the deck wraps tools in transformed containers, which would otherwise capture `position: fixed`.
  return createPortal(
    <div className="esg" role="dialog" aria-modal="true" aria-label="Sign proposal" data-testid="esign">
      <style>{ESG_CSS}</style>
      <div className="esg-top">
        <button type="button" className="esg-ico" aria-label="Close" title="Close" onClick={onClose}>{Icon.close}</button>
        <div className="esg-title">{reference}<small>{optLabel}</small></div>
        <button type="button" className="esg-ico" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}>{Icon.minus}</button>
        <button type="button" className="esg-ico" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 2.5} onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}>{Icon.plus}</button>
      </div>
      <div className="esg-scroll" ref={scrollRef}>
        {err && <div className="esg-note err" role="alert">{err}</div>}
        {!err && !doc && <div className="esg-note">Preparing…</div>}
        {doc && <PdfPages url={`/api/proposal-doc/${doc.id}`} expectedSha={doc.sha256} zoom={zoom} renderOverlay={overlay} onError={setErr} />}
      </div>
      <div className="esg-bar">
        <span className="esg-count">{fields.length ? `${active + 1} / ${fields.length}` : ""}</span>
        <button type="button" className="esg-go" data-testid="esign-next" disabled={!fields.length} onClick={() => goTo((active + 1) % fields.length)}>Next</button>
        <button type="button" className="esg-go" data-testid="esign-finish" disabled>Finish</button>
      </div>
    </div>,
    document.body
  );
}
