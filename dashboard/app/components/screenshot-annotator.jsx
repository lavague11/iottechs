"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { Tool, ColorControl, CropI, CheckI, RectI, ArrowI, PenI, TextI, UndoI, RedoI, TrashI, CloseI, MoreI } from "./screenshot-annotator-ui";
import { CSS } from "./screenshot-annotator-css";
import { drawShape, flattenPage } from "./screenshot-draw";
import { initialBox, hitHandle, dragBox, roundBox, isFullBox, cropShapes, fitSize, pagesToAttach, drawCropOverlay, newHistory, pushStep, stepBack, stepFwd, persistPage, toolForKey } from "./screenshot-crop";

// Screenshot markup tool. Dark workspace, one sharp unfiltered image, one compact SVG toolbar.
// Tools: Crop · Box (default) · Arrow · Pen · Text. Color palette + stroke width. Undo/redo/clear history.
// Keyboard: C/R/A/P/T tools (Crop: Enter applies, Esc cancels), Ctrl/Cmd+Z undo, +Shift redo, Esc cancels crop (else closes), Delete/Backspace undoes.
// The image layer is never filtered — the surrounding chrome is dark, the screenshot stays crisp.
// Attach flattens image + annotations to a PNG at natural resolution and hands it back.
//
// Shapes (all in the image's NATURAL pixel coords):
//   {type:'rect',  x,y,w,h}          {type:'arrow', from:{x,y}, to:{x,y}}
//   {type:'pen',   points:[{x,y}]}   {type:'text',  x,y, text, size}
// Each carries {color, lw}. History is snapshots of the full shape array + the base image (every commit,
// including a crop, is one step; H.bases runs parallel to H.stack so a crop is undoable).

const clampZ = (z) => Math.max(1, Math.min(6, z));
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export default function ScreenshotAnnotator({ pages, start = 0, shot, onDone, onCancel, initialShapes }) {
  // Multi-page: the annotator can hold every captured screenshot and flip between them. Normalize both the
  // new `pages` API and the legacy single-`shot` call into one working list {key, base(unannotated), shapes}.
  const pagesRef = useRef(
    (Array.isArray(pages) && pages.length
      ? pages.map((p) => ({ key: p.key ?? null, base: p.base ?? p.shot, shapes: (p.shapes || []).slice() }))
      : [{ key: null, base: shot, shapes: (initialShapes || []).slice() }])
  );
  const dirtyRef = useRef(new Set());     // page indices whose annotations changed → re-flatten on Attach
  const [idx, setIdx] = useState(Math.max(0, Math.min(start, pagesRef.current.length - 1)));
  const idxRef = useRef(idx); idxRef.current = idx;
  const pageCount = pagesRef.current.length;
  const origBasesRef = useRef(pagesRef.current.map((p) => p.base));   // to detect a crop-only change on Attach
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const textRef = useRef(null);           // the (always-mounted) text-entry field
  const editingIdxRef = useRef(-1);       // index of the text shape being re-edited (-1 = new)
  const drawing = useRef(false);
  const draftRef = useRef(null);          // in-progress shape during a drag (not yet committed)
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState("rect");
  const [color, setColor] = useState("#ff2d2d");
  const [strokeMul, setStrokeMul] = useState(1);
  const [showColor, setShowColor] = useState(false);
  const [showMore, setShowMore] = useState(false);   // mobile dock ••• menu (Redo / Clear)
  const [editor, setEditor] = useState(null);   // { clientX, clientY, nx, ny, value, scale }
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false, strike: false, sizeMul: 1 });
  const [H, setH] = useState(() => newHistory(pagesRef.current[idx]?.shapes, pagesRef.current[idx]?.base));
  const shapes = H.stack[H.i];
  const curBase = H.bases[H.i];
  // Crop tool: `crop` is the live box (natural px) while the tool is active; fit = zoom-to-fit once cropped.
  const [crop, setCrop] = useState(null);
  const cropRef = useRef(crop); cropRef.current = crop;
  const cropDrag = useRef(null);          // { mode, box0, p0 } during a handle/body drag
  const [imgDims, setImgDims] = useState(null);   // natural size of the CURRENT base (set on load, never stale)
  const [stageBox, setStageBox] = useState(null);   // usable stage area {w,h}, for zoom-to-fit
  const stageRef = useRef(null);
  const cropped = curBase !== origBasesRef.current[idx];

  const toolRef = useRef(tool); toolRef.current = tool;
  const colorRef = useRef(color); colorRef.current = color;
  const mulRef = useRef(strokeMul); mulRef.current = strokeMul;
  const fmtRef = useRef(fmt); fmtRef.current = fmt;
  const toggleFmt = (k) => setFmt((f) => ({ ...f, [k]: !f[k] }));
  const stepSize = (d) => setFmt((f) => ({ ...f, sizeMul: Math.max(0.6, Math.min(2.6, +(f.sizeMul + d * 0.2).toFixed(2))) }));
  // Zoom/pan: a CSS transform on the canvas. pt() reads getBoundingClientRect, which already reflects
  // the transform, so annotation coordinates stay correct at any zoom. Two-finger pinch/drag on touch,
  // wheel + on-screen ± controls on desktop.
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view); viewRef.current = view;
  editingIdxRef.current = editor?.replaceIndex ?? -1;   // hide the shape being re-edited from the canvas
  const pointers = useRef(new Map());   // active pointerId -> {x,y}
  const pinch = useRef(null);           // { dist, mid, z, x, y } during a two-finger gesture
  const panning = useRef(null);         // { x, y, vx, vy } during a one-finger pan (tool deselected)
  const zoomBy = (f) => setView((v) => { const z = clampZ(v.z * f); return z <= 1 ? { z: 1, x: 0, y: 0 } : { ...v, z }; });
  // Tapping the active tool deselects it → "pan mode": one finger pans, nothing draws (so you can
  // zoom/pan the screenshot freely). Tap any tool again to resume drawing.
  const selectTool = (k) => setTool((cur) => (cur === k ? null : k));

  const commit = useCallback((next, base) => { dirtyRef.current.add(idxRef.current); setH((h) => pushStep(h, next, base)); }, []);
  const undo = useCallback(() => setH(stepBack), []);
  const redo = useCallback(() => setH(stepFwd), []);
  const clear = useCallback(() => { if (shapes.length) commit([]); }, [shapes.length, commit]);

  // ---- base stroke width in natural px, derived from image width ----
  const baseLw = () => { const c = canvasRef.current; return Math.max(3, Math.round((c ? c.width : 1200) / 380)); };
  const natFont = () => { const c = canvasRef.current; return Math.max(20, Math.round((c ? c.width : 1200) / 34)); };

  // Usable stage area (minus padding) -> zoom-to-fit target for a cropped page.
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      setStageBox({ w: r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h: r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) });
    };
    measure(); window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [pageCount]);
  const fit = cropped && ready && stageBox && imgDims ? fitSize(imgDims.w, imgDims.h, stageBox.w, stageBox.h) : null;

  // Leaving the Crop tool discards the pending box; entering it (once the image is up) starts a fresh one.
  useEffect(() => {
    if (tool !== "crop" || !ready) { setCrop(null); cropDrag.current = null; return; }
    const c = canvasRef.current; if (c) setCrop(initialBox(c.width, c.height));
  }, [tool, ready, curBase]);

  // Apply: cut the base image to the box, move the annotations with it, push ONE history step (undoable).
  // The pending crop as data (null when there is none or it covers the whole image).
  function pendingCrop() {
    const c = canvasRef.current, img = imgRef.current, box0 = cropRef.current;
    if (toolRef.current !== "crop" || !c || !img || !box0 || isFullBox(box0, c.width, c.height)) return null;
    const box = roundBox(box0, c.width, c.height);
    const cv = document.createElement("canvas"); cv.width = box.w; cv.height = box.h;
    cv.getContext("2d").drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return { base: cv.toDataURL("image/png"), shapes: cropShapes(shapes, box) };
  }
  function applyCrop() {
    const r = pendingCrop();
    if (r) { setReady(false); setEditor(null); setView({ z: 1, x: 0, y: 0 }); commit(r.shapes, r.base); }
    setCrop(null); setTool("rect");
  }

  const applyCropRef = useRef(applyCrop); applyCropRef.current = applyCrop;   // key handler must see fresh shapes

  useEffect(() => {
    setReady(false);   // undo/redo/crop swap the base: nothing may read the old image until the new one is loaded
    const img = new Image();
    img.onload = () => {
      imgRef.current = img; const c = canvasRef.current; if (!c) return;
      c.width = img.naturalWidth; c.height = img.naturalHeight; setImgDims({ w: img.naturalWidth, h: img.naturalHeight }); setReady(true); redraw();
    };
    img.src = curBase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curBase]);

  // Flip to another captured screenshot: persist the current page's shapes, reset view/history for the next.
  const goTo = useCallback((i) => {
    const n = pagesRef.current.length;
    const t = ((i % n) + n) % n;                       // wrap around
    if (t === idxRef.current) return;
    persistPage(pagesRef.current, idxRef.current, H);   // save edits + any crop
    setEditor(null); setShowColor(false); setShowMore(false);
    setView({ z: 1, x: 0, y: 0 });
    setReady(false);
    setIdx(t);
    setH(newHistory(pagesRef.current[t].shapes, pagesRef.current[t].base));
  }, [H]);
  const prevPage = useCallback(() => goTo(idxRef.current - 1), [goTo]);
  const nextPage = useCallback(() => goTo(idxRef.current + 1), [goTo]);

  // redraw whenever committed shapes change, or when entering/leaving text edit (to hide/show it)
  useEffect(() => { redraw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [H, editor, crop]);

  function redraw(extra) {
    const c = canvasRef.current, img = imgRef.current; if (!c || !img) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
    for (let k = 0; k < shapes.length; k++) { if (k === editingIdxRef.current) continue; drawShape(ctx, shapes[k]); }
    if (extra) drawShape(ctx, extra);
    const cb = cropRef.current;
    if (cb && toolRef.current === "crop") drawCropOverlay(ctx, cb, c.width, c.height, c.width / (c.getBoundingClientRect().width || c.width));
  }
  function pt(e) {
    const c = canvasRef.current, r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }

  function down(e) {
    if (editor) return;                    // let the text editor keep focus
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Second finger → pan/zoom gesture: abandon any in-progress draw and start the pinch.
    if (pointers.current.size === 2) {
      drawing.current = false; draftRef.current = null; cropDrag.current = null; redraw();
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: dist2(a, b), mid: mid2(a, b), z: viewRef.current.z, x: viewRef.current.x, y: viewRef.current.y };
      return;
    }
    if (pointers.current.size > 2) return;
    const t = toolRef.current;
    // No tool selected → pan mode: one finger drags the (zoomed) screenshot, nothing draws.
    if (!t) { panning.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y }; try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* noop */ } return; }
    if (t === "crop") {
      e.preventDefault(); const c = canvasRef.current, p = pt(e), k = c.width / (c.getBoundingClientRect().width || c.width);
      const mode = (cropRef.current && hitHandle(cropRef.current, p, 14 * k)) || "new";
      cropDrag.current = { mode, box0: cropRef.current, p0: p };
      try { c.setPointerCapture(e.pointerId); } catch { /* noop */ }
      return;
    }
    const p = pt(e), lw = baseLw() * mulRef.current, col = colorRef.current;
    // preventDefault so the browser's default mousedown doesn't steal focus back from the text field.
    // Tapping ON an existing text re-opens it for editing; tapping empty space starts a new one.
    if (t === "text") { e.preventDefault(); const hit = hitText(p); if (hit >= 0) editTextShape(hit); else openEditor(e, p); return; }
    e.preventDefault(); drawing.current = true;
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* noop */ }
    if (t === "rect") draftRef.current = { type: "rect", x: p.x, y: p.y, w: 0, h: 0, color: col, lw };
    else if (t === "arrow") draftRef.current = { type: "arrow", from: p, to: p, color: col, lw };
    else draftRef.current = { type: "pen", points: [p], color: col, lw };
    redraw(draftRef.current);
  }
  function move(e) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      e.preventDefault();
      const [a, b] = [...pointers.current.values()];
      const d = dist2(a, b), m = mid2(a, b);
      const z = clampZ(pinch.current.z * (d / (pinch.current.dist || 1)));
      const nx = pinch.current.x + (m.x - pinch.current.mid.x);
      const ny = pinch.current.y + (m.y - pinch.current.mid.y);
      setView(z <= 1 ? { z: 1, x: 0, y: 0 } : { z, x: nx, y: ny });
      return;
    }
    if (panning.current) {
      e.preventDefault();
      if (viewRef.current.z > 1) setView((v) => ({ ...v, x: panning.current.vx + (e.clientX - panning.current.x), y: panning.current.vy + (e.clientY - panning.current.y) }));
      return;
    }
    if (cropDrag.current) {
      e.preventDefault(); const c = canvasRef.current, g = cropDrag.current;
      setCrop(dragBox(g.mode, g.box0 || { x: g.p0.x, y: g.p0.y, w: 0, h: 0 }, g.p0, pt(e), c.width, c.height));
      return;
    }
    if (!drawing.current) return; e.preventDefault(); const p = pt(e), d = draftRef.current;
    if (d.type === "rect") { d.w = p.x - d.x; d.h = p.y - d.y; }
    else if (d.type === "arrow") d.to = p;
    else d.points.push(p);
    redraw(d);
  }
  function up(e) {
    if (e) pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (panning.current) { panning.current = null; return; }
    if (cropDrag.current) { cropDrag.current = null; return; }
    if (!drawing.current) return; drawing.current = false; const d = draftRef.current; draftRef.current = null;
    if (!d) return;
    const tiny = (d.type === "rect" && Math.abs(d.w) < 5 && Math.abs(d.h) < 5) ||
      (d.type === "arrow" && Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) < 5);
    if (tiny) { redraw(); return; }
    commit([...shapes, d]);
  }
  function onWheel(e) {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
    zoomBy(e.deltaY < 0 ? 1.15 : 0.87);
  }
  // Backdrop gestures (only when the gesture starts on the dark margin, never on the canvas — so it can't
  // fight drawing): a horizontal swipe flips screenshots; a plain tap dismisses the annotator.
  const stageSwipe = useRef(null);
  function stageDown(e) { if (e.target.classList.contains("mk-stage")) stageSwipe.current = { x: e.clientX, y: e.clientY }; }
  function stageUp(e) {
    const s = stageSwipe.current; stageSwipe.current = null;
    if (!s || editor) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (pageCount > 1 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) { if (dx < 0) nextPage(); else prevPage(); return; }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) onCancel?.();   // a real tap on the backdrop → close
  }

  // ---- text editor (inline over the image) ----
  function openEditor(e, p) {
    const c = canvasRef.current, r = c.getBoundingClientRect();
    const scale = r.width / c.width;   // natural→display; textarea font = natFont * sizeMul * scale (live)
    // On mobile the software keyboard covers the lower half — keep the typing box above it (the text
    // still lands where you tapped; only the input box floats up so you can see what you type).
    let clientY = e.clientY;
    if (typeof window !== "undefined" && window.matchMedia("(max-width:640px)").matches) {
      const vh = window.visualViewport?.height || window.innerHeight;
      clientY = Math.min(clientY, Math.round(vh * 0.42));
    }
    setEditor({ clientX: e.clientX, clientY, nx: p.x, ny: p.y, value: "", scale });
    // iOS only opens the keyboard when focus() runs INSIDE the tap gesture. The field is always
    // mounted, so focus it now (synchronously) — repositioning happens on the next render.
    const el = textRef.current;
    if (el) { el.value = ""; try { el.focus({ preventScroll: true }); } catch { el.focus(); } }
  }
  // Which committed text shape (if any) is under point p (natural coords) — topmost first.
  function hitText(p) {
    const c = canvasRef.current; if (!c) return -1;
    const ctx = c.getContext("2d");
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i]; if (s.type !== "text") continue;
      ctx.font = `${s.italic ? "italic " : ""}${s.bold ? "700" : "600"} ${s.size}px system-ui,-apple-system,Segoe UI,sans-serif`;
      const lines = s.text.split("\n"); let w = 0; lines.forEach((ln) => { w = Math.max(w, ctx.measureText(ln).width); });
      const h = lines.length * s.size * 1.22, pad = s.size * 0.35;
      if (p.x >= s.x - pad && p.x <= s.x + w + pad && p.y >= s.y - pad && p.y <= s.y + h + pad) return i;
    }
    return -1;
  }
  // Re-open an existing text shape for editing (tap it with the Text tool).
  function editTextShape(i) {
    const s = shapes[i], c = canvasRef.current, r = c.getBoundingClientRect(), scale = r.width / c.width;
    let clientY = r.top + s.y * scale;
    if (typeof window !== "undefined" && window.matchMedia("(max-width:640px)").matches) {
      const vh = window.visualViewport?.height || window.innerHeight;
      clientY = Math.min(clientY, Math.round(vh * 0.42));
    }
    setColor(s.color);
    setFmt({ bold: !!s.bold, italic: !!s.italic, underline: !!s.underline, strike: !!s.strike, sizeMul: +(s.size / natFont()).toFixed(2) || 1 });
    setEditor({ clientX: r.left + s.x * scale, clientY, nx: s.x, ny: s.y, value: s.text, scale, replaceIndex: i });
    const el = textRef.current;
    if (el) { el.value = s.text; try { el.focus({ preventScroll: true }); } catch { el.focus(); } }
  }
  function commitEditor() {
    if (!editor) return; const v = editor.value.trim(); const f = fmtRef.current;
    const idx = editor.replaceIndex;
    if (idx != null && idx >= 0) {
      // editing an existing text — update it, or delete it if cleared
      const next = shapes.slice();
      if (!v) next.splice(idx, 1);
      else next[idx] = { ...next[idx], text: editor.value, size: Math.round(natFont() * f.sizeMul), color: colorRef.current, bold: f.bold, italic: f.italic, underline: f.underline, strike: f.strike };
      commit(next);
    } else if (v) {
      commit([...shapes, { type: "text", x: editor.nx, y: editor.ny, text: editor.value, size: Math.round(natFont() * f.sizeMul), color: colorRef.current, lw: 0, bold: f.bold, italic: f.italic, underline: f.underline, strike: f.strike }]);
    }
    setEditor(null);
  }

  // ---- keyboard ----
  useEffect(() => {
    function onKey(e) {
      if (editor) { if (e.key === "Escape") { e.preventDefault(); setEditor(null); } return; }
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (toolRef.current === "crop" && cropRef.current) {
        if (e.key === "Enter") { e.preventDefault(); applyCropRef.current(); return; }
        if (e.key === "Escape") { e.preventDefault(); setTool("rect"); return; }
      }
      const meta = e.ctrlKey || e.metaKey;
      if (meta && (e.key === "z" || e.key === "Z")) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (meta && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
      if (e.key === "Escape") { e.preventDefault(); if (drawing.current) { drawing.current = false; draftRef.current = null; redraw(); } else onCancel?.(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && shapes.length) { e.preventDefault(); undo(); return; }
      if (pageCount > 1 && e.key === "ArrowLeft") { e.preventDefault(); prevPage(); return; }
      if (pageCount > 1 && e.key === "ArrowRight") { e.preventDefault(); nextPage(); return; }
      const tl = toolForKey(e); if (tl) setTool(tl);   // Ctrl/Cmd+C etc. stay the browser's
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, shapes.length, undo, redo, onCancel, pageCount, prevPage, nextPage]);

  async function attach() {
    if (!ready) return;
    draftRef.current = null; redraw();
    // A crop box still on screen is applied, not silently dropped.
    const pend = pendingCrop();
    persistPage(pagesRef.current, idxRef.current, H, pend);   // persist the visible page, including a crop
    // Return every NEW page (must be added) and every EDITED existing page; untouched ones are left as-is.
    const results = [];
    for (const i of pagesToAttach(pagesRef.current, origBasesRef.current, dirtyRef.current)) {
      const pg = pagesRef.current[i];
      const dataUrl = await flattenPage(pg.base, pg.shapes);
      results.push({ key: pg.key, dataUrl, base: pg.base, shapes: pg.shapes });
    }
    onDone?.(results);
  }

  const canUndo = H.i > 0, canRedo = H.i < H.stack.length - 1;
  const closeMenus = () => { if (showColor) setShowColor(false); if (showMore) setShowMore(false); };

  const colorControl = (up) => (
    <ColorControl color={color} setColor={setColor} strokeMul={strokeMul} setStrokeMul={setStrokeMul}
      show={showColor} setShow={setShowColor} up={up} />
  );

  return (
    <div className={`mk-scrim${editor ? " mk-editing" : ""}${pageCount > 1 ? " mk-multi" : ""}`} onPointerDown={closeMenus}>
      {/* TOP BAR — desktop: full toolbar. mobile: just X (left) + Attach (right). */}
      <div className="mk-bar" onPointerDown={(e) => e.stopPropagation()}>
        <button className="mk-x mk-mobile" onClick={onCancel} aria-label="Close" title="Close"><CloseI /></button>
        <div className="mk-desk">
          <div className="mk-seg" role="toolbar" aria-label="Tools">
            <Tool on={tool === "crop"} onClick={() => selectTool("crop")} tip="Crop · C"><CropI /></Tool>
            <Tool on={tool === "rect"} onClick={() => selectTool("rect")} tip="Box · R"><RectI /></Tool>
            <Tool on={tool === "arrow"} onClick={() => selectTool("arrow")} tip="Arrow · A"><ArrowI /></Tool>
            <Tool on={tool === "pen"} onClick={() => selectTool("pen")} tip="Pen · P"><PenI /></Tool>
            <Tool on={tool === "text"} onClick={() => selectTool("text")} tip="Text · T"><TextI /></Tool>
          </div>
          <div className="mk-sep" />
          {colorControl(false)}
          <div className="mk-sep" />
          <div className="mk-seg">
            <Tool onClick={undo} disabled={!canUndo} tip="Undo"><UndoI /></Tool>
            <Tool onClick={redo} disabled={!canRedo} tip="Redo"><RedoI /></Tool>
            <Tool onClick={clear} disabled={!shapes.length} tip="Clear"><TrashI /></Tool>
          </div>
        </div>
        <div className="mk-spacer" />
        <button className="mk-btn ghost mk-desktop" onClick={onCancel}>Cancel</button>
        <button className="mk-btn go" onClick={attach} disabled={!ready}>Attach</button>
      </div>

      <div className="mk-stage" ref={stageRef} onPointerDown={stageDown} onPointerUp={stageUp} onWheel={onWheel}>
        <canvas ref={canvasRef} className={`mk-canvas mk-t-${tool || "pan"}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: "center center", ...(fit ? { width: fit.w, height: fit.h, maxWidth: "none", maxHeight: "none" } : null) }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />

        {/* Multi-screenshot navigation — arrows on the sides, a page pill at the bottom, plus backdrop swipe. */}
        {pageCount > 1 && (
          <>
            <button className="mk-pnav prev" onClick={prevPage} aria-label="Previous screenshot" title="Previous" onPointerDown={(e) => e.stopPropagation()}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button className="mk-pnav next" onClick={nextPage} aria-label="Next screenshot" title="Next" onPointerDown={(e) => e.stopPropagation()}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <div className="mk-pageind" onPointerDown={(e) => e.stopPropagation()}>
              {pagesRef.current.map((_, i) => <span key={i} className={`mk-pagedot${i === idx ? " on" : ""}`} />)}
              <span className="mk-pagenum">{idx + 1} / {pageCount}</span>
            </div>
          </>
        )}
        <div className="mk-zoom" onPointerDown={(e) => e.stopPropagation()}>
          <button className="mk-ztool" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.25)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="6" x2="12" y2="18" /><line x1="6" y1="12" x2="18" y2="12" /></svg>
          </button>
          <button className="mk-ztool" aria-label="Zoom out" title="Zoom out" disabled={view.z <= 1} onClick={() => zoomBy(0.8)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="12" x2="18" y2="12" /></svg>
          </button>
          {view.z > 1 && <button className="mk-ztool mk-zreset" aria-label="Reset zoom" title="Reset" onClick={() => setView({ z: 1, x: 0, y: 0 })}>{Math.round(view.z * 10) / 10}×</button>}
        </div>
        {/* Always mounted so it can be focused synchronously on tap (iOS keyboard); parked off-screen
            when not editing. */}
        <textarea ref={textRef} className={`mk-text-in${editor ? "" : " mk-text-idle"}`}
          style={editor ? {
            left: editor.clientX, top: editor.clientY, color,
            fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif",
            fontSize: `${Math.round(natFont() * fmt.sizeMul * editor.scale)}px`,
            fontWeight: fmt.bold ? 700 : 600, fontStyle: fmt.italic ? "italic" : "normal",
            textDecoration: `${fmt.underline ? "underline" : ""} ${fmt.strike ? "line-through" : ""}`.trim() || "none",
          } : undefined}
          value={editor ? editor.value : ""}
          onChange={(e) => setEditor((s) => (s ? { ...s, value: e.target.value } : s))}
          onBlur={commitEditor}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEditor(); } else if (e.key === "Escape") { e.preventDefault(); setEditor(null); } }}
          placeholder="" aria-label="Text" />
      </div>

      {/* Crop confirm: check applies (Enter), X cancels (Esc). */}
      {tool === "crop" && crop && (
        <div className="mk-fmt" onPointerDown={(e) => e.stopPropagation()}>
          <button className="mk-fb" onClick={applyCrop} aria-label="Apply" title="Apply · Enter"><CheckI /></button>
          <button className="mk-fb" onClick={() => setTool("rect")} aria-label="Cancel" title="Cancel · Esc"><CloseI /></button>
        </div>
      )}

      {/* Text format bar — visible whenever the Text tool is active (size + B/I/U/S). */}
      {tool === "text" && (
        <div className="mk-fmt" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
          <button className={`mk-fb${fmt.bold ? " on" : ""}`} onClick={() => toggleFmt("bold")} aria-label="Bold" title="Bold" style={{ fontWeight: 800 }}>B</button>
          <button className={`mk-fb${fmt.italic ? " on" : ""}`} onClick={() => toggleFmt("italic")} aria-label="Italic" title="Italic" style={{ fontStyle: "italic", fontFamily: "Georgia,serif" }}>I</button>
          <button className={`mk-fb${fmt.underline ? " on" : ""}`} onClick={() => toggleFmt("underline")} aria-label="Underline" title="Underline" style={{ textDecoration: "underline" }}>U</button>
          <button className={`mk-fb${fmt.strike ? " on" : ""}`} onClick={() => toggleFmt("strike")} aria-label="Strikethrough" title="Strikethrough" style={{ textDecoration: "line-through" }}>S</button>
          <span className="mk-fsep" />
          <button className="mk-fb" onClick={() => stepSize(-1)} disabled={fmt.sizeMul <= 0.6} aria-label="Smaller" title="Smaller">A−</button>
          <button className="mk-fb" onClick={() => stepSize(1)} disabled={fmt.sizeMul >= 2.6} aria-label="Larger" title="Larger">A+</button>
        </div>
      )}

      {/* MOBILE DOCK — drawing tools float over the bottom, within thumb reach. */}
      <div className="mk-dock mk-mobile" onPointerDown={(e) => e.stopPropagation()}>
        <Tool on={tool === "crop"} onClick={() => selectTool("crop")} tip="Crop"><CropI /></Tool>
        <Tool on={tool === "rect"} onClick={() => selectTool("rect")} tip="Box"><RectI /></Tool>
        <Tool on={tool === "arrow"} onClick={() => selectTool("arrow")} tip="Arrow"><ArrowI /></Tool>
        <Tool on={tool === "pen"} onClick={() => selectTool("pen")} tip="Pen"><PenI /></Tool>
        <Tool on={tool === "text"} onClick={() => selectTool("text")} tip="Text"><TextI /></Tool>
        {colorControl(true)}
        <Tool onClick={undo} disabled={!canUndo} tip="Undo"><UndoI /></Tool>
        <div className="mk-morewrap">
          <Tool on={showMore} onClick={() => setShowMore((v) => !v)} tip="More"><MoreI /></Tool>
          {showMore && (
            <div className="mk-pop up mk-moremenu" onPointerDown={(e) => e.stopPropagation()}>
              <button disabled={!canRedo} onClick={() => { redo(); setShowMore(false); }}><RedoI /> Redo</button>
              <button disabled={!shapes.length} onClick={() => { clear(); setShowMore(false); }}><TrashI /> Clear</button>
            </div>
          )}
        </div>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

