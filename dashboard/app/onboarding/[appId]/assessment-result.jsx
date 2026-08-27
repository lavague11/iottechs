"use client";

import { useState } from "react";
import { gradeAssessmentAction } from "../../assessment/[appId]/actions";

const FLAG_LABEL = { integrity: "Integrity", safety: "Safety", process: "Process", communication: "Communication", technical: "Technical" };

export default function AssessmentResult({ appId, assessment }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const a = assessment || null;

  async function grade() {
    setBusy(true); setErr("");
    try {
      const r = await gradeAssessmentAction(appId);
      if (r?.ok) location.reload();
      else setErr(r?.error === "no-key" ? "Add ANTHROPIC_API_KEY in Development ▸ API Keys." : r?.error === "no-submission" ? "No submission yet." : "Grading failed — try again.");
    } catch { setErr("Grading failed — try again."); }
    setBusy(false);
  }

  if (!a || !a.status) return (
    <div className="ar"><div className="ar-h"><h3>Assessment</h3></div>
      <div className="ar-empty">Not started. The candidate takes it from their application link.</div><style>{CSS}</style></div>
  );

  const graded = a.status === "graded";
  const tier = a.tier || null;

  return (
    <div className="ar">
      <div className="ar-h">
        <h3>Assessment</h3>
        {graded
          ? <button className="ar-btn ghost" onClick={grade} disabled={busy}>{busy ? "Re-grading…" : "Re-grade"}</button>
          : <button className="ar-btn" onClick={grade} disabled={busy}>{busy ? "Grading…" : "Run AI grading"}</button>}
      </div>
      {err && <div className="ar-err">{err}</div>}

      {!graded ? (
        <div className="ar-pending">
          <div className="ar-auto"><span className="ar-auto-n">{a.autoScore ?? "—"}</span><span>/80 auto</span></div>
          <p>Submitted {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : ""}. Explanations &amp; profile aren&rsquo;t graded yet — run AI grading for the full read.</p>
        </div>
      ) : (
        <>
          <div className="ar-top">
            <div className="ar-score"><span className="ar-score-n">{a.score}</span><span className="ar-score-d">/100</span></div>
            <div className={`ar-tier t-${tier?.key}`}><b>Tier {tier?.key}</b><span>{tier?.label}</span></div>
          </div>

          {(a.flags?.critical?.length || a.flags?.yellow?.length) ? (
            <div className="ar-flags">
              {a.flags.critical.map((f) => <span key={f} className="ar-flag red">⚠ {FLAG_LABEL[f] || f} review</span>)}
              {a.flags.yellow.map((f) => <span key={f} className="ar-flag yellow">{FLAG_LABEL[f] || f} note</span>)}
            </div>
          ) : <div className="ar-flags"><span className="ar-flag none">No flags</span></div>}

          {a.profile?.summary && <p className="ar-sum">{a.profile.summary}</p>}

          <div className="ar-cats">
            {(a.categories || a.profile?.categories || []).map((c) => (
              <div className="ar-cat" key={c.key}>
                <div className="ar-cat-h"><span>{c.label}</span><span className="ar-cat-s">{c.score}<i>/{c.max}</i> · {c.band}</span></div>
                <div className="ar-bar"><i style={{ width: `${Math.round((c.score / c.max) * 100)}%` }} className={`b-${(c.band || "").toLowerCase().replace(/[^a-z]/g, "")}`} /></div>
                {c.note && <div className="ar-cat-note">{c.note}</div>}
              </div>
            ))}
          </div>

          {a.profile?.traits && Object.keys(a.profile.traits).length > 0 && (
            <div className="ar-traits">
              {Object.entries(a.profile.traits).map(([k, v]) => (
                <div className="ar-trait" key={k}><span>{k}</span><b className={`lv-${String(v).toLowerCase().replace(/[^a-z]/g, "")}`}>{v}</b></div>
              ))}
            </div>
          )}

          {a.profile?.recommendedLevel && <div className="ar-rec">Recommended level: <b>{a.profile.recommendedLevel}</b>{tier?.next ? ` · ${tier.next}` : ""}</div>}

          {a.profile?.interviewQuestions?.length > 0 && (
            <div className="ar-iq">
              <div className="ar-iq-h">Phone-interview questions (from weak areas)</div>
              <ul>{a.profile.interviewQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}
        </>
      )}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.ar{--gold-deep:#A8842F;--green:#2E7D5B;--red:#C4553D;--amber:#B0801F;--line:#E4E4DF;--muted:#787D84;--ink:#101418;--paper:#F4F4F2;
  border:1px solid var(--line);border-radius:14px;background:#fff;padding:16px 18px;font-family:var(--font-sans,'Instrument Sans',sans-serif)}
.ar-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.ar-h h3{margin:0;font-size:1.05rem;font-weight:800;color:var(--ink)}
.ar-btn{background:var(--gold-deep);color:#fff;border:none;border-radius:8px;padding:8px 14px;font:inherit;font-weight:700;font-size:.82rem;cursor:pointer}
.ar-btn.ghost{background:#fff;color:var(--gold-deep);border:1px solid var(--line)}
.ar-btn:disabled{opacity:.5;cursor:default}
.ar-empty,.ar-pending p{color:var(--muted);font-size:.9rem}
.ar-err{background:#F6E7E2;color:var(--red);border-radius:8px;padding:9px 12px;font-size:.85rem;font-weight:600;margin-bottom:10px}
.ar-pending{display:flex;gap:14px;align-items:center}
.ar-auto{flex:none;text-align:center}.ar-auto-n{font-size:1.7rem;font-weight:800;color:var(--ink)}.ar-auto span:last-child{display:block;font-size:.7rem;color:var(--muted)}
.ar-top{display:flex;align-items:center;gap:16px;margin-bottom:12px}
.ar-score{display:flex;align-items:baseline}
.ar-score-n{font-size:2.6rem;font-weight:800;letter-spacing:-.03em;color:var(--ink);line-height:1}
.ar-score-d{font-size:1rem;color:var(--muted);margin-left:2px}
.ar-tier{border-radius:10px;padding:8px 14px;display:flex;flex-direction:column;gap:1px}
.ar-tier b{font-size:.95rem}.ar-tier span{font-size:.76rem;opacity:.85}
.ar-tier.t-A,.ar-tier.t-B{background:#E6F0EA;color:var(--green)}
.ar-tier.t-C{background:#F6EEDC;color:var(--amber)}
.ar-tier.t-D,.ar-tier.t-F{background:#F6E7E2;color:var(--red)}
.ar-flags{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}
.ar-flag{font-size:.72rem;font-weight:700;padding:4px 10px;border-radius:999px}
.ar-flag.red{background:#F6E7E2;color:var(--red)}
.ar-flag.yellow{background:#F6EEDC;color:var(--amber)}
.ar-flag.none{background:#E6F0EA;color:var(--green)}
.ar-sum{font-size:.9rem;color:var(--ink);line-height:1.5;margin:0 0 14px;padding:10px 12px;background:var(--paper);border-radius:9px}
.ar-cats{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
.ar-cat-h{display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:4px}
.ar-cat-h span:first-child{color:var(--ink);font-weight:600}
.ar-cat-s{color:var(--muted);font-variant-numeric:tabular-nums}.ar-cat-s i{font-style:normal;opacity:.6}
.ar-bar{height:7px;background:var(--paper);border-radius:5px;overflow:hidden}
.ar-bar i{display:block;height:100%;border-radius:5px;background:var(--gold-deep)}
.ar-bar .bexcellent{background:var(--green)}.ar-bar .bgood,.ar-bar .bstrong{background:var(--gold-deep)}
.ar-bar .bdeveloping,.ar-bar .btrainable,.ar-bar .bmixed{background:var(--amber)}
.ar-bar .bweak,.ar-bar .bhighrisk{background:var(--red)}
.ar-cat-note{font-size:.78rem;color:var(--muted);margin-top:4px}
.ar-traits{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 14px;margin-bottom:12px}
.ar-trait{display:flex;justify-content:space-between;font-size:.82rem;border-bottom:1px solid #F0EFEA;padding:3px 0}
.ar-trait span{color:var(--muted)}
.ar-trait b.lv-high,.ar-trait b.lv-moderatehigh{color:var(--green)}
.ar-trait b.lv-moderate{color:var(--amber)}
.ar-trait b.lv-low{color:var(--red)}
.ar-rec{font-size:.86rem;color:var(--ink);margin-bottom:12px}
.ar-iq-h{font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.ar-iq ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px}
.ar-iq li{font-size:.87rem;color:var(--ink);line-height:1.4}
`;
