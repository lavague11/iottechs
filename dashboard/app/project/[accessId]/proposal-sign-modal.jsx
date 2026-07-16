"use client";
import { useState, useEffect, useMemo } from "react";

// Shared IOT TECHS signature tool (ported from IOT-Techs_Signature-Tool.html): a DocuSign-style
// typed-signature flow used everywhere a signature is captured — the customer accepting a
// proposal option AND the technician accepting a work order. The signer types their full name,
// it renders in a cursive script, they check the agreement box, then "Approve & Sign" rasterizes
// the typed name to a PNG data URL (via canvas) that is stored and imported into the PDF.
const DEFAULT_AGREE = "I have reviewed and agree to the document referenced above, and I authorize it to proceed.";

function titleCase(s) {
  return String(s || "").replace(/(^|[\s'\-.])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}
// Rasterize a typed name into a cursive-script PNG, mirroring the reference tool's typedToImg.
function typedToImg(name) {
  const c = document.createElement("canvas");
  c.width = 760; c.height = 150;
  const x = c.getContext("2d");
  x.fillStyle = "#10204a"; x.textBaseline = "middle"; x.textAlign = "left";
  const font = (s) => `italic ${s}px "Brush Script MT","Snell Roundhand","Segoe Script","Lucida Handwriting",cursive`;
  let size = 72; x.font = font(size);
  while (x.measureText(name).width > 720 && size > 26) { size -= 4; x.font = font(size); }
  x.fillText(name, 14, 84);
  return c.toDataURL("image/png");
}

export default function ProposalSignModal({
  open, heading, subheading, reference, defaultName, showTitle = false,
  agreeText = DEFAULT_AGREE, accent = "var(--gold)", busy, onConfirm, onCancel,
}) {
  const [name, setName] = useState(defaultName || "");
  const [jobTitle, setJobTitle] = useState("");
  const [agree, setAgree] = useState(false);

  useEffect(() => { if (open) { setName((n) => n || defaultName || ""); setAgree(false); } }, [open, defaultName]);

  const clean = titleCase(name).trim();
  const canSign = clean.length >= 2 && agree && !busy;
  const previewFont = useMemo(() => `'Brush Script MT','Snell Roundhand','Segoe Script','Lucida Handwriting',cursive`, []);

  function confirm() {
    if (!canSign) return;
    onConfirm?.({ name: clean, title: titleCase(jobTitle).trim(), data: typedToImg(clean) });
  }

  if (!open) return null;
  return (
    <div className="psm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}>
      <style>{PSM_CSS}</style>
      <div className="psm-card" role="dialog" aria-modal="true" style={{ "--accent": accent }}>
        <div className="psm-ribbon"><span className="psm-tag">SIGN</span>{heading || "Review & approve"}</div>
        <div className="psm-body">
          {subheading && <div className="psm-sub">{subheading}{reference ? ` · ${reference}` : ""}</div>}

          <div className="psm-row">
            <div className="psm-field">
              <label>Full Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName(clean)} placeholder="Your full name" autoComplete="name" />
            </div>
            {showTitle && (
              <div className="psm-field">
                <label>Title (optional)</label>
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Technician, Lead…" />
              </div>
            )}
          </div>

          <div className="psm-preview">
            {clean ? <span style={{ fontFamily: previewFont }}>{clean}</span> : <span className="psm-ph">Your typed signature appears here</span>}
          </div>

          <label className="psm-agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{agreeText}</span>
          </label>

          <div className="psm-actions">
            <button type="button" className="psm-btn go" disabled={!canSign} onClick={confirm}>{busy ? "Signing…" : "Approve & Sign"}</button>
            <button type="button" className="psm-clear" onClick={() => { setName(""); setAgree(false); }}>Clear</button>
            <button type="button" className="psm-btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          </div>
          <div className="psm-fine">By signing electronically, you agree your electronic signature is the legal equivalent of your handwritten signature.</div>
        </div>
      </div>
    </div>
  );
}

const PSM_CSS = `
.psm-overlay{position:fixed;inset:0;z-index:12000;background:rgba(11,15,26,.55);backdrop-filter:blur(3px);
  display:flex;align-items:center;justify-content:center;padding:20px;animation:psmFade .16s ease}
@keyframes psmFade{from{opacity:0}to{opacity:1}}
.psm-card{width:min(480px,96vw);background:#fff;border:1px solid #e3ddd1;border-radius:12px;
  box-shadow:0 24px 70px rgba(11,15,26,.4);overflow:hidden;
  font-family:var(--font);animation:psmPop .18s ease}
@keyframes psmPop{from{transform:translateY(8px) scale(.98);opacity:0}to{transform:none;opacity:1}}
.psm-ribbon{display:flex;align-items:center;gap:10px;background:#FFD55A;color:#3a2f00;padding:12px 18px;font-weight:800;font-size:.86rem}
.psm-tag{background:#3a2f00;color:#FFD55A;font-size:.62rem;padding:3px 9px;border-radius:20px;letter-spacing:.06em}
.psm-body{padding:20px}
.psm-sub{font-size:.8rem;font-weight:700;color:#8a6d2f;margin-bottom:14px}
.psm-row{display:flex;gap:14px;flex-wrap:wrap}
.psm-field{flex:1 1 200px;min-width:170px}
.psm-field label{display:block;font-size:.62rem;letter-spacing:.05em;color:#8a8378;font-weight:800;margin-bottom:5px;text-transform:uppercase}
.psm-field input{width:100%;border:1px solid #d8d2c6;border-radius:8px;padding:11px 12px;font-size:.9rem;color:var(--ink);background:#fff;font-family:inherit;outline:none}
.psm-field input:focus{border-color:var(--accent)}
.psm-preview{height:100px;border:1px solid #eee5d4;border-radius:10px;background:#FBFAF6;display:flex;align-items:center;justify-content:center;margin-top:14px;overflow:hidden}
.psm-preview span{font-size:3rem;color:#10204a;line-height:1;padding:0 16px;white-space:nowrap}
.psm-preview .psm-ph{font-family:inherit;font-size:.82rem;color:#b3aa99;font-style:italic}
.psm-agree{display:flex;align-items:flex-start;gap:9px;margin:16px 0 6px;font-size:.78rem;color:#3a3f4a;line-height:1.55;cursor:pointer}
.psm-agree input{width:17px;height:17px;margin-top:1px;accent-color:var(--ink);flex:0 0 auto}
.psm-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}
.psm-btn{border:none;border-radius:9px;font-size:.86rem;font-weight:800;cursor:pointer;font-family:inherit;padding:13px 22px}
.psm-btn.go{background:var(--accent);color:var(--ink)}
.psm-btn.go:hover{filter:brightness(1.05)}
.psm-btn.go:disabled{background:#e4ddcd;color:#a59c89;cursor:not-allowed}
.psm-btn.ghost{background:#fff;border:1px solid var(--line-warm);color:var(--ink);padding:12px 18px}
.psm-btn.ghost:hover{border-color:#8a6d2f;color:#8a6d2f}
.psm-btn.ghost:disabled{opacity:.5;cursor:default}
.psm-clear{background:none;border:none;color:#8a8378;font-weight:700;font-size:.76rem;cursor:pointer;text-decoration:underline;font-family:inherit}
.psm-fine{font-size:.66rem;color:#9a9384;margin-top:12px;line-height:1.5}
`;
