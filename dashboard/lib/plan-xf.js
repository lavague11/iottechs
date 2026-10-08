// Manual plan→aerial alignment transform (floor.planXf). Pure geometry — no DOM, no canvas. SHARED by
// the Site Survey widget (public/widgets/site-survey-merged.html keeps a byte-identical inline copy of
// validXf/xfIsId/xfCss/xfFwd/xfInv, drift-guarded in tests/plan-xf.test.mjs) and the server-side exporter
// (lib/survey2-export.js) so the proposal PDF / customer "Your System Layout" composite the SAME aligned
// hybrid staff set up in the planner.
//
// xf = { tx, ty (plate-% translate), s (uniform scale), rot (deg) }, applied about the plate centre (50,50):
// the aerial is the fixed real world; the plan + its grid/zones/rooms/devices ride this transform over it.
export function validXf(x){ if(!x||typeof x!=="object") return {tx:0,ty:0,s:1,rot:0};
  var tx=isFinite(+x.tx)?+x.tx:0, ty=isFinite(+x.ty)?+x.ty:0, s=isFinite(+x.s)?+x.s:1, rot=isFinite(+x.rot)?+x.rot:0;
  s=Math.max(0.2,Math.min(5,s)); tx=Math.max(-100,Math.min(100,tx)); ty=Math.max(-100,Math.min(100,ty));
  while(rot<=-180)rot+=360; while(rot>180)rot-=360;
  return { tx:Math.round(tx*100)/100, ty:Math.round(ty*100)/100, s:Math.round(s*1e4)/1e4, rot:Math.round(rot*100)/100 }; }
export function xfIsId(x){ var v=validXf(x); return v.tx===0 && v.ty===0 && v.s===1 && v.rot===0; }
export function xfCss(x){ var v=validXf(x); return "translate("+v.tx+"%,"+v.ty+"%) rotate("+v.rot+"deg) scale("+v.s+")"; }
// plan-% → screen-% (what xfCss does visually): v=(p-c); rotate+scale; +t; c=centre(50,50).
export function xfFwd(x,px,py){ var v=validXf(x), vx=px-50, vy=py-50, rad=v.rot*Math.PI/180, c=Math.cos(rad), sn=Math.sin(rad);
  return { x:50 + (vx*c - vy*sn)*v.s + v.tx, y:50 + (vx*sn + vy*c)*v.s + v.ty }; }
// screen-% → plan-% (inverse): subtract t; un-rotate; un-scale about the centre.
export function xfInv(x,px,py){ var v=validXf(x), vx=px-v.tx-50, vy=py-v.ty-50, rad=-v.rot*Math.PI/180, c=Math.cos(rad), sn=Math.sin(rad), s=v.s||1;
  return { x:50 + (vx*c - vy*sn)/s, y:50 + (vx*sn + vy*c)/s }; }

// Canvas affine {a,b,c,d,e,f} that replicates the widget's CSS transform on #planWorld —
// `transform: translate(tx%,ty%) rotate(rot) scale(s)` with transform-origin 50% 50% — in PIXEL space on a
// W×H plate (true pixel-space rotation about the centre, so the plan is never sheared on a non-square plate).
// Maps a plan-layer pixel (0..W, 0..H) to its scene-plate pixel; feed straight to ctx.transform(a,b,c,d,e,f).
export function xfMatrix(x, W, H){ var v=validXf(x), rad=v.rot*Math.PI/180, co=Math.cos(rad), sn=Math.sin(rad), s=v.s;
  var a=s*co, b=s*sn, c=-s*sn, d=s*co, cx=W/2, cy=H/2, tx=v.tx/100*W, ty=v.ty/100*H;
  return { a:a, b:b, c:c, d:d, e:cx+tx-(a*cx+c*cy), f:cy+ty-(b*cx+d*cy) }; }
// Apply xfMatrix to one plan-layer pixel → scene-plate pixel.
export function xfApplyPx(x, px, py, W, H){ var m=xfMatrix(x,W,H); return { x:m.a*px+m.c*py+m.e, y:m.b*px+m.d*py+m.f }; }
