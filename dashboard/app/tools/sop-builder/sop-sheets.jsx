"use client";

// Full-screen player + bottom sheets (publish / import / step library) for the SOP Builder.
import { useState, useRef, useEffect } from "react";
import { Ic } from "./sop-icons";

const outside = (close) => (e) => { if (e.target.classList.contains("sopb-sheet")) close(); };

/* ---------- full-screen player (shared shape with /support/[slug]) ---------- */
export function Player({ sop, onClose }) {
  const [i, setI] = useState(0);
  const n = sop.steps.length;
  const sx = useRef(0);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "ArrowRight") setI((v) => Math.min(n - 1, v + 1)); if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1)); if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey); const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [n, onClose]);
  const st = sop.steps[i]; const img = (st.useEnh && st.enh) ? st.enh : st.img;
  return (
    <div className="sopb-play" role="dialog"
      onTouchStart={(e) => { sx.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const d = e.changedTouches[0].clientX - sx.current; if (d < -60 && i < n - 1) setI(i + 1); else if (d > 60 && i > 0) setI(i - 1); }}>
      <div className="ph"><button className="sopb-ib" aria-label="Close" title="Close" onClick={onClose}><Ic n="x" s={18} /></button><div><b>{sop.title}</b><span>Step {i + 1} of {n}</span></div></div>
      <div className="bars">{sop.steps.map((_, k) => <i className={k <= i ? "on" : ""} key={k} />)}</div>
      <div className="mid">{st.video ? <video src={st.video} poster={st.img || undefined} controls playsInline /> : (img && <img src={img} alt="" />)}<h2>{st.title}</h2><p>{st.instruction}</p></div>
      <div className="nav">
        <button disabled={!i} onClick={() => setI(Math.max(0, i - 1))}>Back</button>
        <button className="nx" onClick={() => { if (i < n - 1) setI(i + 1); else onClose(); }}>{i === n - 1 ? "Done" : "Next"}</button>
      </div>
    </div>
  );
}

export function PublishSheet({ onClose, onPublish }) {
  return (
    <div className="sopb-sheet" onClick={outside(onClose)}>
      <div className="in">
        <b style={{ fontSize: 18 }}>Publish</b>
        <div className="sopb-hint">Internal = staff only (login required). Public = anyone with the link.</div>
        <div className="sopb-row" style={{ marginTop: 14 }}>
          <button className="sopb-btn" onClick={() => onPublish("internal")}>Internal</button>
          <button className="sopb-btn w" onClick={() => onPublish("public")}>Public</button>
        </div>
      </div>
    </div>
  );
}

export function ImportSheet({ list, onClose, onPick }) {
  return (
    <div className="sopb-sheet" onClick={outside(onClose)}>
      <div className="in">
        <b style={{ fontSize: 18 }}>Import a guide</b>
        <div className="sopb-hint">Its steps are copied in as a continuation — reorder or edit them after.</div>
        <div className="sopb-implist">
          {list === null ? <div className="sopb-empty">Loading…</div>
            : list.length === 0 ? <div className="sopb-empty">No other guides to import yet.</div>
            : list.map((s) => (
              <button key={s.id} type="button" className="sopb-lib" onClick={() => onPick(s.id, s.title)}>
                {/* No photo yet → an empty tile, not <img src="">, which makes the browser re-request the page. */}
                {s.thumb ? <img src={s.thumb} alt="" /> : <span className="sopb-libph" aria-hidden="true"><Ic n="image" s={22} /></span>}
                <span><div className="t">{s.title}</div><div className="m">{s.steps} step{s.steps === 1 ? "" : "s"}{s.category ? ` · ${s.category}` : ""}</div></span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

// Step library — search any step across all guides and add it. Auto-tag shows only while untagged steps exist.
export function LibrarySheet({ query, onQuery, steps, untagged, tagging, onTag, onAdd, onClose }) {
  return (
    <div className="sopb-sheet" onClick={outside(onClose)}>
      <div className="in sopb-libsheet">
        <div className="sopb-libhead">
          <b style={{ fontSize: 18 }}>Step library</b>
          <div className="sopb-libtools">
            {untagged > 0 && <button type="button" className="sopb-tagbtn" disabled={tagging} onClick={onTag}>{tagging ? "Tagging…" : <>Auto-tag <b>{untagged}</b></>}</button>}
            <button type="button" className="sopb-ib" aria-label="Close" title="Close" onClick={onClose}><Ic n="x" s={18} /></button>
          </div>
        </div>
        <input className="sopb-libsearch" value={query} autoFocus placeholder="Search"
          onChange={(e) => onQuery(e.target.value)} />
        <div className="sopb-libgrid">
          {steps === null ? <div className="sopb-empty">Searching…</div>
            : steps.length === 0 ? <div className="sopb-empty">{query ? "No steps match." : "No steps yet."}</div>
            : steps.map((st, k) => (
              <div className="sopb-libcard" key={k}>
                <div className="sopb-libthumb">
                  {st.video ? <video src={st.video} poster={st.thumb || undefined} muted playsInline preload="metadata" /> : (st.thumb ? <img src={st.thumb} alt="" /> : <span className="sopb-libph"><Ic n="image" s={22} /></span>)}
                </div>
                <div className="sopb-libmeta">
                  <div className="t">{st.title}</div>
                  <div className="m">{st.guideTitle}</div>
                  {st.tags?.length > 0 && <div className="sopb-libtags">{st.tags.slice(0, 5).map((tg, j) => <span key={j} className="sopb-tag" onClick={() => onQuery(tg)}>{tg}</span>)}</div>}
                </div>
                <button type="button" className="sopb-btn go sopb-libadd" onClick={() => onAdd(st)}>Add</button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
