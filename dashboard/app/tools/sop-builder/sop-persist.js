"use client";

// Persistence for the SOP Builder — the two things that keep a guide from being lost:
//   useAutosave()  the debounced write of a guide that already has a row, flushed before the page goes
//   usePreDraft()  the photos + transcript that exist BEFORE Build, which have no row to be written to
// Kept out of the widget so the editor file stays about editing.
import { useRef, useEffect, useCallback } from "react";
import { saveSopDraftAction } from "./actions";
import { uid } from "./sop-media";

// ONE place that shapes a step for the wire. `kind` (the shot type the build model chose, which decides
// how Enhance treats the photo) used to be missing here, so it lived in the editor but was dropped from
// SQLite on the first keystroke and lost on reopen.
export const stepOut = (s) => ({ id: s.id, title: s.title, instruction: s.instruction, target: s.target, where: s.where,
  img: s.img, enh: s.enh, useEnh: s.useEnh, video: s.video, kind: s.kind || "", tags: s.tags });

const SAVE_MS = 600;

export function useAutosave({ sop, setSop, transcript, setSaveState, setPubDirty }) {
  const timer = useRef(null);
  const pending = useRef(null);   // the newest guide not yet written, for the flush below

  const saveNow = useCallback(async (cur) => {
    if (!cur) return null;
    pending.current = null;
    setSaveState("saving");
    const r = await saveSopDraftAction({ id: cur.id, title: cur.title, business: cur.business, category: cur.category,
      transcript: cur.transcript || transcript, steps: cur.steps.map(stepOut) }).catch(() => null);
    if (!r?.ok) { setSaveState(r?.error || "Not saved — check your connection."); return null; }
    setSaveState("saved");
    // A published guide keeps serving its frozen snapshot: edits are real, but not live until Publish.
    if (cur.status === "published") setPubDirty(true);
    if (cur.id !== r.id) setSop((p) => (p ? { ...p, id: r.id } : p));
    return r.id;
  }, [transcript, setSop, setSaveState, setPubDirty]);
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  const saveDraftSoon = useCallback((next) => {
    const cur = next || sop; if (!cur) return;
    pending.current = cur;
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; saveNowRef.current(cur); }, SAVE_MS);
  }, [sop, setSaveState]);

  // Drop a queued write without performing it — for Publish (which saves explicitly first) and for a
  // guide that was just archived, which must not be resurrected by a timer that was already running.
  const cancelPending = useCallback(() => { clearTimeout(timer.current); timer.current = null; pending.current = null; }, []);

  // The debounce would lose the last edit if the page went away inside that window. Unmount flushes it
  // (a client-side route change keeps this JS context alive long enough for the action to go out); a
  // real tab close can't be awaited, so the browser is asked to confirm instead.
  useEffect(() => {
    const warn = (e) => { if (pending.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearTimeout(timer.current);
      if (pending.current) saveNowRef.current(pending.current);
    };
  }, []);

  return { saveNow, saveDraftSoon, cancelPending };
}

export const PRE_KEY = "sopb_pre_v1";   // the un-built draft, per browser
const PRE_TTL = 24 * 60 * 60 * 1000;

// Before Build there is no guide row to autosave into, so a refresh or a stray back-tap used to throw
// away a whole shoot. Only UPLOADED photos are kept, by their /api/media URL — never the data: bytes,
// which would blow the storage quota on the first few iPhone photos — so what comes back is exactly
// what the server already holds. Returns clearPre(), called the moment a real guide exists.
export function usePreDraft({ sop, photos, setPhotos, transcript, setTranscript }) {
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const d = JSON.parse(localStorage.getItem(PRE_KEY) || "null");
      if (!d || Date.now() - (d.at || 0) > PRE_TTL) { localStorage.removeItem(PRE_KEY); return; }
      if (d.transcript) setTranscript(d.transcript);
      if (Array.isArray(d.photos) && d.photos.length) setPhotos(d.photos.map((p) => ({ ...p, id: uid(), dataUrl: "" })));
    } catch { /* private mode or cleared storage: nothing to restore */ }
  }, [setPhotos, setTranscript]);

  useEffect(() => {
    if (!loaded.current || sop) return;
    try {
      const keep = photos.filter((p) => p.url || p.video).map((p) => ({ url: p.url || "", video: p.video || null, isVideo: !!p.isVideo }));
      if (!keep.length && !transcript.trim()) localStorage.removeItem(PRE_KEY);
      else localStorage.setItem(PRE_KEY, JSON.stringify({ at: Date.now(), transcript, photos: keep }));
    } catch { /* quota or private mode: the draft just won't survive a reload */ }
  }, [photos, transcript, sop]);

  return useCallback(() => { try { localStorage.removeItem(PRE_KEY); } catch { /* nothing to clear */ } }, []);
}
