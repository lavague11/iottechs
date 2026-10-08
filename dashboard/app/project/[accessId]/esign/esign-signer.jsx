"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PdfPages from "./pdf-pages";
import CaptureSheet from "./capture-sheet";
import ConsentSheet from "./consent-sheet";
import { Icon } from "./icons";
import { ESG_CSS } from "./esign-css";
import { startSignAction, saveSignValuesAction } from "../esign-actions";

// The signer: the ACTUAL generated proposal PDF, page by page, with the signature / name / date fields
// laid over the acceptance block. Full-screen, mobile-first (sticky Next/Finish bar, large tap targets).
// Flow: tap a field (or Next) → adopt name + signature → Finish → agree to the terms → sign.

const TAG = { signature: ["Sign", Icon.pen], name: ["Name", Icon.user], date: ["Date", Icon.cal] };
const RESTART = new Set(["EXPIRED", "VOID", "CHANGED", "TAMPERED", "NO_SESSION"]);
const todayLabel = () => new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
const tokenKey = (a, o) => `esign:${a}:${o}`;
const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch {} },
};

export default function EsignSigner({ accessId, optKey, optLabel, reference, defaultName = "", onClose }) {
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
  const [toast, setToast] = useState(null);
  const [epoch, setEpoch] = useState(0);       // bump to reopen with a fresh session
  const scrollRef = useRef(null);

  // Open (or resume) the session.
  useEffect(() => {
    let live = true;
    setDoc(null); setFatal(null);
    startSignAction(accessId, optKey, store.get(tokenKey(accessId, optKey))).then((r) => {
      if (!live) return;
      if (r?.error) { setFatal({ error: r.error, code: r.code }); return; }
      store.set(tokenKey(accessId, optKey), r.token);
      setSess({ token: r.token }); setDoc(r.doc); setValues(r.values); setAcks(r.acks);
    }).catch(() => live && setFatal({ error: "Couldn't open the document.", code: "ERROR" }));
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
  const saveAcks = (a) => save({ acks: a }, () => { setSheet(null); setToast("Saved"); setTimeout(() => setToast(null), 2200); });

  function scrollTo(i) { scrollRef.current?.querySelector(`[data-field="${fields[i]?.key}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }
  function next() {
    if (!signed) { const i = fields.findIndex((f) => f.type !== "date"); setActive(Math.max(0, i)); scrollTo(Math.max(0, i)); setSheet("capture"); return; }
    const i = (active + 1) % Math.max(1, fields.length); setActive(i); scrollTo(i);
  }
  function tap(f) {
    setActive(f.i);
    if (f.type === "date" && signed) return;
    setSheet("capture");
  }

  const overlay = (page) => (byPage[page] || []).map((f) => {
    const [label, icon] = TAG[f.type] || [f.type, null];
    const done = f.type === "name" ? !!values.name : f.type === "signature" ? !!values.signature : signed;
    return (
      <button key={f.key} type="button" data-field={f.key} data-type={f.type} data-done={done ? "1" : "0"} data-testid="esign-field"
        className={`esg-f${f.i === active ? " on" : ""}${done ? " done" : ""}`} aria-label={label}
        style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
        onClick={() => tap(f)}>
        {!done && <>{icon}{label}</>}
        {done && f.type === "name" && <span className="v">{values.name}</span>}
        {done && f.type === "date" && <span className="v">{todayLabel()}</span>}
        {done && f.type === "signature" && <img alt="Your signature" src={values.signature.data} />}
      </button>
    );
  });

  const filled = fields.filter((f) => (f.type === "name" ? values.name : f.type === "signature" ? values.signature : signed)).length;

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
        {!fatal && !doc && <div className="esg-note">Preparing…</div>}
        {!fatal && doc && <PdfPages url={`/api/proposal-doc/${doc.id}`} expectedSha={doc.sha256} zoom={zoom} renderOverlay={overlay} onError={(m) => setFatal({ error: m, code: "ERROR" })} />}
      </div>
      <div className="esg-bar">
        <span className="esg-count">{fields.length ? `${filled} / ${fields.length}` : ""}</span>
        {toast && <span className="esg-count" role="status" data-testid="esign-toast" style={{ color: "var(--esg-ok)", textAlign: "right" }}>{toast}</span>}
        <button type="button" className="esg-go" data-testid="esign-next" disabled={!fields.length || !!fatal} onClick={next}>Next</button>
        <button type="button" className="esg-go" data-testid="esign-finish" disabled={!signed || !!fatal} onClick={() => { setErr(null); setSheet("consent"); }}>Finish</button>
      </div>
      {sheet === "capture" && <CaptureSheet defaultName={values.name || defaultName} busy={busy} error={err} onAdopt={adopt} onCancel={() => { setSheet(null); setErr(null); }} />}
      {sheet === "consent" && <ConsentSheet acks={acks} initial={values.acks} busy={busy} error={err} confirmLabel="Sign" onConfirm={saveAcks} onCancel={() => { setSheet(null); setErr(null); }} />}
    </div>,
    document.body
  );
}
