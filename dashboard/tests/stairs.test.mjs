// Stairs renderer: a Room with semanticType "stairs" keeps its geometry/metrics but draws architectural tread
// lines (clipped to the room) instead of a plain interior. Pure helpers extracted + source-reads for wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");
function extractFn(s, name){ const start=s.indexOf("function "+name+"("); assert.ok(start>=0,"missing "+name);
  let i=s.indexOf("{",s.indexOf(")",start)),d=0,q=null; for(let j=i;j<s.length;j++){const c=s[j];
    if(q){if(c==="\\")j++;else if(c===q)q=null;continue;} if(c==='"'||c==="'"){q=c;continue;}
    if(c==="{")d++;else if(c==="}"&&--d===0)return s.slice(start,j+1);} throw new Error("unbalanced "+name); }
const HALF=13;
const api=new Function(`var HALF=${HALF};
  ${extractFn(src,"key")}\n${extractFn(src,"cellsBBoxPx")}\n${extractFn(src,"isStairs")}\n${extractFn(src,"stairOrient")}\n${extractFn(src,"stairTreads")}
  return { key:key, isStairs:isStairs, stairOrient:stairOrient, stairTreads:stairTreads };`)();
const { key } = api;
const rect=(c0,c1,r0,r1)=>{const a=[];for(let c=c0;c<=c1;c++)for(let r=r0;r<=r1;r++)a.push(key(c,r));return a;};

test("isStairs keys off the semanticType, not the name", () => {
  assert.equal(api.isStairs({ semanticType: "stairs" }), true);
  assert.equal(api.isStairs({ semanticType: "office", label: "Back Stairs" }), false, "a name containing 'stairs' is NOT enough");
});
test("stairOrient: explicit 0/90/180/270 honoured; else default from the longest axis", () => {
  assert.equal(api.stairOrient({ cells: rect(0,1,0,5), stairOrientation: 90 }), 90, "explicit honoured");
  assert.equal(api.stairOrient({ cells: rect(0,1,0,5) }), 0, "tall (vertical travel) → 0");
  assert.equal(api.stairOrient({ cells: rect(0,5,0,1) }), 90, "wide (horizontal travel) → 90");
  assert.equal(api.stairOrient({ cells: rect(0,1,0,5), stairOrientation: 45 }), 0, "junk → default");
});
test("stairTreads: travel-vertical → horizontal lines, a sensible count, spanning the room width", () => {
  const t = api.stairTreads({ cells: rect(0,1,0,7) });   // tall → horizontal treads
  assert.ok(t.length >= 4 && t.length <= 16, "a sensible number of treads");
  t.forEach((s) => assert.equal(s[1], s[3], "each tread is a HORIZONTAL line (y0===y1)"));
  const v = api.stairTreads({ cells: rect(0,7,0,1) });   // wide → vertical treads
  v.forEach((s) => assert.equal(s[0], s[2], "each tread is a VERTICAL line (x0===x2)"));
});
test("wiring: stairs render in the editor + export, rotate action, orientation persists", () => {
  assert.ok(extractFn(src,"drawRoom").includes("if(isStairs(r)) drawStairs(r,set)"), "editor draws treads for a stairs room");
  assert.ok(extractFn(src,"drawStairs").includes("ctx.clip()"), "treads clipped to the room polygon");
  assert.ok(extractFn(src,"svgPlanBody").includes("if(isStairs(r)) o.push(stairsSVG(r))"), "export bakes treads");
  assert.ok(extractFn(src,"stairsSVG").includes("clip-path="), "export treads are clipped (vector)");
  assert.ok(src.includes('$("mRotateStairs").addEventListener') && src.includes("sel.stairOrientation=(stairOrient(sel)+90)%360"), "Rotate cycles orientation 90°");
  assert.ok(extractFn(src,"reconcileRooms").includes("stairOrientation:so"), "orientation survives reconcile");
});
