"use client";

import { useRef, useState } from "react";
import { parseAamva } from "../../lib/aamva";

// Driver's-licence scanner. Take a photo of the BACK of the licence; we decode the PDF417
// barcode and fill the form from it.
//
// Privacy by design: the photo is decoded ENTIRELY IN THE BROWSER and then discarded — the
// licence image is never uploaded and never stored. Only the fields it fills (name, DOB,
// address, licence number/state/expiry) get saved, exactly as if they'd been typed. That's why
// this reads the barcode instead of accepting an ID photo upload.
export default function DlScanner({ onScan }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);   // { kind: "ok"|"err", text }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";                  // let them retry the same file
    if (!file) return;
    setBusy(true); setMsg(null);

    let url = null;
    try {
      const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import("@zxing/library");
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      url = URL.createObjectURL(file);
      const reader = new BrowserMultiFormatReader(hints);
      const result = await reader.decodeFromImageUrl(url);
      const fields = parseAamva(result?.getText?.() || "");

      if (!fields) {
        setMsg({ kind: "err", text: "That barcode isn't a licence — make sure you're photographing the BACK." });
      } else {
        const filled = Object.entries(fields).filter(([, v]) => v).length;
        onScan(fields);
        setMsg({ kind: "ok", text: `Scanned — ${filled} field${filled === 1 ? "" : "s"} filled in. Check them and fix anything that looks off.` });
      }
    } catch (_) {
      setMsg({ kind: "err", text: "Couldn't read the barcode. Try again in better light, holding the camera steady and filling the frame with the barcode." });
    } finally {
      if (url) URL.revokeObjectURL(url);   // the image is gone the moment we're done with it
      setBusy(false);
    }
  }

  return (
    <div className="dls">
      <button type="button" className="dls-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M13 9h5M13 13h5M5 16h8" />
        </svg>
        {busy ? "Reading…" : "Scan my licence"}
      </button>
      <span className="dls-hint">Photograph the <b>back</b> — we read the barcode and fill the form. The picture never leaves your phone.</span>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} hidden />
      {msg && <div className={`dls-msg ${msg.kind}`}>{msg.text}</div>}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.dls{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:4px}
.dls-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border:1.5px solid #C9A96E;border-radius:11px;
  background:#fdfaf2;color:#b08f4f;font-weight:800;font-size:.88rem;cursor:pointer;font-family:inherit}
.dls-btn:hover:not(:disabled){background:#C9A96E;color:#fff}
.dls-btn:disabled{opacity:.6;cursor:default}
.dls-hint{font-size:.78rem;color:#5b6275;flex:1;min-width:200px}
.dls-msg{width:100%;border-radius:10px;padding:9px 13px;font-size:.83rem;font-weight:600}
.dls-msg.ok{background:#e7f6ec;border:1px solid #b9e3c8;color:#14652f}
.dls-msg.err{background:#fdecec;border:1px solid #f2c4c4;color:#93312f}
`;
