"use client";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { INK, SCRIPT_FONT, trimToPng, typedToPng, fileToPng } from "./sig-image";
import { Icon } from "./icons";

// "Adopt your signature": confirm the name, then draw / type / upload — all three end as one PNG. The
// canvas is large (min(46vh, 260px) tall, full sheet width) so a finger signature is comfortable.

const titleCase = (s) => String(s || "").replace(/(^|[\s'\-.])([a-z])/g, (_, p, c) => p + c.toUpperCase());

export default function CaptureSheet({ defaultName = "", onAdopt, onCancel, busy = false, error = null }) {
  const [name, setName] = useState(defaultName);
  const [tab, setTab] = useState("draw");
  const [ink, setInk] = useState(false);          // draw tab has strokes
  const [upload, setUpload] = useState(null);     // { png } from the upload tab
  const [localErr, setLocalErr] = useState(null);
  const canvasRef = useRef(null), padRef = useRef(null), fileRef = useRef(null);
  const clean = titleCase(name).replace(/\s+/g, " ").trim();

  useEffect(() => {
    if (tab !== "draw") return;
    const c = canvasRef.current;
    if (!c) return;
    const pad = new SignaturePad(c, { penColor: INK, minWidth: 1.2, maxWidth: 3.2, throttle: 8 });
    padRef.current = pad;
    const fit = () => {
      const keep = pad.toData();
      const r = Math.max(window.devicePixelRatio || 1, 1);
      c.width = c.offsetWidth * r; c.height = c.offsetHeight * r;
      c.getContext("2d").scale(r, r);
      pad.clear(); if (keep.length) pad.fromData(keep);
    };
    fit();
    const onEnd = () => setInk(!pad.isEmpty());
    pad.addEventListener("endStroke", onEnd);
    window.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); pad.off(); padRef.current = null; };
  }, [tab]);

  const clear = () => { padRef.current?.clear(); setInk(false); setUpload(null); setLocalErr(null); };
  async function pickFile(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try { setUpload({ png: await fileToPng(f) }); setLocalErr(null); } catch (x) { setUpload(null); setLocalErr(x.message); }
  }

  const ready = clean.length >= 2 && (tab === "draw" ? ink : tab === "type" ? true : !!upload);
  function adopt() {
    if (!ready || busy) return;
    let data = null;
    if (tab === "draw") data = trimToPng(canvasRef.current);
    else if (tab === "type") data = typedToPng(clean);
    else data = upload.png;
    if (!data) { setLocalErr("Add your signature first."); return; }
    onAdopt?.(clean, { method: tab, data });
  }

  return (
    <div className="esg-sheet-bg" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.(); }}>
      <div className="esg-sheet" role="dialog" aria-label="Adopt your signature" data-testid="esign-capture">
        <div className="esg-row">
          <div className="sp">
            <label className="esg-lbl" htmlFor="esg-name">Name</label>
            <input id="esg-name" className="esg-in" value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} onBlur={() => setName(clean)} />
          </div>
          <button type="button" className="esg-ico" aria-label="Close" title="Close" onClick={onCancel} disabled={busy}>{Icon.close}</button>
        </div>
        <div className="esg-tabs" role="tablist">
          {[["draw", "Draw"], ["type", "Type"], ["upload", "Upload"]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} data-testid={`esign-tab-${k}`} className={`esg-tab${tab === k ? " on" : ""}`} onClick={() => { setTab(k); setLocalErr(null); }}>{l}</button>
          ))}
        </div>
        {tab === "draw" && (
          <div className="esg-pad"><canvas ref={canvasRef} data-testid="esign-pad" aria-label="Signature pad" /><div className="base" /></div>
        )}
        {tab === "type" && (
          <div className="esg-typed" data-testid="esign-typed" style={{ fontFamily: SCRIPT_FONT, fontStyle: "italic" }}>{clean || <span style={{ fontFamily: "inherit", fontStyle: "normal", fontSize: ".85rem", color: "#9aa3b5" }}>Name</span>}</div>
        )}
        {tab === "upload" && (
          <div className="esg-typed" style={{ flexDirection: "column", gap: 10 }}>
            {upload ? <img alt="Signature" src={upload.png} style={{ maxWidth: "90%", maxHeight: "70%" }} /> : null}
            <input ref={fileRef} type="file" accept="image/*" hidden data-testid="esign-file" onChange={pickFile} />
            <button type="button" className="esg-ghost" onClick={() => fileRef.current?.click()}>{upload ? "Replace" : "Choose image"}</button>
          </div>
        )}
        {(localErr || error) && <div className="esg-err" role="alert">{localErr || error}</div>}
        <div className="esg-row">
          <button type="button" className="esg-ghost" onClick={clear} disabled={busy} aria-label="Clear" title="Clear">Clear</button>
          <span className="sp" />
          <button type="button" className="esg-go" data-testid="esign-adopt" disabled={!ready || busy} onClick={adopt}>{busy ? "Saving…" : "Adopt"}</button>
        </div>
      </div>
    </div>
  );
}
