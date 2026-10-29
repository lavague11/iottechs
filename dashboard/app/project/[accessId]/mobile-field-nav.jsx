"use client";
import { useEffect } from "react";

// iPhone keyboard ergonomics for the proposal workspace. Two behaviors, mobile only:
//  1) On focus, keep the field visible ABOVE the on-screen keyboard. iOS doesn't do this reliably inside
//     the deck's transformed / overflow-scroll containers, so lower-half fields end up hidden. We center
//     the field in the visible (visualViewport) area once the keyboard has animated in.
//  2) Enter → next field, scoped to the repetitive LINE-ITEM entry fields (name → price → next row …) so
//     naming/pricing on a phone flows without reaching for each box. Scoped on purpose: special inputs
//     (service rename, camera-count, config) keep their own Enter behavior; onBlur still commits the field
//     we leave, so nothing is lost.
export default function MobileFieldNav() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const coarse = window.matchMedia?.("(pointer:coarse)")?.matches || window.innerWidth <= 820;
    if (!coarse) return;

    const FIELD = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=hidden]), textarea, [contenteditable='true']";
    const isField = (el) => !!el?.matches?.(FIELD);
    const LINE = ".prop-item, .prop-sub2, .prop-name-ac";   // the line-item entry rows (incl. grouped children)

    // (1) Keep the focused field above the keyboard.
    let t = null;
    const onFocusIn = (e) => {
      if (!isField(e.target)) return;
      const el = e.target;
      clearTimeout(t);
      t = setTimeout(() => {
        try {
          const vv = window.visualViewport;
          const visH = vv ? vv.height : window.innerHeight;
          const r = el.getBoundingClientRect();
          // Centre it when it's near the top (hidden under the sticky header) or in the lower half (keyboard zone).
          if (r.top < 64 || r.bottom > visH * 0.5) el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch { try { el.scrollIntoView({ block: "center" }); } catch { /* ignore */ } }
      }, 300);
    };

    // (2) Enter → next line-item field. Capture phase so it beats a field's own blur-on-Enter handler.
    const onKeyDown = (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const el = e.target;
      if (!isField(el) || el.tagName === "TEXTAREA" || !el.closest?.(LINE)) return;
      const fields = [...document.querySelectorAll(FIELD)].filter((f) => f.closest(LINE) && !f.disabled && f.offsetParent !== null);
      const i = fields.indexOf(el);
      if (i === -1) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const next = fields[i + 1];
      if (next) { next.focus({ preventScroll: true }); try { next.select?.(); } catch { /* number inputs can't select */ } }
      else el.blur();   // last field → commit + dismiss the keyboard
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown, true);
    return () => { clearTimeout(t); document.removeEventListener("focusin", onFocusIn); document.removeEventListener("keydown", onKeyDown, true); };
  }, []);
  return null;
}
