"use client";

import { useState, useRef } from "react";
import { DOC_READERS, promptFor } from "../../lib/doc-readers";
import { saveDocumentAction } from "./actions";

const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
}

// A schema-driven reader for full-page documents (registration / insurance / business licence).
// Photo → /api/read-licence (Claude vision) → editable fields → save to the document library.
export default function DocReader({ docType, accessId = "", onSaved }) {
  const schema = DOC_READERS[docType];
  const blank = Object.fromEntries(schema.fields.map((f) => [f.k, ""]));
  const [shot, setShot] = useState(null);            // { data, mediaType }
  const [fields, setFields] = useState(blank);
  const [status, setStatus] = useState("idle");      // idle | reading | done | error
  const [uncertain, setUncertain] = useState([]);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const hasData = status === "done";

  function reset() {
    setShot(null); setFields(blank); setStatus("idle"); setUncertain([]); setErr(""); setSaved(null);
  }

  async function pick(e) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!OK_TYPES.includes(file.type)) { setErr("Use a JPG, PNG or WEBP photo."); return; }
    const dataUrl = await readFile(file);
    const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
    if (!m) { setErr("Could not read that photo."); return; }
    setShot({ data: m[2], mediaType: m[1], preview: dataUrl });
    read(m[2], m[1]);
  }

  async function read(data, mediaType) {
    setStatus("reading"); setErr(""); setFields(blank); setUncertain([]); setSaved(null);
    const content = [
      { type: "text", text: promptFor(docType) },
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
    ];
    const keys = schema.fields.map((f) => f.k);
    const finish = (text) => {
      let parsed = {};
      try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { parsed = {}; }
      const clean = { ...blank };
      keys.forEach((k) => { if (parsed[k] != null) clean[k] = String(parsed[k]).trim(); });
      if (keys.every((k) => !clean[k])) { setStatus("error"); setErr("Nothing readable. Try a flatter, well-lit photo."); return; }
      setUncertain(Array.isArray(parsed._uncertain) ? parsed._uncertain.filter((k) => keys.includes(k)) : []);
      setFields(clean); setStatus("done");
    };
    const drain = (acc, seen) => {
      const re = /"([A-Za-z_]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g; let m;
      while ((m = re.exec(acc))) {
        const k = m[1]; if (seen.has(k) || !keys.includes(k)) continue; seen.add(k);
        let v = ""; try { v = JSON.parse(`"${m[2]}"`); } catch { v = m[2]; }
        setFields((f) => ({ ...f, [k]: v.trim() }));
      }
    };
    try {
      const res = await fetch("/api/read-licence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1000, stream: true, messages: [{ role: "user", content }] }),
      });
      if (res.status === 503 || res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setStatus("error"); setErr(j.error || "The reader isn't configured yet."); return;
      }
      if (!res.body || !res.ok) throw new Error("no stream");
      const reader = res.body.getReader(); const dec = new TextDecoder();
      let buf = "", acc = ""; const seen = new Set();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try { const ev = JSON.parse(payload); if (ev.type === "content_block_delta" && ev.delta?.text) { acc += ev.delta.text; drain(acc, seen); } } catch {}
        }
      }
      finish(acc);
    } catch {
      try {
        const res = await fetch("/api/read-licence", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1000, messages: [{ role: "user", content }] }),
        });
        const data2 = await res.json();
        finish((data2.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
      } catch { setStatus("error"); setErr("The read failed. Check the photo and try again."); }
    }
  }

  function set(k, v) { setFields((f) => ({ ...f, [k]: v })); setUncertain((u) => u.filter((x) => x !== k)); }

  const filled = schema.fields.filter((f) => fields[f.k]).length;
  const score = Math.round((filled / schema.fields.length) * 100) - uncertain.length * 4;

  async function save() {
    setSaving(true);
    const r = await saveDocumentAction({ docType, fields, score: Math.max(0, score), accessId });
    setSaving(false);
    if (r?.error) { setErr(r.error); return; }
    setSaved(r.id);
  }

  return (
    <div className="dr">
      <style>{DR_CSS}</style>
      <div className="dr-head">
        <span className="dr-t">{schema.label}</span>
        {hasData && <span className={`dr-score ${score >= 80 ? "ok" : score >= 50 ? "mid" : "low"}`}>{Math.max(0, score)}%</span>}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pick} hidden />
      {!shot ? (
        <button type="button" className="dr-drop" onClick={() => fileRef.current?.click()}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>Photograph or upload the {schema.noun}</span>
        </button>
      ) : (
        <div className="dr-shot">
          <img src={shot.preview} alt="" />
          <div className="dr-shot-r">
            <span className="dr-status">{status === "reading" ? "Reading…" : status === "done" ? "Read — verify fields" : status === "error" ? "Failed" : ""}</span>
            <button type="button" className="dr-mini" onClick={() => fileRef.current?.click()}>Retake</button>
            <button type="button" className="dr-mini" onClick={reset}>Clear</button>
          </div>
        </div>
      )}

      {err && <div className="dr-err">{err}</div>}

      {(status === "reading" || hasData) && (
        <div className="dr-grid">
          {schema.fields.map((f) => (
            <label key={f.k} className={`dr-fld${f.w === 2 ? " w2" : ""}${uncertain.includes(f.k) ? " unsure" : ""}`}>
              <span className="dr-l">{f.l}{uncertain.includes(f.k) ? " ?" : ""}</span>
              <input className={f.mono ? "mono" : ""} value={fields[f.k]} placeholder={f.ph || ""} onChange={(e) => set(f.k, e.target.value)} />
            </label>
          ))}
        </div>
      )}

      {hasData && (
        <div className="dr-actions">
          {saved ? (
            <span className="dr-saved"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved to library #{saved}</span>
          ) : (
            <button type="button" className="dr-save" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save to library"}</button>
          )}
        </div>
      )}
    </div>
  );
}

const DR_CSS = `
.dr{border:1px solid var(--line,#e6e8ee);border-radius:12px;background:#fff;padding:16px}
.dr-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.dr-t{font-weight:700;font-size:1rem}
.dr-score{font-size:.72rem;font-weight:800;padding:2px 9px;border-radius:100px}
.dr-score.ok{background:rgba(28,138,69,.1);color:#1c8a45}.dr-score.mid{background:rgba(224,154,58,.14);color:#8a5f00}.dr-score.low{background:rgba(231,76,60,.1);color:#c0392b}
.dr-drop{width:100%;display:flex;flex-direction:column;align-items:center;gap:8px;padding:26px;border:1.5px dashed var(--line,#d9d4ca);border-radius:12px;background:var(--soft,#faf8f4);color:var(--muted,#5b6275);font-size:.9rem;font-weight:600;cursor:pointer;font-family:inherit}
.dr-drop:hover{border-color:#C9A96E;background:#fffdf8;color:#0B0F1A}
.dr-shot{display:flex;gap:12px;align-items:center}
.dr-shot img{width:120px;height:76px;object-fit:cover;border-radius:8px;border:1px solid var(--line,#e6e8ee)}
.dr-shot-r{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.dr-status{font-size:.82rem;color:var(--muted,#5b6275);font-weight:600}
.dr-mini{border:1px solid var(--line,#d9d4ca);background:#fff;border-radius:8px;padding:4px 10px;font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit;color:#5b6275}
.dr-mini:hover{border-color:#C9A96E;color:#0B0F1A}
.dr-err{margin-top:10px;font-size:.82rem;color:#c0392b;background:rgba(231,76,60,.07);border-radius:8px;padding:8px 11px}
.dr-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.dr-fld{display:flex;flex-direction:column;gap:3px;min-width:0}
.dr-fld.w2{grid-column:1/-1}
.dr-l{font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a8578}
.dr-fld input{border:1px solid var(--line,#d9d4ca);border-radius:8px;background:var(--soft,#faf8f4);padding:8px 10px;font-size:.88rem;font-family:inherit;color:#0B0F1A;outline:none}
.dr-fld input:focus{border-color:#C9A96E;background:#fff}
.dr-fld input.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.dr-fld.unsure input{border-color:#e0a93a;background:#fef8ec}
.dr-actions{margin-top:14px}
.dr-save{height:40px;padding:0 18px;border:none;border-radius:9px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-weight:800;font-size:.88rem;cursor:pointer;font-family:inherit}
.dr-save:disabled{opacity:.55;cursor:default}
.dr-saved{display:inline-flex;align-items:center;gap:6px;font-size:.86rem;font-weight:800;color:#1d7a3a}
@media(max-width:560px){.dr-grid{grid-template-columns:1fr}}
`;
