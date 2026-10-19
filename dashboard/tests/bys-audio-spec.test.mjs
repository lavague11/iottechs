// BYS third vertical — "Build Your Sound System". Built as one spec file with NO shell changes (the shell
// was made vertical-agnostic by the POS work). Guards the audio spec's contract surface.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const audio = readFileSync(new URL("../public/widgets/bys/audio-spec.js", import.meta.url), "utf8");

test("audio spec declares the BYS contract: identity + steps, CONFIG, Engine, render, actions", () => {
  assert.ok(/const SPEC = \{[\s\S]*id: 'audio'/.test(audio), "SPEC.id = audio");
  assert.ok(/title: 'Build Your Sound System'/.test(audio) && /service: 'AUDIO'/.test(audio) && /endpoint: '\/api\/leads\/audio'/.test(audio), "audio brand + lead");
  for (const id of ["'capabilities'", "'hardware'"]) assert.ok(audio.includes(`id: ${id}`), `SPEC.steps has ${id}`);
  // reuses the shared Quote + recommendLevel (tiers keyed essential/smart/pro, audio display names)
  for (const id of ["id:'essential'", "id:'smart'", "id:'pro'"]) assert.ok(audio.includes(id), `tier ${id}`);
  assert.ok(/name:'Background'/.test(audio) && /name:'Multi-Zone'/.test(audio) && /name:'Pro Audio'/.test(audio), "audio tier display names");
  assert.ok(audio.includes("const CONFIG = {") && audio.includes("securityFeatures:") && /speaker:/.test(audio) && /amp:/.test(audio), "audio catalog (speakers + amp) + capability checklist");
  assert.ok(audio.includes("const Engine = (() => {") && audio.includes("function compute(s)"), "audio pricing Engine");
  assert.ok(/features\(s, q, i\)/.test(audio) && /system\(s, q, i\)/.test(audio), "renderers: Sound + System");
  assert.ok(/audqty\(v\)/.test(audio) && /audtoggle\(v\)/.test(audio) && /spktype\(v\)/.test(audio) && /feat\(v\)/.test(audio), "actions: audqty / audtoggle / spktype / feat");
  // uses the shell's shared cardGroup primitive for the speaker-type selector
  assert.ok(audio.includes("cardGroup('Speaker type'"), "composes the shell's cardGroup primitive");
  assert.ok(!audio.includes('type="module"') && !/^\s*export\s/m.test(audio), "classic script, not a module");
});
