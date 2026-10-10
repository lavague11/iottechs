import { getSessionUser } from "../../../lib/session";
import { can } from "../../../lib/roles";
import { sqliteHandle } from "../../../lib/db";
import {
  getPage, getPageBySlug, createPage, publicFacts, applyDraft, applyFactCheck, normalizeSlug, getCaseStudy,
} from "../../../lib/seo";
import { buildPagePrompt, buildCaseStudyPrompt, runGeneration, runFactCheck, seoEngine } from "../../../lib/seo/generate";

// One-call AI drafting for the SEO engine. Writes a complete DRAFT (meta, tags, body, FAQ) onto a page
// record and returns it for review — it lands at needs_review / fact_check pending and the publish gate
// still stands between it and going live. Capability-gated (seo.edit). Longer-running, so it's an API
// route (a plain POST the host routes reliably), not a server action.
export const runtime = "nodejs";
export const maxDuration = 300;

const db = sqliteHandle();
const slugify = (s) => normalizeSlug(String(s || "").replace(/[^a-z0-9\s/-]/gi, "").replace(/\s+/g, "-"));

// Minimal, factual project context for a case study — only what's verifiable from the project record.
// The client NAME is included only when name-use permission is set; otherwise the study stays anonymous.
function projectFacts(accessId, nameAllowed) {
  try {
    const p = db.prepare("SELECT company_name, contact_name, address, service_code, stage FROM projects WHERE access_id=?").get(accessId);
    if (!p) return {};
    const addr = String(p.address || "");
    const m = addr.match(/,\s*([A-Za-z .'-]+),\s*([A-Z]{2})\b/);
    return {
      client: nameAllowed ? (p.company_name || p.contact_name || null) : null,
      city: m ? m[1].trim() : null, state: m ? m[2] : null,
      service_code: p.service_code || null, project_id: accessId, stage: p.stage || null,
    };
  } catch { return {}; }
}

export async function POST(req) {
  const user = await getSessionUser();
  if (!user?.id || !can(user.role, "seo.edit")) return Response.json({ ok: false, error: "unauthorized" }, { status: 403 });
  const by = user.name || user.role;
  if (!seoEngine()) return Response.json({ ok: false, error: "No AI key configured. Add OPENAI_API_KEY in Development ▸ API Keys." }, { status: 400 });

  let body; try { body = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const instruction = String(body.instruction || "").slice(0, 600);
  const facts = publicFacts();

  try {
    // 0) AI fact-check (grounding audit) of an existing page's draft.
    if (body.factCheck && body.pageId) {
      const page = getPage(body.pageId);
      if (!page) return Response.json({ ok: false, error: "page not found" }, { status: 404 });
      if (!(Array.isArray(page.body) && page.body.length)) return Response.json({ ok: false, error: "no draft to check" }, { status: 400 });
      const { report, engine } = await runFactCheck(page, facts);
      const updated = applyFactCheck(page.id, report, by);
      return Response.json({ ok: true, page: updated, report, engine });
    }

    // 1) Case study → its own case-study page.
    if (body.caseStudyId) {
      const cs = getCaseStudy(body.caseStudyId);
      if (!cs) return Response.json({ ok: false, error: "case study not found" }, { status: 404 });
      if (!cs.project_access_id) return Response.json({ ok: false, error: "Link a real project to this case study first — a study needs verified project facts, not an invented story." }, { status: 400 });
      const slug = normalizeSlug(cs.slug || `case-studies/${slugify(cs.client || "project-" + cs.id)}`);
      let page = getPageBySlug(slug) || createPage({ slug, page_type: "case-study", title: cs.client ? `${cs.client} — Case Study` : "Case Study", status: "writing" }, by);
      const pf = projectFacts(cs.project_access_id, !!cs.permission_to_name_client);
      const prompt = buildCaseStudyPrompt({ caseStudy: cs, projectFacts: pf, facts, instruction });
      const { draft, engine, model } = await runGeneration(prompt);
      const updated = applyDraft(page.id, draft, by, engine);
      return Response.json({ ok: true, page: updated, flags: draft.needs_verification, links: draft.internal_link_suggestions, engine, model });
    }

    // 2) Existing page by id, or 3) a brand-new page from a one-line topic.
    let page = body.pageId ? getPage(body.pageId) : null;
    if (!page && body.topic) {
      const slug = slugify(body.slug || body.topic);
      if (!slug) return Response.json({ ok: false, error: "could not derive a slug" }, { status: 400 });
      page = getPageBySlug(slug) || createPage({ slug, page_type: body.page_type || "resource", title: String(body.topic).slice(0, 120), status: "writing" }, by);
    }
    if (!page) return Response.json({ ok: false, error: "pageId, topic, or caseStudyId required" }, { status: 400 });

    const prompt = buildPagePrompt({ page, facts, instruction });
    const { draft, engine, model } = await runGeneration(prompt);
    const updated = applyDraft(page.id, draft, by, engine);
    return Response.json({ ok: true, page: updated, flags: draft.needs_verification, links: draft.internal_link_suggestions, engine, model });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}
