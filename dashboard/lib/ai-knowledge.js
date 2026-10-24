// Phase 3.1 — approved-knowledge (FAQ) retrieval. PURE + deterministic (0-token): given a question and a set
// of ALREADY-APPROVED support articles (admin/manager authored — see support_articles / getSupportArticles),
// score them by keyword overlap and return the single best match ONLY when it clears a relevance threshold.
// If nothing is a strong match it returns null — the assistant then says "I don't have that" rather than
// inventing an answer. The caller injects the articles (audience-scoped), so this file never touches the DB
// and is fully unit-testable; audience restriction (who may see which library) is the caller's job, proven by
// the no-leak test. Snippet text is derived straight from the stored article body — never generated.

const STOP = new Set((
  "the a an of to for and or is are am was were be been being do does did can could would should will " +
  "how what when where why which who whom whose this that these those it its my our your their his her " +
  "with on in at as by from into onto about over under out up down off again then than too very just " +
  "i you we they he she me us them not no yes if so but of'f have has had get got need want please " +
  "there here any some all more most much many one two"
).split(/\s+/).filter(Boolean));

// Lowercase → alphanumeric word tokens ≥3 chars, minus stopwords. Deduped (a term counts once).
export function tokenize(s) {
  const words = String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  return [...new Set(words.filter((w) => w.length >= 3 && !STOP.has(w)))];
}

// Strip a stored body to plain words for both scoring and the snippet. Guide bodies are JSON ({steps:[...]});
// we reduce them to readable text so a guide can still match and show a sensible snippet.
export function bodyText(article) {
  const raw = String(article?.body || "");
  if ((article?.kind || "article") === "guide") {
    try { const g = JSON.parse(raw);
      const parts = [g.intro, ...((g.steps || []).map((s) => [s.title, s.caption, s.text].filter(Boolean).join(" ")))].filter(Boolean);
      return parts.join(" ").replace(/\s+/g, " ").trim();
    } catch { /* fall through to raw */ }
  }
  return raw.replace(/<[^>]+>/g, " ").replace(/[#*_`>|-]+/g, " ").replace(/\s+/g, " ").trim();
}

// Overlap score for one article against the query terms. Title hits weigh most, then category, then body.
// Each query term scores once (its best location), so a long body can't inflate the score.
export function scoreArticle(article, terms) {
  const inTitle = new Set(tokenize(article.title));
  const inCat = new Set(tokenize(article.category));
  const inBody = new Set(tokenize(bodyText(article)));
  let score = 0, matched = 0;
  for (const t of terms) {
    let hit = 0;
    if (inTitle.has(t)) hit = 3;
    else if (inCat.has(t)) hit = 2;
    else if (inBody.has(t)) hit = 1;
    if (hit) { score += hit; matched++; }
  }
  return { score, matched };
}

// A short, plain-text snippet from the body around the first matched term (so the answer shows WHY it matched),
// capped. Falls back to the body's opening. Never invented — it's a slice of the approved article.
export function snippetOf(article, terms, max = 220) {
  const text = bodyText(article);
  if (!text) return "";
  const low = text.toLowerCase();
  let at = -1;
  for (const t of terms) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  let start = at > 60 ? text.lastIndexOf(" ", at - 40) + 1 : 0;
  if (start < 0) start = 0;
  let s = text.slice(start, start + max).trim();
  if (start > 0) s = "…" + s;
  if (text.length > start + max) s = s.replace(/\s+\S*$/, "") + "…";
  return s;
}

// Find the single best approved article for a question, or null when nothing clears the bar.
// articles: [{ id, title, body, category, kind, pinned, audience? }] — injected by the caller (audience-scoped).
// Returns { id, title, category, kind, audience, score, matched, snippet } | null.
export function findKnowledge(query, { articles = [] } = {}) {
  const terms = tokenize(query);
  if (!terms.length) return null;
  let best = null;
  for (const a of articles) {
    const { score, matched } = scoreArticle(a, terms);
    if (!matched) continue;
    // Strong = at least two matched terms, OR a single-term query that hit the title/category (score ≥ 2).
    const strong = matched >= 2 || (terms.length === 1 && score >= 2);
    if (!strong) continue;
    const pinned = a.pinned ? 1 : 0;
    if (!best || score > best.score || (score === best.score && pinned > best.pinned)) best = { a, score, matched, pinned };
  }
  if (!best) return null;
  // Final guard: a multi-term query must cover a reasonable fraction of its terms, so one incidental word in a
  // long article doesn't "answer" an unrelated question.
  const coverage = best.matched / terms.length;
  if (terms.length >= 3 && best.matched < 2 && coverage < 0.34) return null;
  const a = best.a;
  return { id: a.id, title: a.title, category: a.category, kind: a.kind || "article", audience: a.audience || null, score: best.score, matched: best.matched, snippet: snippetOf(a, terms) };
}
