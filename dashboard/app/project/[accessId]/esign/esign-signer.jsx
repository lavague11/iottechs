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
// Flow: tap Sign (or Next) → agree to the terms → adopt name + signature → place each spot → Finish → sign.

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
  const [placed, setPlaced] = useState(() => new Set());   // signature-field keys the customer has placed (server-confirmed)
  const [completed, setCompleted] = useState(false);       // every signature saved + document approved
  const [toastMsg, setToastMsg] = useState(null);          // { kind, title, sub? } — auto-dismiss
  const completingRef = useRef(false);                     // guard against a double auto-complete
  const doneResultRef = useRef(null);                      // the completion result, handed to the parent on Close
  const toastTimer = useRef(null);
  const scrollRef = useRef(null);
  const prepRef = useRef(prepareAppendix);     // latest, without re-triggering the open effect
  prepRef.current = prepareAppendix;
  const placeTargetRef = useRef(null);         // which signature field a capture-sheet adoption lands on

  // While the full-screen signer is open, hide the floating bug-report FAB — it's docked bottom-right at a
  // near-max z-index and otherwise sits on top of the Finish button (the owner couldn't tap it).
  useEffect(() => { document.body.classList.add("esg-open"); return () => document.body.classList.remove("esg-open"); }, []);

  // Open (or resume) the session. First render the survey / mockup appendix (client-side, same images the
  // Download carries) so the signer shows — and the customer signs — the WHOLE document, not just pricing.
  useEffect(() => {
    let live = true;
    setDoc(null); setFatal(null);
    (async () => {
      // Render the appendix and hand it to the server (a route handler — a server action can't carry MBs
      // of images), which builds the unsigned doc WITH those pages. Strip each entry to {name,img} / dataURL
      // so no large nested arrays ride along. Best-effort: on any failure we open the numbers-only document.
      if (prepRef.current) {
        setPrepping(true);
        try {
          const a = await prepRef.current();
          const surveyImages = (a?.surveyImages || []).filter((f) => f?.img).map((f) => ({ name: f.name || "", img: f.img }));
          const mockupImages = (a?.mockupImages || []).filter((s) => typeof s === "string");
          if (surveyImages.length || mockupImages.length) {
            await fetch("/api/esign/prepare", { method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ accessId, optKey, appendix: { surveyImages, mockupImages } }) });
          }
        } catch { /* fall back to the numbers-only document */ }
        if (live) setPrepping(false);
      }
      if (!live) return;
      startSignAction(accessId, optKey, store.get(tokenKey(accessId, optKey))).then((r) => {
        if (!live) return;
        if (r?.error) { setFatal({ error: r.error, code: r.code }); return; }
        store.set(tokenKey(accessId, optKey), r.token);
        setSess({ token: r.token }); setDoc(r.doc); setValues(r.values); setAcks(r.acks);
        setPlaced(new Set(r.values?.placed || []));   // restore placements so a refresh keeps saved signatures green
        setCompleted(false); completingRef.current = false;
      }).catch(() => live && setFatal({ error: "Couldn't open the document.", code: "ERROR" }));
    })();
    return () => { live = false; };
  }, [accessId, optKey, epoch]);

  const fields = doc?.fields || [];
  const byPage = useMemo(() => fields.reduce((m, f, i) => { (m[f.page] ||= []).push({ ...f, i }); return m; }, {}), [fields]);
  const sigFields = useMemo(() => fields.map((f, i) => ({ ...f, i })).filter((f) => f.type === "signature"), [fields]);
  // Placements are restored from the session on open (above) and persisted per field below, so a refresh
  // keeps every saved signature green. "Sign each spot": adopt once, then tap EACH signature field.
  const allPlaced = sigFields.length > 0 && sigFields.every((f) => placed.has(f.key));
  const sigCount = sigFields.length;
  // Small auto-dismissing toast (fade/slide, 4s; reduced-motion handled in CSS). Only one completion toast.
  const toast = useCallback((kind) => {
    const m = kind === "done" ? { kind, title: "Document Completed", sub: "All signatures saved successfully." }
      : kind === "err" ? { kind, title: "Couldn’t save — try again." } : { kind: "save", title: "Signature saved" };
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  // Terms must be agreed BEFORE the signature is adopted (not at Finish). Agreed = every required ack saved.
  const requiredAckKeys = acks.filter((a) => a.required).map((a) => a.key);
  const termsAgreed = requiredAckKeys.every((k) => !!values.acks?.[k]);

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

  // Open the signature-adoption sheet, but gate the FIRST adoption behind the terms: no signature yet and
  // terms not agreed → show the consent sheet first; it saves the acks then opens the capture sheet.
  function openAdopt(key) { placeTargetRef.current = key; setErr(null); setSheet(termsAgreed ? "capture" : "consent"); }
  // The consent sheet is now the PRE-adopt gate: record the agreement, then adopt the signature.
  function agreeThenCapture(checks) { save({ acks: checks }, () => setSheet("capture")); }

  // Auto-complete: once every signature is placed + the terms agreed, the document signs itself — no
  // Finish step. Guarded so it fires exactly once; on success the viewer shows the completed state + toast.
  const autoComplete = useCallback(async (vals) => {
    if (completingRef.current || !sess?.token) return;
    completingRef.current = true;
    setBusy(true); setErr(null);
    const r = await completeSignAction(accessId, sess.token, vals?.acks).catch(() => ({ error: "Couldn't complete signing. Try again." }));
    setBusy(false);
    if (!handle(r)) { completingRef.current = false; toast("err"); return; }   // allow a retry
    store.set(tokenKey(accessId, optKey), null);
    setSheet(null); setCompleted(true); doneResultRef.current = r; toast("done");
  }, [accessId, optKey, sess, handle, toast]);

  // Persist a placement; the field turns green ONLY after the server confirms it. The last one completes.
  async function placeSaved(key) {
    if (!sess?.token || busy || placed.has(key)) return;
    const nextKeys = [...new Set([...placed, key])];
    setBusy(true); setErr(null);
    const r = await saveSignValuesAction(accessId, sess.token, { placed: nextKeys }).catch(() => ({ error: "Couldn't save your signature. Try again." }));
    setBusy(false);
    if (!handle(r)) { toast("err"); return; }   // field stays ungreen — tap it again to retry
    setValues(r.values);
    const confirmed = new Set(r.values?.placed || nextKeys);
    setPlaced(confirmed);
    const allNow = sigFields.length > 0 && sigFields.every((f) => confirmed.has(f.key));
    if (allNow) autoComplete(r.values);
    else { toast("save"); const nx = sigFields.find((f) => !confirmed.has(f.key)); if (nx) setActive(nx.i); }
  }

  // Adopt a signature: saves name + signature AND marks the target field placed in ONE round trip, so the
  // field goes green on Adopt with no Finish step. If that was the last signature, the document completes.
  const adopt = (name, signature) => {
    const key = placeTargetRef.current || sigFields[0]?.key;
    placeTargetRef.current = null;
    const nextKeys = key ? [...new Set([...placed, key])] : [...placed];
    save({ name, signature, placed: nextKeys }, (vals) => {
      setSheet(null);
      const confirmed = new Set(vals?.placed || nextKeys);
      setPlaced(confirmed);
      const allNow = sigFields.length > 0 && sigFields.every((f) => confirmed.has(f.key));
      if (allNow) autoComplete(vals);
      else { if (key) toast("save"); const nx = sigFields.find((f) => !confirmed.has(f.key)); if (nx) setActive(nx.i); }
    });
  };

  function scrollTo(i) { scrollRef.current?.querySelector(`[data-field="${fields[i]?.key}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }
  function next() {
    // Not done → go to the next empty signature spot: open the capture sheet to adopt a signature the
    // first time, or place the already-adopted signature there (a deliberate step per spot).
    if (!allPlaced) {
      const target = sigFields.find((f) => !placed.has(f.key));
      if (target) {
        setActive(target.i); scrollTo(target.i);
        if (!values.signature) openAdopt(target.key);   // agree to terms → adopt (gated)
        else placeSaved(target.key);                     // place + persist (green after the server confirms)
        return;
      }
      const ni = fields.findIndex((f) => f.type === "name" && !values.name);   // fallback: name wasn't auto-filled
      if (ni >= 0) { setActive(ni); scrollTo(ni); setSheet("capture"); return; }
    }
    // Every spot placed → cycle the active highlight through the non-date fields for review.
    const nd = fields.map((f, idx) => idx).filter((idx) => fields[idx].type !== "date");
    const pos = nd.indexOf(active); const i = nd.length ? nd[(pos + 1) % nd.length] : 0;
    setActive(i); scrollTo(i);
  }
  function tap(f) {
    if (f.type === "date") return;   // system-filled, not interactive
    setActive(f.i);
    if (f.type === "signature") {
      // No signature yet → agree to terms, then adopt (openAdopt gates the first time). Already adopted but
      // this spot empty → place it here (deliberate per-spot sign). Already placed → reopen to re-sign.
      if (!values.signature) openAdopt(f.key);
      else if (placed.has(f.key)) { placeTargetRef.current = f.key; setSheet("capture"); }
      else placeSaved(f.key);
      return;
    }
    setSheet("capture");   // name (only reachable when it wasn't auto-filled)
  }

  const overlay = (page) => (byPage[page] || []).map((f) => {
    // The date is system-generated (stamped at completion) and the name is auto-filled from the
    // proposal's PREPARED FOR value — neither is a field the customer acts on, so neither gets the
    // interactive highlight. Only an un-filled signature (or a missing name, the fallback) is live.
    const system = f.type === "date";
    const [label, icon] = TAG[f.type] || [f.type, null];
    const done = system ? true : f.type === "name" ? !!values.name : placed.has(f.key);
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

  // Progress tracks signature spots: "0 of 2 signatures completed" → … → "Signed ✓". The name auto-fills
  // from PREPARED FOR and the date is server-stamped — neither is a field the customer places.
  const filled = sigFields.filter((f) => placed.has(f.key)).length;
  const progressText = completed ? "Signed ✓"
    : sigCount ? `${filled} of ${sigCount} signature${sigCount === 1 ? "" : "s"} completed` : "";

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
        <span className="esg-count" data-testid="esign-progress">{progressText}</span>
        {!completed && <button type="button" className="esg-go esg-ghost" data-testid="esign-next" disabled={!fields.length || !!fatal || busy} onClick={next}>Next</button>}
        {/* Signing is automatic on Adopt — this button only dismisses the viewer; saved signatures persist. */}
        <button type="button" className="esg-go" data-testid="esign-close"
          onClick={() => { if (completed && doneResultRef.current) onDone?.(doneResultRef.current); else onClose?.(); }}>Close</button>
      </div>
      {toastMsg && (
        <div className={`esg-toast ${toastMsg.kind}`} role="status" aria-live="polite" data-testid="esign-toast">
          {toastMsg.kind === "done" && <span className="esg-toast-ic" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>}
          <span className="esg-toast-tx"><b>{toastMsg.title}</b>{toastMsg.sub && <small>{toastMsg.sub}</small>}</span>
        </div>
      )}
      {sheet === "capture" && <CaptureSheet defaultName={values.name || defaultName} busy={busy} error={err} onAdopt={adopt} onCancel={() => { setSheet(null); setErr(null); }} />}
      {/* Pre-adopt gate: agree to the terms the FIRST time Sign is tapped, before adopting a signature. */}
      {sheet === "consent" && <ConsentSheet acks={acks} initial={values.acks} busy={busy} error={err} confirmLabel="Agree & Continue" onConfirm={agreeThenCapture} onCancel={() => { setSheet(null); setErr(null); }} />}
    </div>,
    document.body
  );
}
