"use client";
import { useState } from "react";
import { seedPlanAction, createPageAction, setStatusAction, publishPageAction, unpublishPageAction, upsertFactAction, updatePageAction, upsertCaseStudyAction } from "./actions";

const STATUSES = ["opportunity", "researching", "brief", "writing", "fact_check", "seo_qa", "needs_review", "approved", "published", "monitoring", "refresh", "blocked"];
const TIER_C = { P0: "#ff7a7a", P1: "#f2c14e", P2: "#4ea3ff", P3: "#8795b4" };

export default function SeoClient({ data, caps }) {
  const [tab, setTab] = useState("overview");
  const [pages, setPages] = useState(data.pages);
  const [facts, setFacts] = useState(data.facts);
  const [cases, setCases] = useState(data.cases);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 4000); };

  const counts = pages.reduce((a, p) => { a[p.status] = (a[p.status] || 0) + 1; return a; }, {});
  const published = counts.published || 0;
  const inProgress = pages.filter((p) => !["opportunity", "published", "blocked"].includes(p.status)).length;
  const opportunities = counts.opportunity || 0;
  const factsNeedVerify = facts.filter((f) => !(f.verified && f.public_use_allowed)).length;

  async function doSeed() {
    setBusy(true); const r = await seedPlanAction().catch(() => ({ error: "failed" })); setBusy(false);
    if (r?.error) return flash("⚠ " + r.error);
    flash(`Seeded ${r.pages} pages · ${r.cases} case studies · ${r.links} backlinks`);
    location.reload();
  }
  async function newPage() {
    const slug = prompt("New page slug (e.g. commercial-security-camera-installation):"); if (!slug) return;
    const title = prompt("Title:") || slug;
    const r = await createPageAction({ slug, title, page_type: "service", status: "opportunity" }).catch(() => ({ error: "failed" }));
    if (r?.error) return flash("⚠ " + r.error);
    setPages((p) => [r.page, ...p]); flash("Created " + r.page.slug);
  }
  async function advance(id, status) {
    const r = await setStatusAction(id, status).catch(() => ({ error: "failed" }));
    if (r?.error) return flash("⚠ " + r.error);
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, status } : p)));
  }
  async function publish(id) {
    setBusy(true); const r = await publishPageAction(id).catch(() => ({ error: "failed" })); setBusy(false);
    if (r?.error) return flash("⚠ " + r.error);
    if (!r.ok) return flash("Blocked by the gate: " + r.gate.failures.map((f) => `${f.gate} (${f.detail})`).join(" · "));
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, status: "published", published_url: r.url } : p)));
    flash("Published → " + r.url);
  }
  async function unpublish(id) {
    const r = await unpublishPageAction(id).catch(() => ({ error: "failed" }));
    if (r?.error) return flash("⚠ " + r.error);
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, status: "needs_review", published_url: null } : p)));
  }
  async function saveFact(key, patch) {
    const r = await upsertFactAction({ key, ...patch }).catch(() => ({ error: "failed" }));
    if (r?.error) return flash("⚠ " + r.error);
    setFacts((fs) => fs.map((f) => (f.key === key ? r.fact : f)));
    flash("Saved " + key);
  }

  // AI drafting (OpenAI). Writes a full draft onto a page and returns it at needs_review — never live.
  const [gen, setGen] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [promptType, setPromptType] = useState("resource");
  const [sel, setSel] = useState(null);       // page id open in the detail/preview panel
  const [batch, setBatch] = useState(null);   // { done, total, current } while batch-generating
  const selPage = pages.find((p) => p.id === sel) || null;

  async function generate(payload, spinnerId, openDetail = true) {
    setGen(spinnerId); setMsg("Writing draft with AI… this can take up to a minute.");
    const r = await fetch("/api/seo-generate", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then((x) => x.json()).catch((e) => ({ error: String(e) }));
    setGen(null);
    if (!r?.ok) { flash("⚠ " + (r?.error || "generation failed")); return null; }
    setPages((ps) => { const i = ps.findIndex((p) => p.id === r.page.id); return i >= 0 ? ps.map((p) => (p.id === r.page.id ? r.page : p)) : [r.page, ...ps]; });
    const flags = (r.flags || []).length ? ` · ⚠ ${r.flags.length} fact(s) to verify` : "";
    flash(`Draft ready: “${r.page.title}” via ${r.engine}${flags}. Review it, verify facts, then publish.`);
    if (openDetail) { setTab("content"); setSel(r.page.id); }   // show what was written, not just a tab switch
    return r.page;
  }
  function genFromPrompt() { const t = prompt.trim(); if (!t) return; setPrompt(""); generate({ topic: t, page_type: promptType }, "new"); }
  async function linkCase(id, accessId) {
    const r = await upsertCaseStudyAction({ id, project_access_id: accessId.trim() }).catch(() => ({ error: "failed" }));
    if (r?.error) return flash("⚠ " + r.error);
    setCases((cs) => cs.map((c) => (c.id === id ? r.caseStudy : c)));
    flash(`Linked ${r.caseStudy.project_access_id} — you can draft this study now.`);
  }

  async function savePage(id, patch) {
    const r = await updatePageAction(id, patch).catch(() => ({ error: "failed" }));
    if (r?.error) return flash("⚠ " + r.error);
    setPages((ps) => ps.map((p) => (p.id === id ? r.page : p)));
  }
  // AI fact-check (grounding audit). Clean → fact-check passes; flagged → stays failed with the claims noted.
  async function factCheck(id) {
    setGen("fc" + id); setMsg("AI fact-check running — auditing the draft against the verified facts…");
    const r = await fetch("/api/seo-generate", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factCheck: true, pageId: id }) })
      .then((x) => x.json()).catch((e) => ({ error: String(e) }));
    setGen(null);
    if (!r?.ok) return flash("⚠ " + (r?.error || "fact-check failed"));
    setPages((ps) => ps.map((p) => (p.id === r.page.id ? r.page : p)));
    flash(r.report.verdict === "clean"
      ? `✓ Fact-check clean via ${r.engine} — fact-check passed. (Publish still your call.)`
      : `⚠ Fact-check flagged ${r.report.flags.length} claim(s) — see the notes, then rewrite, soften, or verify.`);
  }
  // Batch: write drafts for every un-written opportunity page, one at a time (keeps each independent and
  // shows progress). Each is a real OpenAI call, so confirm first.
  async function batchGenerate() {
    const targets = pages.filter((p) => p.status === "opportunity" && p.page_type !== "hub" && !p.body);
    if (!targets.length) return flash("No un-written opportunity pages to generate.");
    if (!window.confirm(`Generate AI drafts for ${targets.length} pages? Each is a separate OpenAI call (cost on your key) and this can take several minutes. Drafts land at “needs review” — nothing publishes automatically.`)) return;
    for (let i = 0; i < targets.length; i++) {
      setBatch({ done: i, total: targets.length, current: targets[i].title });
      // eslint-disable-next-line no-await-in-loop
      await generate({ pageId: targets[i].id }, "batch", false);
    }
    setBatch(null); flash(`Batch complete — ${targets.length} drafts written. Review each and verify facts before publishing.`);
  }

  return (
    <div className="seoa">
      <style>{CSS}</style>
      <header className="seoa-top">
        <div><span className="seoa-eye">IOT TECHS · SEO</span><h1>Working queue</h1></div>
        <div className="seoa-tabs">
          {["overview", "content", "facts", "cases", "backlinks"].map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </header>
      {msg && <div className="seoa-msg">{msg}</div>}

      {selPage && (
        <DetailPanel page={selPage} caps={caps} busy={busy} working={gen === selPage.id}
          onClose={() => setSel(null)}
          onSave={(patch) => savePage(selPage.id, patch)}
          onStatus={(s) => advance(selPage.id, s)}
          onGenerate={() => generate({ pageId: selPage.id }, selPage.id)}
          onFactCheck={() => factCheck(selPage.id)} checking={gen === "fc" + selPage.id}
          onPublish={async () => { await publish(selPage.id); }}
          onUnpublish={() => unpublish(selPage.id)} />
      )}

      {tab === "overview" && (
        <section>
          <div className="seoa-kpis">
            <div className="k"><b>{published}</b><span>published</span></div>
            <div className="k"><b>{inProgress}</b><span>in progress</span></div>
            <div className="k"><b>{opportunities}</b><span>opportunities</span></div>
            <div className="k warn"><b>{factsNeedVerify}</b><span>facts to verify</span></div>
            <div className="k"><b>{data.orphans.length}</b><span>orphan pages</span></div>
          </div>
          {pages.length === 0 && caps.admin && (
            <div className="seoa-card"><p>The queue is empty. Seed it from the approved master plan.</p>
              <button className="btn pri" disabled={busy} onClick={doSeed}>Seed from plan</button></div>
          )}
          {data.orphans.length > 0 && (
            <div className="seoa-card"><h3>Orphan published pages (no inbound links)</h3>
              <p className="muted">{data.orphans.map((s) => "/" + s).join(" · ")}</p></div>
          )}
          <div className="seoa-card">
            <h3>Fact-safety</h3>
            <p className="muted">{factsNeedVerify} fact(s) still need verification before any page may cite them — including the home page's “1500+ / Port Authority / NYPD” claims. Phase B publishing is gated on these.</p>
          </div>
          {caps.admin && pages.length > 0 && <button className="btn" disabled={busy} onClick={doSeed}>Re-seed missing plan items</button>}
        </section>
      )}

      {tab === "content" && (
        <section>
          {caps.edit && (
            <div className="seoa-gen">
              <input className="inp grow" placeholder="Write a page from a prompt — e.g. “License plate reader cameras for car dealership lots in NJ”"
                     value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && genFromPrompt()} />
              <select className="sel" value={promptType} onChange={(e) => setPromptType(e.target.value)}>
                {["service", "industry", "location", "resource", "blog"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button className="btn pri" disabled={gen === "new" || !prompt.trim()} onClick={genFromPrompt}>{gen === "new" ? "Writing…" : "Generate"}</button>
            </div>
          )}
          <div className="seoa-bar">
            <span className="muted">{pages.length} pages · click a title to read/review · drafts land at “needs review”</span>
            <span style={{ display: "flex", gap: 8 }}>
              {caps.edit && <button className="btn" disabled={!!batch} onClick={batchGenerate}>{batch ? `Writing ${batch.done + 1}/${batch.total}…` : "⚡ Generate all opportunities"}</button>}
              {caps.edit && <button className="btn" onClick={newPage}>+ Blank page</button>}
            </span>
          </div>
          {batch && <div className="seoa-msg">Batch writing {batch.done + 1} of {batch.total}: “{batch.current}” — each page is saved as it finishes; you can keep this tab open.</div>}
          <div className="tblw"><table className="tbl">
            <thead><tr><th>Title</th><th>Slug</th><th>Type</th><th>Pri</th><th>Status</th><th>Checks</th><th>Actions</th></tr></thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td><button className="linkbtn" onClick={() => setSel(p.id)}>{p.title || <span className="muted">untitled</span>}</button>{p.body ? <span className="dot" title="has a draft" /> : null}</td>
                  <td className="mono">/{p.slug}</td>
                  <td className="muted">{p.page_type}</td>
                  <td><span className="tier" style={{ color: TIER_C[p.priority_tier] || "#8795b4" }}>{p.priority_tier || "—"}</span></td>
                  <td>
                    {caps.edit ? (
                      <select className="sel" value={p.status} onChange={(e) => advance(p.id, e.target.value)}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <span className="muted">{p.status}</span>}
                  </td>
                  <td className="chks">
                    <span className={"chip " + (p.fact_check_status === "passed" ? "ok" : "")}>fact</span>
                    <span className={"chip " + ((+p.quality_score || 0) >= 70 ? "ok" : "")}>q{p.quality_score || 0}</span>
                  </td>
                  <td className="acts">
                    {caps.edit && p.page_type !== "hub" && <button className="btn sm" disabled={gen === p.id} onClick={() => generate({ pageId: p.id }, p.id)}>{gen === p.id ? "writing…" : (p.body ? "rewrite" : "generate")}</button>}
                    {p.status === "published" && <a className="btn sm" href={"/" + p.slug} target="_blank" rel="noreferrer">open</a>}
                    {caps.publish && p.status !== "published" && <button className="btn sm pri" disabled={busy} onClick={() => publish(p.id)}>publish</button>}
                    {caps.publish && p.status === "published" && <button className="btn sm" onClick={() => unpublish(p.id)}>unpublish</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}

      {tab === "facts" && (
        <section>
          <p className="muted">The authoritative claim store. A page/schema may cite a fact only when it is both <b>verified</b> and <b>public-use OK</b>.</p>
          <div className="tblw"><table className="tbl">
            <thead><tr><th>Key</th><th>Claim</th><th>Value</th><th>Verified</th><th>Public</th><th></th></tr></thead>
            <tbody>
              {facts.map((f) => <FactRow key={f.key} f={f} canEdit={caps.admin} onSave={saveFact} />)}
            </tbody>
          </table></div>
        </section>
      )}

      {tab === "cases" && (
        <section>
          <p className="muted">A case study drafts from a <b>real, linked project</b> — no project, no story. Link a project id (e.g. ASC0042) to enable drafting.</p>
          <div className="tblw"><table className="tbl">
            <thead><tr><th>Client</th><th>Industry</th><th>City/State</th><th>Project</th><th>Status</th><th>Name OK</th><th>Action</th></tr></thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}><td><b>{c.client}</b></td><td className="muted">{c.industry}</td>
                  <td className="muted">{[c.city, c.state].filter(Boolean).join(", ") || "—"}</td>
                  <td className="mono">{c.project_access_id || <span className="faint">—</span>}</td>
                  <td><span className={"chip " + (c.status === "verified" ? "ok" : "")}>{c.status}</span></td>
                  <td>{c.permission_to_name_client ? "✓" : "—"}</td>
                  <td className="acts">
                    {caps.edit && (c.project_access_id
                      ? <button className="btn sm" disabled={gen === "cs" + c.id} onClick={() => generate({ caseStudyId: c.id }, "cs" + c.id)}>{gen === "cs" + c.id ? "writing…" : "draft study"}</button>
                      : <LinkCell onLink={(acc) => linkCase(c.id, acc)} />)}
                  </td></tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}

      {tab === "backlinks" && (
        <section>
          <div className="tblw"><table className="tbl">
            <thead><tr><th>Reason</th><th>Domain</th><th>Relationship</th><th>Authority</th><th>Status</th></tr></thead>
            <tbody>
              {data.backlinks.map((b) => (
                <tr key={b.id}><td>{b.reason}</td><td className="mono muted">{b.domain || "—"}</td>
                  <td className="muted">{b.relationship}</td><td className="muted">{b.authority}</td>
                  <td><span className="chip">{b.status}</span></td></tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
    </div>
  );
}

// Read + review one page: its draft, meta, tags, flags, and the actions to verify facts and publish.
function DetailPanel({ page, caps, busy, working, checking, onClose, onSave, onStatus, onGenerate, onFactCheck, onPublish, onUnpublish }) {
  const [title, setTitle] = useState(page.title || "");
  const [mt, setMt] = useState(page.meta_title || "");
  const [md, setMd] = useState(page.meta_description || "");
  const [tags, setTags] = useState((page.secondary_topics || []).join(", "));
  const dirty = title !== (page.title || "") || mt !== (page.meta_title || "") || md !== (page.meta_description || "") || tags !== (page.secondary_topics || []).join(", ");
  const blocks = Array.isArray(page.body) ? page.body : [];
  const factPassed = page.fact_check_status === "passed";

  return (
    <div className="dp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dp">
        <div className="dp-head">
          <div><span className="mono muted">/{page.slug}</span><div className="dp-meta2">{page.page_type} · <span className="tier" style={{ color: TIER_C[page.priority_tier] }}>{page.priority_tier || "—"}</span> · <span className={"chip " + (page.status === "published" ? "ok" : "")}>{page.status}</span> · q{page.quality_score || 0}</div></div>
          <button className="dp-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="dp-body">
          {page.agent_notes && <div className={"dp-notes" + (/VERIFY/.test(page.agent_notes) ? " warn" : "")}>{page.agent_notes}</div>}

          {caps.edit && (
            <div className="dp-edit">
              <label>Title<input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
              <label>Meta title <span className="muted">({mt.length}/60)</span><input className="inp" value={mt} onChange={(e) => setMt(e.target.value)} /></label>
              <label>Meta description <span className="muted">({md.length}/155)</span><textarea className="inp" rows={2} value={md} onChange={(e) => setMd(e.target.value)} /></label>
              <label>Tags (comma-separated)<input className="inp" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
              {dirty && <button className="btn sm pri" onClick={() => onSave({ title, meta_title: mt, meta_description: md, secondary_topics: tags.split(",").map((t) => t.trim()).filter(Boolean) })}>Save edits</button>}
            </div>
          )}

          <div className="dp-preview">
            <div className="dp-prev-h1">{title || page.title}</div>
            {blocks.length ? blocks.map((b, i) => <PreviewBlock key={i} b={b} />) : <p className="muted">No draft yet — generate one.</p>}
          </div>
        </div>

        <div className="dp-foot">
          {caps.edit && <button className="btn" disabled={working} onClick={onGenerate}>{working ? "writing…" : (blocks.length ? "Rewrite with AI" : "Generate with AI")}</button>}
          {caps.edit && blocks.length > 0 && (
            <button className="btn" disabled={checking} onClick={onFactCheck}>{checking ? "checking…" : "AI fact-check"}</button>
          )}
          {caps.edit && (
            <button className={"btn" + (factPassed ? " pri" : "")} title="Manual override" onClick={() => onSave({ fact_check_status: factPassed ? "pending" : "passed" })}>
              {factPassed ? "✓ Fact-check passed" : (page.fact_check_status === "failed" ? "Override: pass" : "Mark passed")}
            </button>
          )}
          <span className="dp-spacer" />
          {page.status === "published" && <a className="btn" href={"/" + page.slug} target="_blank" rel="noreferrer">Open live ↗</a>}
          {caps.publish && page.status !== "published" && <button className="btn pri" disabled={busy} onClick={onPublish}>Publish</button>}
          {caps.publish && page.status === "published" && <button className="btn" onClick={onUnpublish}>Unpublish</button>}
        </div>
      </div>
    </div>
  );
}

function PreviewBlock({ b }) {
  if (!b) return null;
  if (typeof b === "string") return <p>{b}</p>;
  switch (b.type) {
    case "h2": return <h2>{b.value}</h2>;
    case "h3": return <h3>{b.value}</h3>;
    case "p": return <p>{b.value}</p>;
    case "callout": return <div className="dp-callout">{b.value}</div>;
    case "ul": return <ul>{(b.items || []).map((t, i) => <li key={i}>{t}</li>)}</ul>;
    case "ol": return <ol>{(b.items || []).map((t, i) => <li key={i}>{t}</li>)}</ol>;
    case "faq": return <div className="dp-faq">{(b.items || []).map((x, i) => <div key={i}><b>{x.q}</b><div className="muted">{x.a}</div></div>)}</div>;
    case "cta": return <p><span className="dp-cta">{b.label || "Request a Quote"}</span></p>;
    default: return b.value ? <p>{b.value}</p> : null;
  }
}

function LinkCell({ onLink }) {
  const [v, setV] = useState("");
  return (
    <span className="linkcell">
      <input className="inp xs" placeholder="ASC0042" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && v.trim() && onLink(v)} />
      <button className="btn sm" disabled={!v.trim()} onClick={() => onLink(v)}>Link</button>
    </span>
  );
}

function FactRow({ f, canEdit, onSave }) {
  const [value, setValue] = useState(f.value || "");
  const dirty = value !== (f.value || "");
  return (
    <tr>
      <td className="mono">{f.key}</td>
      <td className="muted" style={{ maxWidth: 240 }}>{f.claim}</td>
      <td>{canEdit ? <input className="inp" value={value} onChange={(e) => setValue(e.target.value)} placeholder="—" /> : <span>{f.value || "—"}</span>}</td>
      <td>{canEdit ? <input type="checkbox" checked={!!f.verified} onChange={(e) => onSave(f.key, { verified: e.target.checked })} /> : (f.verified ? "✓" : "—")}</td>
      <td>{canEdit ? <input type="checkbox" checked={!!f.public_use_allowed} onChange={(e) => onSave(f.key, { public_use_allowed: e.target.checked })} /> : (f.public_use_allowed ? "✓" : "—")}</td>
      <td>{canEdit && dirty && <button className="btn sm pri" onClick={() => onSave(f.key, { value })}>save</button>}</td>
    </tr>
  );
}

const CSS = `
.seoa{--bg:#0b1322;--panel:#111c30;--line:#223049;--text:#e9eef7;--muted:#93a3c0;--accent:#4ea3ff;
  min-height:100vh;background:var(--bg);color:var(--text);font-family:var(--font-sans),system-ui,sans-serif;padding:22px;max-width:1120px;margin:0 auto}
.seoa-top{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:14px}
.seoa-eye{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);font-weight:700}
.seoa-top h1{font-size:24px;margin:4px 0 0}
.seoa-tabs{display:flex;gap:4px;flex-wrap:wrap}
.seoa-tabs button{background:none;border:1px solid var(--line);color:var(--muted);border-radius:8px;padding:7px 13px;font-size:13px;cursor:pointer;text-transform:capitalize}
.seoa-tabs button.on{background:var(--accent);color:#06101f;border-color:var(--accent);font-weight:600}
.seoa-msg{margin:12px 0 0;background:#13233c;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:10px 14px;font-size:13.5px}
section{margin-top:18px}
.seoa-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.k{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
.k b{font-size:26px;display:block;line-height:1}.k span{color:var(--muted);font-size:12px;display:block;margin-top:6px}
.k.warn b{color:#f2c14e}
.seoa-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:14px}
.seoa-card h3{margin:0 0 6px;font-size:15px}
.muted{color:var(--muted)} .mono{font-family:var(--font-mono),monospace;font-size:12.5px}
.seoa-gen{display:flex;gap:8px;align-items:center;margin:4px 0 12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px}
.inp.grow{flex:1;max-width:none}
.seoa-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px;flex-wrap:wrap}
.tblw{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;background:#0e1829;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:10px 12px;border-bottom:1px solid var(--line)}
.tbl td{padding:9px 12px;border-bottom:1px solid #1a2639;vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tier{font-weight:700;font-size:12px}
.chks{white-space:nowrap}.chip{display:inline-block;font-size:10.5px;border:1px solid var(--line);color:var(--muted);border-radius:5px;padding:2px 6px;margin-right:4px;font-family:var(--font-mono),monospace}
.chip.ok{color:#9ff0c4;border-color:#235740;background:rgba(74,208,138,.08)}
.sel,.inp{background:#0c1626;border:1px solid var(--line);color:var(--text);border-radius:7px;padding:5px 8px;font-size:12.5px;font-family:inherit}
.inp{width:100%;max-width:220px}
.acts{white-space:nowrap}
.btn{background:#17263f;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:7px 13px;font-size:13px;cursor:pointer;font-family:inherit}
.btn.sm{padding:5px 10px;font-size:12px;margin-left:5px}
.btn.pri{background:var(--accent);color:#06101f;border-color:var(--accent);font-weight:600}
.btn:disabled{opacity:.5;cursor:default}
.linkcell{display:inline-flex;gap:6px;align-items:center}
.inp.xs{width:88px;max-width:88px;padding:4px 7px;font-size:12px;text-transform:uppercase}
.linkbtn{background:none;border:none;color:#cfe0ff;font:inherit;font-weight:600;cursor:pointer;padding:0;text-align:left}
.linkbtn:hover{color:#fff;text-decoration:underline}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#4ad08a;margin-left:7px;vertical-align:middle}
/* detail panel */
.dp-overlay{position:fixed;inset:0;z-index:9000;background:rgba(5,9,18,.6);backdrop-filter:blur(3px);display:flex;justify-content:center;align-items:flex-start;padding:28px 16px;overflow:auto}
.dp{width:min(820px,100%);background:var(--bg);border:1px solid var(--line);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden;margin:auto}
.dp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line);background:var(--panel)}
.dp-meta2{font-size:12.5px;color:var(--muted);margin-top:5px}
.dp-x{background:none;border:1px solid var(--line);color:var(--muted);border-radius:8px;width:30px;height:30px;cursor:pointer;flex:none}
.dp-body{padding:18px;max-height:62vh;overflow:auto}
.dp-notes{background:#13233c;border:1px solid var(--line);border-radius:10px;padding:10px 13px;font-size:12.5px;color:#bcd0ef;white-space:pre-wrap;margin-bottom:16px}
.dp-notes.warn{border-left:3px solid #f2c14e;background:rgba(242,193,78,.08)}
.dp-edit{display:grid;gap:10px;margin-bottom:18px}
.dp-edit label{display:grid;gap:4px;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.dp-edit .inp{max-width:none;width:100%;font-size:13.5px}
.dp-preview{border-top:1px solid var(--line);padding-top:16px;color:#dfe8f6;font-size:14.5px;line-height:1.6}
.dp-prev-h1{font-size:24px;font-weight:700;letter-spacing:-.01em;margin-bottom:12px;color:#fff}
.dp-preview h2{font-size:18px;margin:20px 0 8px;color:#fff}.dp-preview h3{font-size:15px;margin:16px 0 6px;color:#eaf1fb}
.dp-preview p{margin:0 0 12px}.dp-preview ul,.dp-preview ol{padding-left:20px;margin:0 0 12px}.dp-preview li{margin:5px 0}
.dp-callout{background:var(--panel);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:10px 14px;margin:0 0 12px}
.dp-faq>div{border-top:1px solid var(--line);padding:10px 0}.dp-faq b{color:#fff}
.dp-cta{display:inline-block;background:var(--accent);color:#06101f;font-weight:600;border-radius:8px;padding:8px 16px}
.dp-foot{display:flex;gap:8px;align-items:center;padding:14px 18px;border-top:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
.dp-spacer{flex:1}
@media(max-width:720px){.seoa-kpis{grid-template-columns:1fr 1fr}}
`;
