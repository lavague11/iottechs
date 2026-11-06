// In-project stage-step context menu: right-click / long-press a step (Consulting · Install · Completion)
// to jump the project there, via the shared context-menu primitive. Admin/manager only; backward moves confirm.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the shared context-menu primitive: long-press, haptics, no text selection", () => {
  const c = read("../app/components/context-menu.jsx");
  assert.ok(c.includes("export function useContextMenu") && c.includes("export function ContextMenu"), "hook + menu exported");
  assert.ok(c.includes("LONG_PRESS_MS = 500"), "500ms long-press");
  assert.ok(c.includes("navigator.vibrate"), "light haptic buzz");
  assert.ok(c.includes("MOVE_CANCEL_PX") && c.includes("clearPress"), "cancel the press if the finger moves");
  assert.ok(c.includes("WebkitTouchCallout") && c.includes("userSelect"), "suppress iOS callout + text selection");
  assert.ok(c.includes("createPortal") && c.includes("vw - r.width") && c.includes("vh - r.height"), "portaled + viewport-clamped");
  assert.ok(c.includes("checked ? <CheckIcon"), "checked items render a check");
});

test("staff hub wires the stage-step menu (admin/manager, backward confirm)", () => {
  const h = read("../app/project/[accessId]/staff-hub.jsx");
  assert.ok(h.includes("useContextMenu") && h.includes("ContextMenu"), "uses the primitive");
  assert.ok(h.includes("onStageJump"), "takes an onStageJump prop");
  assert.ok(h.includes('["admin", "manager"].includes(role)'), "only admin/manager can move the stage");
  assert.ok(h.includes("title=\"Move stage\"") && h.includes("`Move to ${p.label}`"), "menu lists Move to <step>");
  assert.ok(h.includes("p.key === currentPhaseKey"), "current step is checked");
  assert.ok(h.includes("ti < ci && !window.confirm"), "moving backward asks to confirm");
  assert.ok(h.includes("stageMenu.triggerProps"), "each step is a long-press / right-click trigger");
});

test("gateway maps the 3 steps to master stages through the existing doMove", () => {
  const g = read("../app/project/[accessId]/gateway-client.jsx");
  const line = (g.split("\n").find((l) => l.includes("onStageJump=")) || "");
  assert.ok(line.includes('consulting: "site_survey"') && line.includes('install: "install"') && line.includes('completion: "completion"'), "consulting→site_survey, install→install, completion→completion");
  assert.ok(line.includes("doMove("), "routes through doMove (setStage — which logs every change)");
});
