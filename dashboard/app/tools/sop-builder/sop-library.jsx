"use client";

// "My SOPs" — the guides this person may open, and the ones they removed. Delete here ARCHIVES: the
// guide and every published snapshot are kept, it just leaves /guides, its public URL and the step
// library. Two taps to fire it, Restore (or the Undo toast) to put it back.
import { Ic } from "./sop-icons";

export default function SopLibrary({ list, archived, ask, onTab, onOpen, onAsk, onArchive, onRestore }) {
  return (
    <div>
      <div className="sopb-tabs sopb-subtabs">
        <button className={!archived ? "on" : ""} onClick={() => onTab(false)}>Guides</button>
        <button className={archived ? "on" : ""} onClick={() => onTab(true)}>Removed</button>
      </div>
      {list === null ? <div className="sopb-empty">Loading…</div>
        : list.length === 0 ? <div className="sopb-empty">{archived ? "Nothing removed." : <>No SOPs yet.<br />Build one and tap Publish or save a draft.</>}</div>
        : list.map((s) => (
          <div key={s.id} className="sopb-librow">
            <button className="sopb-lib" onClick={() => (archived ? onRestore(s) : onOpen(s.id))}>
              {/* A guide with no photo yet gets an empty tile, not <img src=""> — an empty src makes the
                  browser re-request the whole page (and React warns about it on every render). */}
              {s.thumb ? <img src={s.thumb} alt="" /> : <span className="sopb-libph" aria-hidden="true"><Ic n="image" s={22} /></span>}
              <span>
                <div className="t">{s.title}</div>
                <div className="m">{s.steps} steps · {s.status}{s.status === "published" ? ` · ${s.visibility}` : ""}
                  {s.dirty && <b className="dirty"> · Unpublished changes</b>}</div>
              </span>
            </button>
            {archived ? (
              <button className="sopb-ib wide" onClick={() => onRestore(s)}>Restore</button>
            ) : ask === s.id ? (
              <>
                <button className="sopb-ib" aria-label="Keep it" title="Keep it" onClick={() => onAsk("")}><Ic n="x" s={18} /></button>
                <button className="sopb-ib danger" onClick={() => onArchive(s)}>Delete</button>
              </>
            ) : (
              <button className="sopb-ib" aria-label={`Delete ${s.title}`} title="Delete" onClick={() => onAsk(s.id)}><Ic n="trash" s={18} /></button>
            )}
          </div>
        ))}
    </div>
  );
}
