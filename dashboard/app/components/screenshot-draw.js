// Canvas drawing for the screenshot editor: one annotation shape, and flattening a page (base image +
// shapes) to a PNG at natural resolution. Pure canvas code, no React.

function drawArrow(ctx, a, b, lw) {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); if (len < 1) return;
  const ah = Math.max(12, lw * 3.6), ang = Math.atan2(dy, dx);
  ctx.beginPath(); ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x + ah * Math.cos(ang + Math.PI * 0.83), b.y + ah * Math.sin(ang + Math.PI * 0.83));
  ctx.lineTo(b.x + ah * Math.cos(ang - Math.PI * 0.83), b.y + ah * Math.sin(ang - Math.PI * 0.83));
  ctx.closePath(); ctx.fill();
}
export function drawShape(ctx, s) {
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.lw;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.shadowColor = "rgba(0,0,0,.38)"; ctx.shadowBlur = Math.max(2, s.lw * 0.8);
  if (s.type === "rect") {
    const x = Math.min(s.x, s.x + s.w), y = Math.min(s.y, s.y + s.h), w = Math.abs(s.w), h = Math.abs(s.h);
    ctx.save(); ctx.globalAlpha = 0.06; ctx.fillRect(x, y, w, h); ctx.restore();
    ctx.strokeRect(x, y, w, h);
  } else if (s.type === "arrow") {
    drawArrow(ctx, s.from, s.to, s.lw);
  } else if (s.type === "pen") {
    const p = s.points; if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x, p[0].y, s.lw, 0, 7); ctx.fill(); }
    else if (p.length > 1) { ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y); ctx.stroke(); }
  } else if (s.type === "text") {
    ctx.shadowBlur = Math.max(3, s.size * 0.14);
    ctx.font = `${s.italic ? "italic " : ""}${s.bold ? "700" : "600"} ${s.size}px system-ui,-apple-system,Segoe UI,sans-serif`;
    ctx.textBaseline = "top";
    const lh = s.size * 1.22, dlw = Math.max(1.5, s.size * 0.06);
    s.text.split("\n").forEach((ln, i) => {
      const yy = s.y + i * lh;
      ctx.fillText(ln, s.x, yy);
      if (s.underline || s.strike) {
        const w = ctx.measureText(ln).width;
        ctx.lineWidth = dlw; ctx.beginPath();
        if (s.underline) { ctx.moveTo(s.x, yy + s.size * 1.02); ctx.lineTo(s.x + w, yy + s.size * 1.02); }
        if (s.strike) { ctx.moveTo(s.x, yy + s.size * 0.62); ctx.lineTo(s.x + w, yy + s.size * 0.62); }
        ctx.stroke();
      }
    });
  }
  ctx.shadowBlur = 0;
}

// Flatten one page (base image + its shapes) to a PNG at natural resolution, off-screen.
export function flattenPage(base, shps) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      try {
        const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        const ctx = cv.getContext("2d"); ctx.drawImage(im, 0, 0);
        for (const s of shps) drawShape(ctx, s);
        resolve(cv.toDataURL("image/png"));
      } catch { resolve(base); }
    };
    im.onerror = () => resolve(base);
    im.src = base;
  });
}
