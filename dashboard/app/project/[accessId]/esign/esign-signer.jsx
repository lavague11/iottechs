"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PdfPages from "./pdf-pages";
import CaptureSheet from "./capture-sheet";
import ConsentSheet from "./consent-sheet";
import { Icon } from "./icons";
import { ESG_CSS } from "./esign-css";
import { startSignAction, saveSignValuesAction, completeSignAction } from "../esign-actions";

// The signer: the ACTUAL generated proposal PDF, page by page, with the signature / name / date fields
// laid over the acceptance block. Full-screen, mobile-first (sticky Next/Finish bar, large tap targets).
// Flow: tap a field (or Next) → adopt name + signature → Finish → agree to the terms → sign.

const TAG = { signature: ["Sign", Icon.pen], name: ["Name", Icon.user], date: ["Date", Icon.cal] };
const RESTART = new Set(["EXPIRED", "VOID", "CHANGED", "TAMPERED", "NO_SESSION"]);
const todayLabel = () => new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

// Client Name is a FORM field, not a signature. Its PREFERRED size tracks the FIELD HEIGHT (so it scales
// with the PDF / zoom and reads like ordinary form text — matching the Date beside it and the flattened
// 9.5pt), and it only ever SHRINKS to fit a long name's width. A short name is NEVER grown to fill the box
// (the old fixed 14px did that, dwarfing the Date on a phone). Re-fits when the field resizes (PDF zoom).
function FitValue({ text, min = 7, cap = 14 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const box = el.parentElement; if (!box) return;
    const fit = () => {
      el.style.fontSize = "";                                   // start from the CSS clamp — the SAME size the Date (span.v) uses
      const avail = box.clientWidth - 6;
      let s = parseFloat(getComputedStyle(el).fontSize) || 12, guard = 80;
      s = Math.min(s, cap);                                     // never above the preferred cap (restrained)
      el.style.fontSize = s + "px";
      while (s > min && el.scrollWidth > avail && guard-- > 0) { s -= 0.5; el.style.fontSize = s + "px"; }   // SHRINK long names only
    };
    fit();
    let ro;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(fit); ro.observe(box); }
    return () => ro?.disconnect();
  }, [text, min, cap]);
  return <span ref={ref} className="v">{text}</span>;
}
const tokenKey = (a, o) => `esign:${a}:${o}`;
const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch {} },
};

export default function EsignSigner({ accessId, optKey, optLabel, reference, defaultName = "", prepareAppendix = null, onClose, onDone }) {
  const [sess, setSess] = useState(null);      // { token }
  const [doc, setDoc] = useState(null);
  const [values, setValues] = useState({ name: null, signature: null, acks: {}, missing: [] });
  const [acks, setAcks] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [active, setActive] = useState(0);
  const [sheet, setSheet] = useState(null);    // null | "capture" | "consent"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);        // sheet-level, recoverable
  const [fatal, setFatal] = useState(null);    // { error, code } — session can't continue
  const [epoch, setEpoch] = useState(0);       // bump to reopen with a fresh session
  const [prepping, setPrepping] = useState(false);
  const scrollRef = useRef(null);
  const prepRef = useRef(prepareAppendix);     // latest, without re-triggering the open effect
  prepRef.current = prepareAppendix;

  // Open (or resume) the session. First render the survey / mockup appendix (client-side, same images the
  // Download carries) so the signer shows — and the customer signs — the WHOLE document, not just pricing.
  useEffect(() => {
    let live = true;
    setDoc(null); setFatal(null);
    (async () => {
      let appendix = null;
      if (prepRef.current) {
        setPrepping(true);
        try { const a = await prepRef.current(); if (a) appendix = { surveyImages: a.surveyImages || [], mockupImages: a.mockupImages || [] }; }
        catch { /* best-effort — fall back to the numbers-only document */ }
        if (live) setPrepping(false);
      }
      if (!live) return;
      startSignAction(accessId, optKey, store.get(tokenKey(accessId, optKey)), appendix).then((r) => {
        if (!live) return;
        if (r?.error) { setFatal({ error: r.error, code: r.code }); return; }
        store.set(tokenKey(accessId, optKey), r.token);
        setSess({ token: r.token }); setDoc(r.doc); setValues(r.values); setAcks(r.acks);
      }).catch(() => live && setFatal({ error: "Couldn't open the document.", code: "ERROR" }));
    })();
    return () => { live = false; };
  }, [accessId, optKey, epoch]);

  const fields = doc?.fields || [];
  const byPage = useMemo(() => fields.reduce((m, f, i) => { (m[f.page] ||= []).push({ ...f, i }); return m; }, {}), [fields]);
  const signed = !!(values.name && values.signature);

  const handle = useCallback((r) => {
    if (r?.error) {
      if (RESTART.has(r.code) || r.code === "DENIED" || r.code === "USED") { store.set(tokenKey(accessId, optKey), null); setFatal({ error: r.error, code: r.code }); setSheet(null); }
      else setErr(r.error);
      return false;
    }
    return true;
  }, [accessId, optKey]);

  async function save(patch, after) {
    if (!sess?.token) return;
    setBusy(true); setErr(null);
    const r = await saveSignValuesAction(accessId, sess.token, patch).catch(() => ({ error: "Couldn't save. Try again." }));
    setBusy(false);
    if (!handle(r)) return;
    setValues(r.values); after?.(r.values);
  }

  const adopt = (name, signature) => save({ name, signature }, () => { setSheet(null); setActive(Math.max(0, fields.findIndex((f) => f.type === "signature"))); });
  // Sign: the server re-validates everything, flattens the signed PDF and runs accept + sign.
  async function finish(a) {
    if (!sess?.token) return;
    setBusy(true); setErr(null);
    const r = await completeSignAction(accessId, sess.token, a).catch(() => ({ error: "Couldn't finish signing. Try again." }));
    setBusy(false);
    if (!handle(r)) return;
    store.set(tokenKey(accessId, optKey), null);
    setSheet(null);
    onDone?.(r);
  }

  function scrollTo(i) { scrollRef.current?.querySelector(`[data-field="${fields[i]?.key}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }
  function next() {
    // Not signed → jump straight to the one real action (the signature; or the name when it wasn't
    // auto-filled) and open the capture sheet. The date is never a stop.
    if (!signed) {
      let i = fields.findIndex((f) => f.type === "signature" && !values.signature);
      if (i < 0) i = fields.findIndex((f) => f.type === "name" && !values.name);
      if (i < 0) i = fields.findIndex((f) => f.type !== "date");
      setActive(Math.max(0, i)); scrollTo(Math.max(0, i)); setSheet("capture"); return;
    }
    // Already signed → cycle the active highlight through the non-date fields for review.
    const nd = fields.map((f, idx) => idx).filter((idx) => fields[idx].type !== "date");
    const pos = nd.indexOf(active); const i = nd.length ? nd[(pos + 1) % nd.length] : 0;
    setActive(i); scrollTo(i);
  }
  function tap(f) {
    if (f.type === "date") return;   // system-filled, not interactive
    setActive(f.i);
    setSheet("capture");
  }

  const overlay = (page) => (byPage[page] || []).map((f) => {
    // The date is system-generated (stamped at completion) and the name is auto-filled from the
    // proposal's PREPARED FOR value — neither is a field the customer acts on, so neither gets the
    // interactive highlight. Only an un-filled signature (or a missing name, the fallback) is live.
    const system = f.type === "date";
    const [label, icon] = TAG[f.type] || [f.type, null];
    const done = system ? true : f.type === "name" ? !!values.name : !!values.signature;
    const interactive = !system;
    return (
      <button key={f.key} type="button" data-field={f.key} data-type={f.type} data-done={done ? "1" : "0"}
        data-system={system ? "1" : "0"} data-ro={interactive ? "0" : "1"} data-testid="esign-field"
        className={`esg-f${f.i === active && interactive ? " on" : ""}${done ? " done" : ""}${system ? " system" : ""}`} aria-label={label}
        style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
        disabled={!interactive} onClick={interactive ? () => tap(f) : undefined}>
        {system && <span className="v">{todayLabel()}</span>}
        {!system && !done && <>{icon}{label}</>}
        {!system && done && f.type === "name" && <FitValue text={values.name} />}
        {!system && done && f.type === "signature" && <img alt="Your signature" src={values.signature.data} />}
      </button>
    );
  });

  // Fields the customer must act on: the signature always, plus the name only when it couldn't be
  // auto-filled. The date never counts. So a proposal with a known PREPARED FOR shows "0 / 1" → "1 / 1".
  const actionFields = fields.filter((f) => f.type === "signature" || (f.type === "name" && !values.name));
  const filled = actionFields.filter((f) => (f.type === "signature" ? !!values.signature : !!values.name)).length;

  return createPortal(
    // Portaled to <body>: the deck wraps tools in transformed containers, which would otherwise capture `position: fixed`.
    <div className="esg" role="dialog" aria-modal="true" aria-label="Sign proposal" data-testid="esign">
      <style>{ESG_CSS}</style>
      <div className="esg-top">
        <button type="button" className="esg-ico" aria-label="Close" title="Close" onClick={onClose}>{Icon.close}</button>
        <div className="esg-title">{reference}<small>{optLabel}</small></div>
        <button type="button" className="esg-ico" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}>{Icon.minus}</button>
        <button type="button" className="esg-ico" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 2.5} onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}>{Icon.plus}</button>
      </div>
      <div className="esg-scroll" ref={scrollRef}>
        {fatal && (
          <div className="esg-note err" role="alert" data-testid="esign-fatal">
            {fatal.error}
            <div style={{ marginTop: 14 }}>
              {fatal.code === "USED" || fatal.code === "DENIED"
                ? <button type="button" className="esg-ghost" onClick={onClose}>Close</button>
                : <button type="button" className="esg-go" style={{ display: "inline-flex" }} data-testid="esign-reopen" onClick={() => { store.set(tokenKey(accessId, optKey), null); setSess(null); setValues({ name: null, signature: null, acks: {}, missing: [] }); setEpoch((e) => e + 1); }}>Reopen</button>}
            </div>
          </div>
        )}
        {!fatal && !doc && <div className="esg-note">{prepping ? "Preparing your document…" : "Preparing…"}</div>}
        {!fatal && doc && <PdfPages url={`/api/proposal-doc/${doc.id}`} expectedSha={doc.sha256} zoom={zoom} renderOverlay={overlay} onError={(m) => setFatal({ error: m, code: "ERROR" })} />}
      </div>
      <div className="esg-bar">
        <span className="esg-count">{actionFields.length ? `${filled} / ${actionFields.length}` : ""}</span>
        <button type="button" className="esg-go" data-testid="esign-next" disabled={!fields.length || !!fatal} onClick={next}>Next</button>
        <button type="button" className="esg-go" data-testid="esign-finish" disabled={!signed || !!fatal} onClick={() => { setErr(null); setSheet("consent"); }}>Finish</button>
      </div>
      {sheet === "capture" && <CaptureSheet defaultName={values.name || defaultName} busy={busy} error={err} onAdopt={adopt} onCancel={() => { setSheet(null); setErr(null); }} />}
      {sheet === "consent" && <ConsentSheet acks={acks} initial={values.acks} busy={busy} error={err} confirmLabel="Sign" onConfirm={finish} onCancel={() => { setSheet(null); setErr(null); }} />}
    </div>,
    document.body
  );
}
