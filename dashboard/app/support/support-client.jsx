"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import ConfirmDialog from "../components/confirm-dialog";
import GuideWalkthrough from "./guide-walkthrough";
import { createSupportArticleAction, updateSupportArticleAction, archiveSupportArticleAction } from "./actions";

// Parse a guide-kind article's body (JSON: {intro, steps[]}); returns null if it isn't a valid guide.
function parseGuide(a) {
  if (a?.kind !== "guide") return null;
  try { const g = JSON.parse(a.body); return Array.isArray(g?.steps) && g.steps.length ? g : null; }
  catch { return null; }
}

// A collapsible band of walkthroughs for one device. Opens showing the first three — enough to see
// what's here without a wall of ten — with "Show more" for the rest. Renders nothing when empty,
// so a search that matches no guides doesn't leave two empty shells behind.
function GuideSection({ title, subtitle, items, icon, canEdit, onStart, onArchive }) {
  const [open, setOpen] = useState(true);
  const [all, setAll]   = useState(false);
  if (!items.length) return null;

  const TOP = 3;
  const shown = all ? items : items.slice(0, TOP);
  const rest  = items.length - TOP;

  return (
    <div className="sup-group sup-sec">
      <button className="sup-sec-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="sup-sec-ic">{icon}</span>
        <span className="sup-sec-txt">
          <span className="sup-sec-title">{title}</span>
          <span className="sup-sec-sub">{subtitle}</span>
        </span>
        <span className="sup-sec-count">{items.length}</span>
        <span className={`sup-sec-chev${open ? " on" : ""}`}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </span>
      </button>

      {open && (
        <div className="panel sup-panel">
          {shown.map((a) => {
            const g = parseGuide(a);
            return (
              <div className="sup-row sup-guide-row" key={a.id}>
                <div className="sup-guide">
                  <div className="sup-guide-txt">
                    <div className="sup-guide-title">{a.pinned && <span className="sup-pin"><PinIcon /></span>}{a.title}</div>
                  </div>
                  <span className="sup-steps">{g.steps.length} steps</span>
                  <button className="sup-guide-start" onClick={() => onStart(a)}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>
                    Start
                  </button>
                  {canEdit && (
                    <button className="sup-guide-arch" title="Archive" onClick={() => onArchive(a)}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {rest > 0 && (
            <button className="sup-more" onClick={() => setAll((v) => !v)}>
              {all ? "Show less" : `Show ${rest} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PinIcon() {
  return <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="M14 4v6l3 3v2h-5v5l-1 1-1-1v-5H4v-2l3-3V4H6V2h12v2z"/></svg>;
}

export default function SupportClient({ user, alerts, articles: initial, qrProjects = [] }) {
  const canEdit = ["admin", "manager"].includes(user?.role);
  const [articles, setArticles] = useState(initial || []);
  const [query, setQuery]   = useState("");
  const [cat, setCat]       = useState("all");
  const [openId, setOpenId] = useState(null);
  const [guide, setGuide]   = useState(null);    // { title, steps } — active walkthrough
  const [editor, setEditor] = useState(null);   // null | {} (new) | article (edit)
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [pending, startTx]  = useTransition();
  const router = useRouter();

  const categories = useMemo(
    () => [...new Set(articles.map((a) => a.category).filter(Boolean))].sort(),
    [articles]
  );
  // Chips filter articles, so they must list article categories only — guide categories in that
  // row filtered to nothing visible and looked broken.
  const faqCount    = useMemo(() => articles.filter((a) => !parseGuide(a)).length, [articles]);
  const articleCats = useMemo(
    () => [...new Set(articles.filter((a) => !parseGuide(a)).map((a) => a.category).filter(Boolean))].sort(),
    [articles]
  );
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => articles
    .filter((a) => cat === "all" || a.category === cat)
    .filter((a) => !q || a.title.toLowerCase().includes(q) || (a.body || "").toLowerCase().includes(q) || (a.category || "").toLowerCase().includes(q)),
    [articles, cat, q]);

  // Guides are split out of the category grouping: they're walkthroughs, not reading, and they
  // divide by which device the customer is holding rather than by topic.
  const guides = useMemo(
    () => articles.filter((a) => parseGuide(a))
      .filter((a) => !q || a.title.toLowerCase().includes(q) || (a.body || "").toLowerCase().includes(q)),
    [articles, q]
  );
  const mobileGuides = useMemo(() => guides.filter((a) => (parseGuide(a).surface || "mobile") === "mobile"), [guides]);
  const nvrGuides    = useMemo(() => guides.filter((a) => parseGuide(a).surface === "nvr"), [guides]);

  // Group the remaining (FAQ) articles by category.
  const groups = useMemo(() => {
    const m = new Map();
    for (const a of visible) {
      if (parseGuide(a)) continue;
      if (!m.has(a.category)) m.set(a.category, []); m.get(a.category).push(a);
    }
    return [...m.entries()];
  }, [visible]);

  function refresh() { router.refresh(); }

  function saveArticle(form) {
    startTx(async () => {
      const r = editor?.id
        ? await updateSupportArticleAction(editor.id, form)
        : await createSupportArticleAction(form);
      if (r?.ok) {
        setArticles((prev) => {
          if (editor?.id) return prev.map((a) => (a.id === r.article.id ? r.article : a));
          return [r.article, ...prev];
        });
        setEditor(null);
        refresh();
      }
    });
  }
  function confirmArchive() {
    const id = archiveTarget?.id;
    setArchiveTarget(null);
    if (!id) return;
    startTx(async () => {
      const r = await archiveSupportArticleAction(id);
      if (r?.ok) { setArticles((prev) => prev.filter((a) => a.id !== id)); refresh(); }
    });
  }

  return (
    <AdminShell user={user} alerts={alerts} active="support">
      <div className="apx-wrap">
        <div className="page-head sup-head">
          <div>
            <h1>Support</h1>
            <div className="ph-sub">{guides.length} guide{guides.length === 1 ? "" : "s"} · {faqCount} article{faqCount === 1 ? "" : "s"}</div>
          </div>
          {canEdit && (
            <button className="sup-add" onClick={() => setEditor({})}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Add
            </button>
          )}
        </div>

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 340 }} placeholder="Search guides and articles…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <GuideSection
          title="Phone &amp; App"
          subtitle="Setting up and using Annke Vision"
          items={mobileGuides}
          canEdit={canEdit}
          onStart={(a) => setGuide({ title: a.title, ...parseGuide(a) })}
          onArchive={setArchiveTarget}
          icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>}
        />
        <GuideSection
          title="Recorder (NVR)"
          subtitle="Settings on the box itself"
          items={nvrGuides}
          canEdit={canEdit}
          onStart={(a) => setGuide({ title: a.title, ...parseGuide(a) })}
          onArchive={setArchiveTarget}
          icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>}
        />

        {groups.length > 0 && (
          <div className="sup-artbar">
            <div className="sup-artbar-t">Articles</div>
            <div className="filters">
              <button className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>All <span style={{ opacity: .6 }}>{faqCount}</span></button>
              {articleCats.map((c) => (
                <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c} <span style={{ opacity: .6 }}>{articles.filter((a) => !parseGuide(a) && a.category === c).length}</span></button>
              ))}
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q || cat !== "all" ? "Nothing matches." : "No articles yet — add the first one."}</div></div>
        ) : groups.map(([category, items]) => (
          <div className="sup-group" key={category}>
            <div className="sup-cat">{category}</div>
            <div className="panel sup-panel">
              {items.map((a) => (
                <div className={`sup-row${openId === a.id ? " open" : ""}`} key={a.id}>
                  <button className="sup-q" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                    {a.pinned && <span className="sup-pin" title="Pinned"><PinIcon /></span>}
                    <span className="sup-title">{a.title}</span>
                    <span className="sup-chev">{openId === a.id ? "▲" : "▼"}</span>
                  </button>
                  {openId === a.id && (
                    <div className="sup-a">
                      <div className="sup-body">{a.body || <span className="sup-muted">No content yet.</span>}</div>
                      {canEdit && (
                        <div className="sup-tools">
                          <button className="sup-tool" onClick={() => setEditor(a)}>
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                            Edit
                          </button>
                          <button className="sup-tool sup-tool-arch" onClick={() => setArchiveTarget(a)}>
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>
                            Archive
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {guide && (
        <GuideWalkthrough title={guide.title} intro={guide.intro} steps={guide.steps} flow={guide.flow} projects={qrProjects} loggedIn onClose={() => setGuide(null)} />
      )}

      {editor && (
        <ArticleEditor
          article={editor}
          categories={categories}
          busy={pending}
          onSave={saveArticle}
          onCancel={() => setEditor(null)}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        title="Archive this article?"
        message={<>“{archiveTarget?.title}” will be moved to <strong>Archives</strong>. You can restore it anytime.</>}
        confirmLabel="Archive"
        busy={pending}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />

      <style>{CSS}</style>
    </AdminShell>
  );
}

function ArticleEditor({ article, categories, busy, onSave, onCancel }) {
  const [title, setTitle]     = useState(article.title || "");
  const [category, setCategory] = useState(article.category || (categories[0] || "General"));
  const [body, setBody]       = useState(article.body || "");
  const [pinned, setPinned]   = useState(!!article.pinned);
  const isNew = !article.id;

  return (
    <div className="sup-modal-bg" onClick={(e) => { if (e.target.classList.contains("sup-modal-bg")) onCancel(); }}>
      <div className="sup-modal">
        <div className="sup-modal-head">{isNew ? "New article" : "Edit article"}</div>
        <label className="sup-lbl">Title</label>
        <input className="sup-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A clear question or topic…" autoFocus />
        <label className="sup-lbl">Category</label>
        <input className="sup-input" list="sup-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Billing" />
        <datalist id="sup-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <label className="sup-lbl">Answer</label>
        <textarea className="sup-input sup-textarea" value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="Write the answer…" />
        <label className="sup-check"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin to top</label>
        <div className="sup-modal-actions">
          <button className="sup-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="sup-save" disabled={busy || !title.trim()} onClick={() => onSave({ title, category, body, pinned })}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.apx .sup-sec{margin-bottom:14px}
.apx .sup-steps{font-size:.75rem;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.apx .sup-artbar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:22px 0 8px;padding-top:16px;border-top:1px solid var(--line)}
.apx .sup-artbar-t{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1rem;color:var(--ink)}
/* Archive is an admin escape hatch, not a primary action — it fades in on hover. */
.apx .sup-guide-row .sup-guide-arch{opacity:0;transition:opacity .14s}
.apx .sup-guide-row:hover .sup-guide-arch,.apx .sup-guide-arch:focus-visible{opacity:1}
.apx .sup-sec-head{display:flex;align-items:center;gap:11px;width:100%;padding:11px 4px;background:none;border:none;cursor:pointer;text-align:left;font-family:inherit}
.apx .sup-sec-ic{width:32px;height:32px;flex-shrink:0;border-radius:9px;display:grid;place-items:center;background:#f8f0e0;color:#8a6d2f}
.apx .sup-sec-txt{display:flex;flex-direction:column;flex:1;min-width:0}
.apx .sup-sec-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1rem;color:var(--ink)}
.apx .sup-sec-sub{font-size:.76rem;color:var(--muted)}
.apx .sup-sec-count{font-size:.75rem;font-weight:800;color:var(--gold-deep,#b08f4f);background:#f8f0e0;border-radius:20px;padding:2px 9px}
.apx .sup-sec-chev{color:var(--muted);display:grid;place-items:center;transition:transform .16s}
.apx .sup-sec-chev.on{transform:rotate(180deg)}
.apx .sup-more{width:100%;padding:11px;border:none;border-top:1px solid var(--line);background:none;color:var(--gold-deep,#b08f4f);font-weight:700;font-size:.82rem;cursor:pointer;font-family:inherit}
.apx .sup-more:hover{background:var(--bg-soft,#fafaf8)}
.apx .sup-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.apx .sup-add{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 16px;border:none;border-radius:9px;background:var(--gold,#C9A96E);color:var(--ink);font-family:inherit;font-size:.85rem;font-weight:700;cursor:pointer;white-space:nowrap}
.apx .sup-add:hover{background:var(--gold-deep,#b08f4f);color:#fff}
.apx .sup-group{margin-bottom:18px}
.apx .sup-cat{font-family:'Bricolage Grotesque',sans-serif;font-size:.74rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 8px 2px}
.apx .sup-panel{padding:0;overflow:hidden}
.apx .sup-row{border-bottom:1px solid var(--line)}
.apx .sup-row:last-child{border-bottom:none}
.apx .sup-q{width:100%;display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff;border:none;cursor:pointer;font-family:inherit;text-align:left;transition:background .12s}
.apx .sup-q:hover{background:var(--bg-soft)}
.apx .sup-row.open .sup-q{background:var(--bg-soft)}
.apx .sup-pin{display:inline-flex;color:var(--gold-deep,#b08f4f);flex-shrink:0;vertical-align:-2px;margin-right:5px}
/* guide (interactive walkthrough) row */
.apx .sup-guide-row{background:linear-gradient(100deg,#faf4e8,#fff)}
.apx .sup-guide{display:flex;align-items:center;gap:12px;padding:13px 16px}
.apx .sup-guide-ic{width:38px;height:38px;flex-shrink:0;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#C9A96E,#b08f4f);box-shadow:0 6px 14px -5px rgba(176,143,79,.6)}
.apx .sup-guide-txt{flex:1;min-width:0}
.apx .sup-guide-title{font-size:.94rem;font-weight:700;color:var(--ink);display:flex;align-items:center}
.apx .sup-guide-sub{font-size:.76rem;color:var(--gold-deep,#b08f4f);font-weight:600;margin-top:1px}
.apx .sup-guide-start{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;border:none;border-radius:9px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;font-family:inherit;font-size:.84rem;font-weight:700;cursor:pointer;flex-shrink:0;box-shadow:0 8px 18px -8px rgba(176,143,79,.7);transition:transform .12s,filter .12s}
.apx .sup-guide-start:hover{filter:brightness(1.06);transform:translateY(-1px)}
.apx .sup-guide-arch{width:34px;height:34px;flex-shrink:0;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--muted);cursor:pointer;transition:all .12s}
.apx .sup-guide-arch:hover{border-color:rgba(231,76,60,.4);color:#c0392b;background:rgba(231,76,60,.06)}
.apx .sup-title{flex:1;font-size:.92rem;font-weight:600;color:var(--ink)}
.apx .sup-chev{font-size:.66rem;color:var(--muted);flex-shrink:0}
.apx .sup-a{padding:0 16px 16px;animation:supIn .16s ease}
@keyframes supIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.apx .sup-body{font-size:.9rem;line-height:1.65;color:var(--slate,#2C3347);white-space:pre-wrap}
.apx .sup-muted{color:var(--muted)}
.apx .sup-tools{display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
.apx .sup-tool{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 11px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--muted);font-family:inherit;font-size:.76rem;font-weight:600;cursor:pointer;transition:all .12s}
.apx .sup-tool:hover{border-color:var(--gold,#C9A96E);color:var(--gold-deep,#b08f4f);background:#faf4e8}
.apx .sup-tool-arch:hover{border-color:rgba(231,76,60,.4);color:#c0392b;background:rgba(231,76,60,.06)}
/* editor modal */
.apx .sup-modal-bg{position:fixed;inset:0;background:rgba(14,19,32,.45);backdrop-filter:blur(3px);display:grid;place-items:center;z-index:3000;padding:20px}
.apx .sup-modal{background:#fff;border-radius:16px;width:100%;max-width:520px;padding:22px 22px 20px;box-shadow:0 24px 60px rgba(0,0,0,.3);max-height:88vh;overflow:auto}
.apx .sup-modal-head{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.15rem;color:var(--ink);margin-bottom:14px}
.apx .sup-lbl{display:block;font-size:.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin:12px 0 5px}
.apx .sup-input{width:100%;border:1px solid var(--line);border-radius:9px;background:var(--bg-soft);color:var(--ink);padding:10px 12px;font-family:inherit;font-size:.9rem;outline:none;transition:border-color .15s,background .15s}
.apx .sup-input:focus{border-color:var(--gold,#C9A96E);background:#fff}
.apx .sup-textarea{resize:vertical;line-height:1.6}
.apx .sup-check{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:.85rem;color:var(--slate,#2C3347);cursor:pointer}
.apx .sup-check input{width:15px;height:15px;accent-color:var(--gold-deep,#b08f4f);cursor:pointer}
.apx .sup-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
.apx .sup-cancel{background:#fff;border:1.5px solid var(--line);border-radius:9px;padding:9px 16px;font-size:.85rem;font-weight:600;font-family:inherit;cursor:pointer;color:var(--ink)}
.apx .sup-save{background:var(--gold,#C9A96E);border:none;border-radius:9px;padding:9px 20px;font-size:.85rem;font-weight:700;font-family:inherit;cursor:pointer;color:var(--ink)}
.apx .sup-save:hover:not(:disabled){background:var(--gold-deep,#b08f4f);color:#fff}
.apx .sup-save:disabled,.apx .sup-cancel:disabled{opacity:.5;cursor:default}
`;
