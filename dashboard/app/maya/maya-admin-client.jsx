"use client";
import { useState } from "react";
import { mayaDashboardAction, mayaSetCapAction, mayaSetFlagAction, mayaResolveUnansweredAction, mayaSetBriefingHourAction, mayaConversationAction } from "./actions";

const money = (cents) => "$" + (Math.round((+cents || 0)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TABS = ["Health", "Settings", "Activity", "Training", "Conversations"];

export default function MayaAdminClient({ initial }) {
  const [tab, setTab] = useState("Health");
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const refresh = async () => { const r = await mayaDashboardAction().catch(() => null); if (r?.ok) setData(r); };

  const u = data.usage || {};
  const cap = u.capCents || 1000, spent = u.today?.cents || 0, pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;

  return (
    <main className="mya">
      <style>{CSS}</style>
      <header className="mya-head">
        <div>
          <h1>Maya</h1>
          <p className="mya-sub">Train, manage and watch the AI assistant.</p>
        </div>
        <span className={`mya-flag ${data.flags?.commands ? "on" : "off"}`}>{data.flags?.commands ? "Live" : "Off"}</span>
      </header>

      <nav className="mya-tabs">
        {TABS.map((t) => <button key={t} className={`mya-tab${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
      </nav>

      {tab === "Health" && (
        <section className="mya-grid">
          <div className="mya-card mya-span">
            <div className="mya-k">Today's spend</div>
            <div className="mya-big">{money(spent)} <span className="mya-of">of {money(cap)} cap</span></div>
            <div className="mya-bar"><span style={{ width: pct + "%" }} className={pct >= (u.alertPct || 70) ? "hot" : ""} /></div>
            <div className="mya-note">{u.today?.calls || 0} model calls today · alert at {u.alertPct || 70}%{!data.flags?.hasKey && " · no ANTHROPIC_API_KEY set (model paused; router still works)"}</div>
          </div>
          <div className="mya-card"><div className="mya-k">Last 7 days</div><div className="mya-big">{money(u.days7?.cents)}</div><div className="mya-note">{u.days7?.calls || 0} calls</div></div>
          <div className="mya-card"><div className="mya-k">Last 30 days</div><div className="mya-big">{money(u.days30?.cents)}</div><div className="mya-note">{u.days30?.calls || 0} calls</div></div>
        </section>
      )}

      {tab === "Settings" && <Settings data={data} busy={busy} setBusy={setBusy} refresh={refresh} />}

      {tab === "Activity" && (
        <section className="mya-card">
          <div className="mya-k">Recent model calls</div>
          {(!data.activity || !data.activity.length) ? <p className="mya-empty">No model calls yet — the 0-token router handles the common commands for free.</p> : (
            <div className="mya-tablewrap"><table className="mya-table">
              <thead><tr><th>When</th><th>Model</th><th>Role</th><th>Kind</th><th className="r">Tokens</th><th className="r">Cost</th></tr></thead>
              <tbody>{data.activity.map((a) => (
                <tr key={a.id}><td>{a.ts}</td><td>{String(a.model || "").replace("claude-", "")}</td><td>{a.role || "—"}</td><td>{a.kind || "—"}</td><td className="r">{(a.in_tok || 0) + (a.out_tok || 0)}</td><td className="r">{money(a.cost_cents)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      )}

      {tab === "Training" && (
        <section className="mya-card">
          <div className="mya-k">Unanswered questions <span className="mya-dim">— teach Maya, then resolve</span></div>
          <p className="mya-note">Maya logs what she couldn't answer from the approved knowledge. Add a support article at <a href="/support" target="_blank" rel="noopener">Support ▸ guides/articles</a> to teach her, then resolve the item.</p>
          {(!data.unanswered || !data.unanswered.length) ? <p className="mya-empty">Nothing outstanding — Maya is answering everything asked.</p> : (
            <ul className="mya-q">{data.unanswered.map((q) => (
              <li key={q.id}>
                <div className="mya-qtext">“{q.question}”{q.hits > 1 && <span className="mya-hits">×{q.hits}</span>}</div>
                <div className="mya-qmeta">{q.role || "—"} · {q.ts}</div>
                <button className="mya-resolve" disabled={busy} onClick={async () => { setBusy(true); await mayaResolveUnansweredAction(q.id).catch(() => {}); await refresh(); setBusy(false); }}>Resolve</button>
              </li>
            ))}</ul>
          )}
        </section>
      )}

      {tab === "Conversations" && <Conversations data={data} />}
    </main>
  );
}

// Public receptionist conversations (website visitors). Customer-assistant threads live on each project, not
// here. A row expands to the full turn list on tap.
function Conversations({ data }) {
  const [openKey, setOpenKey] = useState(null);
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const rows = data.conversations || [];
  const expand = async (k) => {
    if (openKey === k) { setOpenKey(null); return; }
    setOpenKey(k); setBusy(true); setTurns([]);
    const r = await mayaConversationAction(k).catch(() => null);
    setTurns(r?.turns || []); setBusy(false);
  };
  return (
    <section className="mya-card">
      <div className="mya-k">Website receptionist <span className="mya-dim">— public visitor chats</span></div>
      {!rows.length ? <p className="mya-empty">No website conversations yet. Enable the receptionist under Settings and share the <a href="/ask" target="_blank" rel="noopener">/ask</a> page.</p> : (
        <ul className="mya-q">{rows.map((c) => (
          <li key={c.sessionKey} className="mya-conv">
            <button className="mya-convrow" onClick={() => expand(c.sessionKey)}>
              <span className="mya-qtext">“{c.preview || "(photo or action)"}”</span>
              <span className="mya-qmeta">{c.turns} turns · {c.last}</span>
            </button>
            {openKey === c.sessionKey && (
              <div className="mya-thread">
                {busy ? <p className="mya-empty">Loading…</p> : turns.map((t) => (
                  <div key={t.id} className={`mya-bubble ${t.role}`}>{t.text}</div>
                ))}
              </div>
            )}
          </li>
        ))}</ul>
      )}
    </section>
  );
}

function Settings({ data, busy, setBusy, refresh }) {
  const [cap, setCap] = useState(((data.usage?.capCents || 1000) / 100).toString());
  const [alert, setAlert] = useState((data.usage?.alertPct || 70).toString());
  const [saved, setSaved] = useState("");
  const save = async () => { setBusy(true); const r = await mayaSetCapAction(cap, alert).catch(() => ({ error: "Failed" })); setBusy(false); setSaved(r?.ok ? "Saved" : (r?.error || "Failed")); await refresh(); setTimeout(() => setSaved(""), 2500); };
  const toggle = async (flag, on) => { setBusy(true); await mayaSetFlagAction(flag, on).catch(() => {}); await refresh(); setBusy(false); };
  return (
    <section className="mya-grid">
      <div className="mya-card">
        <div className="mya-k">Daily spend cap</div>
        <div className="mya-row"><span className="mya-pre">$</span><input className="mya-in" type="number" min="0" step="1" value={cap} onChange={(e) => setCap(e.target.value)} /><span className="mya-post">/ day</span></div>
        <div className="mya-row"><input className="mya-in sm" type="number" min="1" max="100" value={alert} onChange={(e) => setAlert(e.target.value)} /><span className="mya-post">% alert threshold</span></div>
        <button className="mya-save" disabled={busy} onClick={save}>Save</button> {saved && <span className="mya-saved">{saved}</span>}
        <p className="mya-note">Once the day's model spend hits the cap, Maya keeps working on the free 0-token commands and tells users she's at today's limit. An alert goes to admins when spend crosses the threshold.</p>
      </div>
      <div className="mya-card">
        <div className="mya-k">Availability</div>
        <label className="mya-toggle"><input type="checkbox" checked={!!data.flags?.commands} disabled={busy} onChange={(e) => toggle("commands", e.target.checked)} /> Staff assistant (AI_COMMANDS)</label>
        <label className="mya-toggle"><input type="checkbox" checked={!!data.flags?.customer} disabled={busy} onChange={(e) => toggle("customer", e.target.checked)} /> Customer assistant (AI_CUSTOMER)</label>
        <label className="mya-toggle"><input type="checkbox" checked={!!data.flags?.receptionist} disabled={busy} onChange={(e) => toggle("receptionist", e.target.checked)} /> Website receptionist (MAYA_RECEPTIONIST)</label>
        <p className="mya-note">The receptionist is the public <a href="/ask" target="_blank" rel="noopener">/ask</a> chat for website visitors — deterministic, no account data, captures leads only. The model fallback needs <code>ANTHROPIC_API_KEY</code> in Dev ▸ API Keys{data.flags?.hasKey ? " (set ✓)" : " (not set)"}. The zero-token router works without it.</p>
      </div>
      <Proactive data={data} busy={busy} setBusy={setBusy} refresh={refresh} />
    </section>
  );
}

function Proactive({ data, busy, setBusy, refresh }) {
  const [hour, setHour] = useState((data.briefingHour ?? 7).toString());
  const [saved, setSaved] = useState("");
  const toggle = async (on) => { setBusy(true); await mayaSetFlagAction("proactive", on).catch(() => {}); await refresh(); setBusy(false); };
  const saveHour = async () => { setBusy(true); await mayaSetBriefingHourAction(hour).catch(() => {}); await refresh(); setBusy(false); setSaved("Saved"); setTimeout(() => setSaved(""), 2000); };
  return (
    <div className="mya-card">
      <div className="mya-k">Proactive jobs</div>
      <label className="mya-toggle"><input type="checkbox" checked={!!data.flags?.proactive} disabled={busy} onChange={(e) => toggle(e.target.checked)} /> Morning briefing + weekly report</label>
      <div className="mya-row"><span className="mya-pre">Briefing at</span><input className="mya-in sm" type="number" min="0" max="23" value={hour} onChange={(e) => setHour(e.target.value)} /><span className="mya-post">:00 (Eastern)</span><button className="mya-save" disabled={busy} onClick={saveHour}>Save</button> {saved && <span className="mya-saved">{saved}</span>}</div>
      <p className="mya-note">A daily briefing (awaiting-signature + payments due) and a Monday weekly report go to admins by portal + office email. Customers are never messaged by these jobs.</p>
    </div>
  );
}

const CSS = `
.mya{max-width:1000px;margin:0 auto;padding:26px 22px 90px;color:var(--ink,#e9ecf2);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.mya-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
.mya h1{font-size:1.7rem;letter-spacing:-.02em;margin:0}
.mya-sub{color:#9aa3b2;margin:3px 0 0;font-size:.92rem}
.mya-flag{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:4px 9px;border-radius:999px}
.mya-flag.on{background:rgba(93,196,127,.16);color:#7dd39a;border:1px solid rgba(93,196,127,.4)}
.mya-flag.off{background:rgba(160,170,185,.14);color:#aab;border:1px solid rgba(160,170,185,.3)}
.mya-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:18px}
.mya-tab{border:0;background:transparent;color:#9aa3b2;padding:9px 13px;font-size:.9rem;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit}
.mya-tab:hover{color:#e9ecf2}
.mya-tab.on{color:#EDE4D3;border-bottom-color:#C9A96E}
.mya-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.mya-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px 18px}
.mya-span{grid-column:1/-1}
.mya-k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8b93a4;font-weight:700;margin-bottom:8px}
.mya-dim{text-transform:none;letter-spacing:0;color:#6f7686;font-weight:500}
.mya-big{font-size:1.9rem;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.mya-of{font-size:.85rem;color:#8b93a4;font-weight:500}
.mya-bar{height:8px;border-radius:999px;background:rgba(255,255,255,.08);margin:12px 0 8px;overflow:hidden}
.mya-bar span{display:block;height:100%;background:#5dc47f;border-radius:999px;transition:width .3s}
.mya-bar span.hot{background:#e0a33a}
.mya-note{font-size:12.5px;color:#8b93a4;margin:6px 0 0}
.mya-empty{color:#8b93a4;font-size:.92rem;margin:4px 0 0}
.mya-row{display:flex;align-items:center;gap:8px;margin:8px 0}
.mya-pre,.mya-post{color:#9aa3b2;font-size:.9rem}
.mya-in{width:120px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.14);border-radius:9px;color:#e9ecf2;padding:8px 10px;font:inherit;font-variant-numeric:tabular-nums}
.mya-in.sm{width:72px}
.mya-save,.mya-resolve{border:1px solid rgba(201,169,110,.5);background:rgba(201,169,110,.16);color:#EDE4D3;border-radius:9px;font-weight:700;font-size:.85rem;padding:7px 14px;cursor:pointer;font-family:inherit}
.mya-save:hover,.mya-resolve:hover{background:rgba(201,169,110,.28)}
.mya-save:disabled,.mya-resolve:disabled{opacity:.5;cursor:default}
.mya-saved{color:#7dd39a;font-size:.85rem;margin-left:8px}
.mya-toggle{display:flex;align-items:center;gap:9px;margin:9px 0;font-size:.92rem;color:#d7dce6;cursor:pointer}
.mya-tablewrap{overflow-x:auto}
.mya-table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.mya-table th{text-align:left;color:#8b93a4;font-size:11px;letter-spacing:.05em;text-transform:uppercase;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
.mya-table td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.05);color:#c7cdd8}
.mya-table .r{text-align:right}
.mya-q{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.mya-q li{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:center;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(0,0,0,.14)}
.mya-qtext{grid-column:1;font-size:.92rem;color:#e3e7ee}
.mya-hits{color:#e0a33a;font-weight:700;font-size:.8rem;margin-left:6px}
.mya-qmeta{grid-column:1;font-size:11.5px;color:#7f8798}
.mya-resolve{grid-column:2;grid-row:1/span 2}
.mya-conv{display:block;grid-template-columns:none;padding:0;background:transparent;border:0}
.mya-convrow{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(0,0,0,.14);color:inherit;cursor:pointer;font-family:inherit;text-align:left}
.mya-convrow:hover{background:rgba(255,255,255,.05)}
.mya-thread{display:flex;flex-direction:column;gap:7px;padding:10px 4px 2px}
.mya-bubble{padding:8px 11px;border-radius:10px;max-width:84%;font-size:.9rem;white-space:pre-wrap;word-break:break-word}
.mya-bubble.you{align-self:flex-end;background:rgba(201,169,110,.16);color:#EDE4D3}
.mya-bubble.ai{align-self:flex-start;background:rgba(255,255,255,.05);color:#d7dce6}
.mya a{color:#C9A96E}
.mya code{background:rgba(255,255,255,.08);border-radius:4px;padding:1px 5px;font-size:12px}
@media (prefers-color-scheme:light){.mya{color:#1a1e24}.mya-sub,.mya-note,.mya-k,.mya-empty,.mya-qmeta{color:#5a6472}.mya-card{background:#fff;border-color:#e4e6ea}.mya-in{background:#fff;color:#1a1e24;border-color:#d7dadf}.mya-tabs{border-color:#e4e6ea}.mya-qtext{color:#1a1e24}.mya-table td{color:#2c333d}}
`;
