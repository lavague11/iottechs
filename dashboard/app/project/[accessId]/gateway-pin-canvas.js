export function startPinCanvas(canvas) {
  if (!canvas) return { startWarp: () => {}, cleanup: () => {} };
  var ctx = canvas.getContext("2d");
  var W, H, DPR = Math.min(window.devicePixelRatio || 1, 2);
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  var nodes = [], links = [], pulses = [], ripples = [], LINK = 150, MAX = 120;
  var mouse = { x: -9999, y: -9999, active: false };
  var animId, warp = false, wt = 0, cx = 0, cy = 0, maxR = 0, stars = [];
  var t = 0;

  function resize() {
    W = canvas.width = innerWidth * DPR; H = canvas.height = innerHeight * DPR;
    canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
    build();
  }
  function build() {
    var count = Math.min(64, Math.round(innerWidth * innerHeight / 19000)); nodes = [];
    for (var i = 0; i < count; i++) {
      nodes.push({ x: Math.random() * W, y: Math.random() * H, rx: 0, ry: 0,
        vx: (Math.random() - .5) * 0.10 * DPR, vy: (Math.random() - .5) * 0.10 * DPR,
        hub: Math.random() < 0.18, ph: Math.random() * Math.PI * 2, near: 0 });
    }
  }
  function setMouse(e) {
    var p = e.touches && e.touches[0] ? e.touches[0] : e;
    if (p.clientX == null) return;
    mouse.x = p.clientX * DPR; mouse.y = p.clientY * DPR; mouse.active = true;
  }
  function onOut(e) { if (!e.relatedTarget) mouse.active = false; }
  function onTouchEnd() { mouse.active = false; }
  function onClick(e) {
    var x = e.clientX * DPR, y = e.clientY * DPR;
    nodes.push({ x, y, rx: x, ry: y,
      vx: (Math.random() - .5) * 0.10 * DPR, vy: (Math.random() - .5) * 0.10 * DPR,
      hub: Math.random() < 0.45, ph: Math.random() * 6.283, near: 0, spawn: 1 });
    ripples.push({ x, y, t: 0 });
    if (nodes.length > MAX) nodes.splice(0, 1);
  }
  function spawnPulse() {
    if (!links.length) return;
    var L = links[(Math.random() * links.length) | 0];
    pulses.push({ a: L.a, b: L.b, t: 0, sp: 0.006 + Math.random() * 0.010 });
  }

  function warpFrame() {
    wt += 0.010;
    ctx.fillStyle = "rgba(3,5,9," + (0.20 + Math.min(wt, 1) * 0.55).toFixed(3) + ")";
    ctx.fillRect(0, 0, W, H);
    var phaseB = wt > 0.5, spin = phaseB ? 0.012 : (0.04 + wt * 0.06);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i], prox = 1 - Math.min(s.rad / maxR, 1);
      s.ang += spin * (0.5 + prox * 1.6);
      if (!phaseB) {
        s.rad -= (maxR * 0.004 + (maxR - s.rad) * 0.0016) * (1 + wt * 5);
        if (s.rad < 4) { s.rad = maxR * (0.7 + Math.random() * 0.3); s.ang = Math.random() * 6.283; s.px = cx + Math.cos(s.ang) * s.rad; s.py = cy + Math.sin(s.ang) * s.rad; }
      } else { s.rad += (maxR * 0.014) * (1 + (wt - 0.5) * 11); }
      var x = cx + Math.cos(s.ang) * s.rad, y = cy + Math.sin(s.ang) * s.rad;
      ctx.strokeStyle = s.bright ? "rgba(245,232,205," + (0.22 + prox * 0.6).toFixed(3) + ")" : "rgba(201,169,110," + (0.16 + prox * 0.5).toFixed(3) + ")";
      ctx.lineWidth = (0.7 + prox * 1.8) * DPR;
      ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(x, y); ctx.stroke();
      s.px = x; s.py = y;
    }
    if (!phaseB) {
      var cr = Math.min(wt / 0.5, 1) * 84 * DPR;
      var ag = ctx.createRadialGradient(cx, cy, cr * 0.55, cx, cy, cr * 2);
      ag.addColorStop(0, "rgba(201,169,110,0)"); ag.addColorStop(0.6, "rgba(232,203,148," + (0.55 * wt / 0.5).toFixed(3) + ")"); ag.addColorStop(1, "rgba(201,169,110,0)");
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, cr * 2, 0, 7); ctx.fill();
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(245,232,205," + (0.6 * wt / 0.5).toFixed(3) + ")"; ctx.lineWidth = 2 * DPR;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 7); ctx.stroke();
    } else {
      var f = Math.max(0, 1 - (wt - 0.5) / 0.16);
      if (f > 0) {
        var fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
        fg.addColorStop(0, "rgba(255,250,240," + (0.92 * f).toFixed(3) + ")"); fg.addColorStop(0.4, "rgba(232,203,148," + (0.5 * f).toFixed(3) + ")"); fg.addColorStop(1, "rgba(232,203,148,0)");
        ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
      }
    }
    if (wt >= 1.1) { ctx.fillStyle = "#03060a"; ctx.fillRect(0, 0, W, H); }
  }

  function frame() {
    if (warp) { warpFrame(); animId = requestAnimationFrame(frame); return; }
    t++;
    ctx.clearRect(0, 0, W, H);
    var rep = 160 * DPR, push = 30 * DPR, lmax = LINK * DPR, cmax = lmax * 1.15;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!reduce) { n.x += n.vx; n.y += n.vy; }
      if (n.x < 0 || n.x > W) n.vx *= -1; if (n.y < 0 || n.y > H) n.vy *= -1;
      n.rx = n.x; n.ry = n.y; n.near = 0;
      if (n.spawn) { n.spawn -= 0.045; if (n.spawn < 0) n.spawn = 0; }
      if (mouse.active) {
        var ex = n.x - mouse.x, ey = n.y - mouse.y, ed = Math.sqrt(ex * ex + ey * ey) || 1;
        if (ed < rep) { var f = (1 - ed / rep); n.rx += ex / ed * push * f; n.ry += ey / ed * push * f; n.near = f; }
      }
    }
    links = [];
    for (var a = 0; a < nodes.length; a++) {
      for (var b = a + 1; b < nodes.length; b++) {
        var dx = nodes[a].rx - nodes[b].rx, dy = nodes[a].ry - nodes[b].ry, d = Math.sqrt(dx * dx + dy * dy);
        if (d < lmax) {
          ctx.strokeStyle = "rgba(201,169,110," + ((1 - d / lmax) * 0.30).toFixed(3) + ")"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(nodes[a].rx, nodes[a].ry); ctx.lineTo(nodes[b].rx, nodes[b].ry); ctx.stroke();
          links.push({ a: nodes[a], b: nodes[b] });
        }
      }
    }
    if (mouse.active) {
      for (var ci = 0; ci < nodes.length; ci++) {
        var m = nodes[ci], mx = m.rx - mouse.x, my = m.ry - mouse.y, md = Math.sqrt(mx * mx + my * my);
        if (md < cmax) { ctx.strokeStyle = "rgba(232,203,148," + ((1 - md / cmax) * 0.55).toFixed(3) + ")"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(m.rx, m.ry); ctx.stroke(); }
      }
      var cg = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 26 * DPR);
      cg.addColorStop(0, "rgba(232,203,148,.28)"); cg.addColorStop(1, "rgba(201,169,110,0)");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 26 * DPR, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(245,232,205,.9)"; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 2 * DPR, 0, 7); ctx.fill();
    }
    for (var k = 0; k < nodes.length; k++) {
      var nd = nodes[k], pulse = reduce ? 0 : (Math.sin(t * 0.03 + nd.ph) * 0.5 + 0.5), sp = nd.spawn || 0;
      var r = (nd.hub ? 2.4 : 1.5) * DPR + (nd.hub ? pulse * 1.1 * DPR : 0) + nd.near * 1.6 * DPR + sp * 3.2 * DPR;
      if (nd.hub || nd.near > 0.15 || sp > 0.02) {
        var glowA = (nd.hub ? 0.30 + pulse * 0.22 : 0) + nd.near * 0.5 + sp * 0.6;
        var g = ctx.createRadialGradient(nd.rx, nd.ry, 0, nd.rx, nd.ry, 11 * DPR);
        g.addColorStop(0, "rgba(201,169,110," + Math.min(glowA, 0.7).toFixed(3) + ")"); g.addColorStop(1, "rgba(201,169,110,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(nd.rx, nd.ry, 11 * DPR, 0, 7); ctx.fill();
      }
      ctx.fillStyle = "rgba(" + (nd.near > 0.2 ? "232,203,148" : "201,169,110") + "," + Math.min((nd.hub ? 0.95 : 0.7) + nd.near * 0.3, 1).toFixed(2) + ")";
      ctx.beginPath(); ctx.arc(nd.rx, nd.ry, r, 0, 7); ctx.fill();
    }
    for (var ri = ripples.length - 1; ri >= 0; ri--) {
      var RP = ripples[ri]; RP.t += 0.035;
      if (RP.t >= 1) { ripples.splice(ri, 1); continue; }
      ctx.strokeStyle = "rgba(232,203,148," + ((1 - RP.t) * 0.55).toFixed(3) + ")"; ctx.lineWidth = 1.5 * DPR;
      ctx.beginPath(); ctx.arc(RP.x, RP.y, (6 + RP.t * 38) * DPR, 0, 7); ctx.stroke();
    }
    if (!reduce) {
      if (t % 26 === 0 && pulses.length < 14) spawnPulse();
      for (var p = pulses.length - 1; p >= 0; p--) {
        var P = pulses[p]; P.t += P.sp;
        if (P.t >= 1) { pulses.splice(p, 1); continue; }
        var qx = P.a.rx + (P.b.rx - P.a.rx) * P.t, qy = P.a.ry + (P.b.ry - P.a.ry) * P.t;
        var pg = ctx.createRadialGradient(qx, qy, 0, qx, qy, 5 * DPR);
        pg.addColorStop(0, "rgba(245,232,205,.95)"); pg.addColorStop(1, "rgba(201,169,110,0)");
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(qx, qy, 5 * DPR, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,248,235,.95)"; ctx.beginPath(); ctx.arc(qx, qy, 1.4 * DPR, 0, 7); ctx.fill();
      }
    }
    animId = requestAnimationFrame(frame);
  }

  function startWarp() {
    warp = true; wt = 0; cx = W / 2; cy = H / 2; maxR = Math.sqrt(W * W + H * H) / 2;
    canvas.style.webkitMask = "none"; canvas.style.mask = "none"; canvas.style.zIndex = "60";
    stars = [];
    var N = Math.min(300, Math.round(W * H / 70000));
    for (var i = 0; i < N; i++) {
      var ang = Math.random() * 6.283, rad = (0.06 + Math.random() * 0.96) * maxR;
      stars.push({ ang, rad, px: cx + Math.cos(ang) * rad, py: cy + Math.sin(ang) * rad, bright: Math.random() < 0.3 });
    }
  }

  window.addEventListener("mousemove", setMouse, { passive: true });
  window.addEventListener("touchmove", setMouse, { passive: true });
  window.addEventListener("touchstart", setMouse, { passive: true });
  window.addEventListener("mouseout", onOut);
  window.addEventListener("touchend", onTouchEnd);
  window.addEventListener("click", onClick);
  window.addEventListener("resize", resize);
  resize();
  animId = requestAnimationFrame(frame);

  function cleanup() {
    cancelAnimationFrame(animId);
    window.removeEventListener("mousemove", setMouse);
    window.removeEventListener("touchmove", setMouse);
    window.removeEventListener("touchstart", setMouse);
    window.removeEventListener("mouseout", onOut);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("click", onClick);
    window.removeEventListener("resize", resize);
  }

  return { startWarp, cleanup };
}
