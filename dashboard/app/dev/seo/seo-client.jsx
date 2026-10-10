"use client";
import { useState } from "react";
import { seedPlanAction, createPageAction, setStatusAction, publishPageAction, unpublishPageAction, upsertFactAction } from "./actions";

const STATUSES = ["opportunity", "researching", "brief", "writing", "fact_check", "seo_qa", "needs_review", "approved", "published", "monitoring", "refresh", "blocked"];
const TIER_C = { P0: "#ff7a7a", P1: "#f2c14e", P2: "#4ea3ff", P3: "#8795b4" };

export default function SeoClient({ data, caps }) {
  const [tab, setTab] = useState("overview");
  const [pages, setPages] = useState(data.pages);
  const [facts, setFacts] = useState(data.facts);
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
  async function generate(payload, spinnerId) {
    setGen(spinnerId); setMsg("Writing draft with AI… this can take up to a minute.");
    const r = await fetch("/api/seo-generate", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then((x) => x.json()).catch((e) => ({ error: String(e) }));
    setGen(null);
    if (!r?.ok) return flash("⚠ " + (r?.error || "generation failed"));
    setPages((ps) => { const i = ps.findIndex((p) => p.id === r.page.id); return i >= 0 ? ps.map((p) => (p.id === r.page.id ? r.page : p)) : [r.page, ...ps]; });
    const flags = (r.flags || []).length ? ` · ⚠ ${r.flags.length} fact(s) to verify` : "";
    flash(`Draft ready: “${r.page.title}” via ${r.engine}${flags}. Review → set fact-check → publish.`);
  }
  function genFromPrompt() { const t = prompt.trim(); if (!t) return; setPrompt(""); generate({ topic: t, page_type: promptType }, "new"); }

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
            <span className="muted">{pages.length} pages · drafts land at “needs review”; the publish gate still applies</span>
            {caps.edit && <button className="btn" onClick={newPage}>+ Blank page</button>}
          </div>
          <div className="tblw"><table className="tbl">
            <thead><tr><th>Title</th><th>Slug</th><th>Type</th><th>Pri</th><th>Status</th><th>Checks</th><th>Actions</th></tr></thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.title || <span className="muted">untitled</span>}</b></td>
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
          <div className="tblw"><table className="tbl">
            <thead><tr><th>Client</th><th>Industry</th><th>City/State</th><th>Project</th><th>Status</th><th>Name OK</th><th></th></tr></thead>
            <tbody>
              {data.cases.map((c) => (
                <tr key={c.id}><td><b>{c.client}</b></td><td className="muted">{c.industry}</td>
                  <td className="muted">{[c.city, c.state].filter(Boolean).join(", ") || "—"}</td>
                  <td className="mono">{c.project_access_id || "—"}</td>
                  <td><span className={"chip " + (c.status === "verified" ? "ok" : "")}>{c.status}</span></td>
                  <td>{c.permission_to_name_client ? "✓" : "—"}</td>
                  <td className="acts">{caps.edit && <button className="btn sm" disabled={gen === "cs" + c.id} onClick={() => { setTab("content"); generate({ caseStudyId: c.id }, "cs" + c.id); }}>{gen === "cs" + c.id ? "writing…" : "draft study"}</button>}</td></tr>
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
@media(max-width:720px){.seoa-kpis{grid-template-columns:1fr 1fr}}
`;
