"use client";

// One step's card in the SOP Builder. DOM contract for drag-reorder (makeSortable in sop-media.js):
// the root is a `.sopb-step` with `data-i={index}` and contains a `.sopb-h` handle.
import { useState } from "react";
import { Ic } from "./sop-icons";
import { isDividerTitle, SHOT_KINDS, SHOT_KIND_LABEL } from "../../../lib/sop-model";

const ACCEPT = "image/*,.heic,.heif,video/*";

export default function StepCard({ s, i, busy, mediaBusy, aimOpen, enhNote, setEnhNote, onAim, onAimClose,
  onEdit, onUseEnh, onEnhance, onMedia, onClearMedia, onDelete }) {
  const [more, setMore] = useState(false);
  const [tagText, setTagText] = useState(null);   // raw text while the tags field is being edited (keeps typed commas)
  const up = mediaBusy === s.id;
  const divider = isDividerTitle(s.title);   // import separator, not a real step: no media, no tags
  const locked = !!mediaBusy || busy;        // another upload, or an enhance, is running
  const isPhoto = !s.video && !!s.img;
  const hasMedia = !!(s.img || s.video);
  const shown = (s.useEnh && s.enh) ? s.enh : s.img;
  const pick = (e) => { const f = e.target.files?.[0]; e.target.value = ""; setMore(false); if (f && !locked) onMedia(s.id, f); };
  // A <label> around a hidden input (not a programmatic .click()) so it opens the picker on iPhone Safari.
  const fileCtl = (text) => (
    <label className="sopb-fl" aria-disabled={locked || undefined}>{text}<input type="file" accept={ACCEPT} onChange={pick} disabled={locked} /></label>
  );
  const trash = <button type="button" className="ic" aria-label="Delete step" title="Delete" onClick={onDelete}><Ic n="trash" s={18} /></button>;
  const goAim = () => { onEnhance(s, enhNote.trim(), !!s.enh); onAimClose(); };

  return (
    <div className="sopb-step" data-i={i}>
      <div className="sopb-hd"><span className="sopb-h" aria-label="Drag to reorder" title="Move"><Ic n="grip" s={18} /></span><span>Step {i + 1}</span></div>
      {s.video ? (
        <div className="sopb-ph">
          <video src={s.video} poster={s.img || undefined} controls playsInline preload="metadata" />
          <span className="tag">VIDEO</span>
          <span className="num">{i + 1}</span>
        </div>
      ) : s.img && (
        <div className="sopb-ph">
          <img src={shown} alt={`Step ${i + 1} photo`} />
          {s.useEnh && s.enh && <span className="tag">ENHANCED</span>}
          <span className="num">{i + 1}</span>
        </div>
      )}
      <div className="sopb-bd">
        <input value={s.title} placeholder="Step title" onChange={(e) => onEdit(s.id, "title", e.target.value)} />
        <textarea rows={2} value={s.instruction} placeholder="What to do" onChange={(e) => onEdit(s.id, "instruction", e.target.value)} />
        {!divider && <input className="sopb-tagin" value={tagText ?? (s.tags || []).join(", ")} placeholder="Tags" onBlur={() => setTagText(null)}
          onChange={(e) => { setTagText(e.target.value); onEdit(s.id, "tags", e.target.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)); }} />}
        <div className="sopb-acts">
          {up ? <span className="sopb-upl">Uploading…</span> : (<>
            {/* Enhance is photo-only — a video step shows no Enhance / Original-Enhanced controls. */}
            {isPhoto && (s.enh
              ? (<><button className={s.useEnh ? "" : "on"} onClick={() => onUseEnh(s.id, false)}>Original</button>
                  <button className={s.useEnh ? "on" : ""} onClick={() => onUseEnh(s.id, true)}>Enhanced</button>
                  <button onClick={onAim}>Redo</button></>)
              : (<><button disabled={busy} onClick={() => onEnhance(s, "", false)}>Enhance</button>
                  <button onClick={onAim}>Aim</button></>))}
            {divider ? trash : hasMedia
              ? <button type="button" className="ic" aria-label="More" title="More" onClick={() => setMore(!more)}><Ic n="more" s={18} /></button>
              : (<>{fileCtl("Photo")}{trash}</>)}
          </>)}
        </div>
        {hasMedia && !divider && more && !up && (
          <div className="sopb-acts">
            {fileCtl("Replace")}
            <button type="button" disabled={busy} onClick={() => { setMore(false); onClearMedia(s.id); }}>Remove</button>
            <button type="button" className="danger" onClick={onDelete}>Delete</button>
          </div>
        )}
        {isPhoto && aimOpen && (
          <div className="sopb-enhedit">
            <input value={s.target || ""} autoFocus placeholder="Target" onChange={(e) => onEdit(s.id, "target", e.target.value)} />
            <input value={s.where || ""} placeholder="Where" onChange={(e) => onEdit(s.id, "where", e.target.value)} />
            <input value={enhNote} placeholder="Tweak" onChange={(e) => setEnhNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) goAim(); }} />
            {/* What the photo is, which decides how hard Enhance works: Product cuts the item out onto a
                clean backdrop, Screen squares up and de-glares the display, Scene only tidies it in place.
                Auto reads the step's own words. */}
            <select className="kind" value={s.kind || ""} aria-label="Shot type"
                    onChange={(e) => onEdit(s.id, "kind", e.target.value)}>
              {SHOT_KINDS.map((k) => <option key={k || "auto"} value={k}>{SHOT_KIND_LABEL[k]}</option>)}
            </select>
            <button className="go" disabled={busy} onClick={goAim}>{s.enh ? "Redo" : "Enhance"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
