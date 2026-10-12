const seo = await import("./lib/seo.js");
const gen = await import("./lib/seo/generate.js");
const facts = seo.publicFacts();
const eng = gen.seoEngine();
if (!eng) { console.log("NO AI KEY"); process.exit(1); }
const targets = seo.listPages({ status: "opportunity" }).filter(p => p.page_type !== "hub" && !(Array.isArray(p.body) && p.body.length));
console.log(`BATCH START: ${targets.length} pages via ${eng.name}/${eng.model}`);
let ok = 0, fail = 0;
for (const p of targets) {
  try {
    const prompt = gen.buildPagePrompt({ page: p, facts });
    const { draft, engine } = await gen.runGeneration(prompt, eng);
    seo.applyDraft(p.id, draft, "batch", engine);
    ok++;
    console.log(`[${ok+fail}/${targets.length}] ✓ ${p.slug} — q${seo.provisionalQuality(draft)} · flags:${(draft.needs_verification||[]).length}`);
  } catch (e) {
    fail++;
    console.log(`[${ok+fail}/${targets.length}] ✗ ${p.slug} — ${String(e?.message||e).slice(0,120)}`);
  }
}
console.log(`BATCH DONE: ${ok} drafted, ${fail} failed. All at needs_review — nothing published.`);
