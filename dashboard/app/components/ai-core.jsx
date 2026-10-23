"use client";
import { useEffect, useRef } from "react";

// The tiny animated "AI Core" — the champagne-gold equalizer from the AI Core concept, adapted to live at
// ~30–48px as the assistant's persistent presence (bottom-left). PURELY presentational: the parent passes the
// REAL conversation `state` and live mic `levels`. It never fabricates "detected speech" — the listening bars
// come straight from the microphone meter; "speaking" is a gentle self-driven shimmer of the assistant's OWN
// voice (clearly its output, not a claim about hearing you); "thinking" is a flowing pulse; idle just breathes.
// The rAF loop runs only while there's motion to show and halts entirely under prefers-reduced-motion.
export default function AICore({ state = "idle", levels = null, active = false, size = 40 }) {
  const cvRef = useRef(null);
  const rafRef = useRef(0);
  const sRef = useRef({ lvl: new Array(7).fill(0), amp: 0, rail: 0, t0: 0, flash: 0 });
  const stateRef = useRef(state);
  const levelsRef = useRef(levels);
  const activeRef = useRef(active);
  stateRef.current = state; levelsRef.current = levels; activeRef.current = active;

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = 7, S = sRef.current; S.t0 = performance.now();
    const dpr = Math.min((typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1, 2);
    const resize = () => { const w = cv.clientWidth || size; cv.width = w * dpr; cv.height = w * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null; ro?.observe(cv);
    let prev = S.t0, running = false, flashPrev = "idle";

    const draw = (now) => {
      const W = cv.clientWidth || size, st = stateRef.current, lv = levelsRef.current;
      const t = (now - S.t0) / 1000, dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (st !== flashPrev) { if (st === "listening" || st === "speaking") S.flash = 1; flashPrev = st; }
      S.flash = Math.max(0, S.flash - dt * 2.2);
      // amplitude for the speaking shimmer
      if (st === "speaking") S.amp += (Math.random() * 0.9 + 0.1 - S.amp) * 0.35; else S.amp *= 0.9;

      // ink backdrop + soft vignette
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);
      const r = Math.min(W, 999);
      ctx.fillStyle = "#0B0F1A";
      roundRect(ctx, 0, 0, W, W, W * 0.28); ctx.fill();

      const padX = W * 0.2, mid = W * 0.5, maxH = W * 0.24, bw = (W - padX * 2) / (N - 1);
      ctx.lineCap = "round"; ctx.globalCompositeOperation = "lighter";

      // center rail with a travelling cream pulse (slows while idle)
      const drive = st === "speaking" ? S.amp : st === "listening" ? 0.5 : st === "thinking" ? 0.4 : 0;
      S.rail = (S.rail + (0.0015 + 0.006 * (st === "thinking" ? 1 : 0.3) + drive * 0.02)) % 1;
      const lit = st === "idle" ? 0.5 : 1;
      const rg = ctx.createLinearGradient(padX, 0, W - padX, 0);
      rg.addColorStop(0, "rgba(201,169,110,0)");
      rg.addColorStop(Math.max(0.001, S.rail - 0.15), `rgba(201,169,110,${0.16 * lit})`);
      rg.addColorStop(S.rail, `rgba(245,240,225,${(0.4 + drive * 0.5) * lit})`);
      rg.addColorStop(Math.min(0.999, S.rail + 0.15), `rgba(201,169,110,${0.16 * lit})`);
      rg.addColorStop(1, "rgba(201,169,110,0)");
      ctx.strokeStyle = rg; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(padX, mid); ctx.lineTo(W - padX, mid); ctx.stroke();

      for (let i = 0; i < N; i++) {
        const bx = padX + i * bw;
        const m = 1 - Math.abs(i - (N - 1) / 2) / ((N - 1) / 2);   // center-weighted
        let target;
        if (st === "listening") {
          const src = Array.isArray(lv) && lv.length ? lv[Math.round((i / (N - 1)) * (lv.length - 1))] || 0 : 0;
          target = 0.04 + src * (0.5 + 0.5 * m);
        } else if (st === "speaking") {
          const wob = Math.sin(t * 9 + i * 1.7) * 0.5 + 0.5;
          target = S.amp * (0.3 + 0.7 * m) * (0.5 + 0.5 * wob);
        } else if (st === "thinking") {
          target = 0.06 + 0.5 * m * (Math.sin(t * 5 - i * 0.9) * 0.5 + 0.5);   // flow across the bars
        } else {
          target = 0.02 + 0.05 * m * (Math.sin(t * 1.3 + i * 0.6) * 0.5 + 0.5);  // calm idle breathing
        }
        S.lvl[i] += (target - S.lvl[i]) * 0.4;
        const L = Math.max(0, S.lvl[i]), h = W * 0.03 + maxH * L, H = 38 + (i / (N - 1)) * 12, a = (0.45 + L * 1.1) * lit;
        const grad = ctx.createLinearGradient(bx, mid - h, bx, mid + h);
        grad.addColorStop(0, `hsla(${H},52%,60%,${a * 0.2})`);
        grad.addColorStop(0.5, `hsla(${H},60%,74%,${a})`);
        grad.addColorStop(1, `hsla(${H},52%,60%,${a * 0.2})`);
        ctx.strokeStyle = `hsla(${H},55%,56%,${a * 0.35})`; ctx.lineWidth = 2.6 + L * 3;
        ctx.beginPath(); ctx.moveTo(bx, mid - h); ctx.lineTo(bx, mid + h); ctx.stroke();
        ctx.strokeStyle = grad; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(bx, mid - h); ctx.lineTo(bx, mid + h); ctx.stroke();
      }

      // center bloom + wake flash
      const cg = ctx.createRadialGradient(W / 2, mid, 0, W / 2, mid, W * 0.5);
      cg.addColorStop(0, `rgba(201,169,110,${0.04 + (st === "idle" ? 0.03 : 0.12) * lit + drive * 0.18 + S.flash * 0.25})`);
      cg.addColorStop(1, "rgba(201,169,110,0)");
      ctx.fillStyle = cg; ctx.fillRect(0, 0, W, W);
      ctx.globalCompositeOperation = "source-over";
    };

    const loop = (now) => { draw(now); rafRef.current = requestAnimationFrame(loop); };
    const needsLoop = () => !reduce && (stateRef.current !== "idle" || activeRef.current);
    const sync = () => {
      if (needsLoop()) { if (!running) { running = true; prev = performance.now(); rafRef.current = requestAnimationFrame(loop); } }
      else { if (running) { running = false; cancelAnimationFrame(rafRef.current); } draw(performance.now()); }   // one still frame
    };
    sync();
    const poll = setInterval(sync, 400);   // cheap check so the loop sleeps when idle+collapsed
    draw(performance.now());
    return () => { clearInterval(poll); cancelAnimationFrame(rafRef.current); ro?.disconnect(); };
  }, [size]);

  return <canvas ref={cvRef} className="aicore-cv" aria-hidden="true" style={{ width: "100%", height: "100%", display: "block" }} />;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
