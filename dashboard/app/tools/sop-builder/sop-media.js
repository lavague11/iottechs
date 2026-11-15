export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- image helpers (client-side resize, same as prototype) ---------- */
export const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
export const readURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
export function scaled(src, w, h, max = 1600, q = 0.86) {
  const s = Math.min(1, max / Math.max(w, h)), c = document.createElement("canvas");
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  const d = c.toDataURL("image/jpeg", q); c.width = c.height = 0; return d;
}
export async function photoFrom(f) {
  try { const b = await createImageBitmap(f); const d = scaled(b, b.width, b.height); b.close && b.close(); if (d.length > 100) return d; } catch {}
  try { const i = await loadImg(await readURL(f)); return scaled(i, i.naturalWidth, i.naturalHeight); } catch { return null; }
}
// Grab ONE representative still from a video (a poster), used for display + as the frame the AI orders by.
// The video itself is uploaded separately and played in the step; it is never AI-enhanced.
export function videoPoster(f) {
  return new Promise((res) => {
    const u = URL.createObjectURL(f), v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto"; v.src = u;
    let done = false;
    const fin = (d) => { if (done) return; done = true; URL.revokeObjectURL(u); res(d || null); };
    setTimeout(() => fin(null), 30000); v.onerror = () => fin(null);
    v.onloadedmetadata = async () => {
      const dur = v.duration; const t = isFinite(dur) && dur > 0 ? Math.min(dur * 0.1, 1) : 0;
      try { await v.play(); v.pause(); } catch {}
      const grab = () => { try { fin(scaled(v, v.videoWidth, v.videoHeight)); } catch { fin(null); } };
      const h = () => { v.removeEventListener("seeked", h); grab(); };
      v.addEventListener("seeked", h);
      try { v.currentTime = t; } catch { grab(); }
      setTimeout(grab, 4000);
    };
  });
}
// Upload a data-URL (photo) to /api/media (staff-gated); returns the /api/media/:id URL, or null.
export async function uploadMedia(dataUrl) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const fd = new FormData(); fd.append("file", blob, "photo.jpg");
    const r = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" });
    const j = await r.json().catch(() => ({}));
    return j?.ok && j.url ? j.url : null;
  } catch { return null; }
}
// Upload a raw File to /api/media; returns the /api/media/:id URL, or null. Used for videos AND for photos
// the browser can't decode client-side (iPhone HEIC on desktop Chrome): /api/media converts HEIC→JPEG
// server-side and serves it back at the returned URL.
export async function uploadFileRaw(file, fallbackName = "file") {
  try {
    const fd = new FormData(); fd.append("file", file, file.name || fallbackName);
    const r = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" });
    const j = await r.json().catch(() => ({}));
    return j?.ok && j.url ? j.url : null;
  } catch { return null; }
}
export const move = (arr, a, b) => { const [x] = arr.splice(a, 1); arr.splice(b, 0, x); };

/* ---------- drag-to-reorder (long-press a tile, or grab the handle) — ported from the prototype ---------- */
export function makeSortable(container, itemSel, handleSel, onMove, delay) {
  let s = null;
  const down = (x, y, target, touch) => {
    if (target.closest("button:not(.h),input,textarea")) return false;
    const h = target.closest(handleSel); if (!h || !container.contains(h)) return false;
    const item = h.closest(itemSel); if (!item) return false;
    s = { item, x, y, from: +item.dataset.i, to: +item.dataset.i, active: false, ghost: null, r: item.getBoundingClientRect(), lazy: !touch };
    if (touch) { if (delay) s.timer = setTimeout(activate, delay); else activate(); }
    return true;
  };
  const activate = () => {
    if (!s || s.active) return; s.active = true;
    const g = s.item.cloneNode(true); g.className = "ghost";
    Object.assign(g.style, { left: s.r.left + "px", top: s.r.top + "px", width: s.r.width + "px", height: Math.min(s.r.height, 220) + "px" });
    document.body.appendChild(g); s.ghost = g; s.item.classList.add("drag");
    try { navigator.vibrate && navigator.vibrate(12); } catch {}
  };
  const moveTo = (x, y) => {
    if (!s) return false; const dx = x - s.x, dy = y - s.y;
    if (!s.active) { if (Math.hypot(dx, dy) > 8) { if (s.lazy) activate(); else { clearTimeout(s.timer); s = null; return false; } } else return false; }
    s.ghost.style.transform = `translate(${dx}px,${dy}px)`; s.ghost.style.visibility = "hidden";
    const el = document.elementFromPoint(x, y); s.ghost.style.visibility = "";
    const over = el && el.closest(itemSel); if (over && container.contains(over)) s.to = +over.dataset.i;
    if (y < 90) window.scrollBy(0, -14); else if (y > innerHeight - 90) window.scrollBy(0, 14);
    return true;
  };
  const end = () => { if (!s) return; clearTimeout(s.timer); const { active, from, to, ghost, item } = s; s = null; ghost && ghost.remove(); item.classList.remove("drag"); if (active && to !== from) onMove(from, to); };
  const ts = (e) => { if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY, e.target, true); };
  const tm = (e) => { if (moveTo(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault(); };
  const cm = (e) => { if (s) e.preventDefault(); };
  const md = (e) => {
    if (!down(e.clientX, e.clientY, e.target, false)) return; e.preventDefault();
    const mm = (ev) => moveTo(ev.clientX, ev.clientY), mu = () => { document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); end(); };
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
  };
  container.addEventListener("touchstart", ts, { passive: true });
  container.addEventListener("touchmove", tm, { passive: false });
  container.addEventListener("touchend", end); container.addEventListener("touchcancel", end);
  container.addEventListener("contextmenu", cm); container.addEventListener("mousedown", md);
  return () => {
    container.removeEventListener("touchstart", ts); container.removeEventListener("touchmove", tm);
    container.removeEventListener("touchend", end); container.removeEventListener("touchcancel", end);
    container.removeEventListener("contextmenu", cm); container.removeEventListener("mousedown", md);
  };
}
