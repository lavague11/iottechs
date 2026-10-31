"use client";
import { useState, useEffect } from "react";
import { mayaDashboardAction, mayaSetCapAction, mayaSetFlagAction, mayaResolveUnansweredAction, mayaSetBriefingHourAction, mayaLearnQueueAction, mayaLearnGetAction, mayaLearnUpdateAction } from "./actions";

const money = (cents) => "$" + (Math.round((+cents || 0)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TABS = ["Health", "Settings", "Activity", "Training", "Learn Queue", "Conversations"];

export default function MayaAdminClient({ initial }) {
  const [tab, setTab] = useState("Health");
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const refresh = async () => { const r = await mayaDashboardAction().catch(() => null); if (r?.ok) setData(r); };

  const u = data.usage || {};
  const cap = u.capCents || 1000, spent = u.today?.cents || 0, pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;

  return (
    <main className="mya">
      <style>{CSS_BASE}{CSS}</style>
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

      {tab === "Learn Queue" && <LearnQueue />}

      {tab === "Conversations" && (
        <section className="mya-card">
          <div className="mya-k">Conversations</div>
          <p className="mya-empty">Per-conversation ratings and handoffs will appear here once conversation logging is enabled. Today Maya keeps a rolling in-session memory only; every applied command is already on each project's Job Log, and model usage is under Activity.</p>
        </section>
      )}
    </main>
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
        <p className="mya-note">The model fallback needs <code>ANTHROPIC_API_KEY</code> in Dev ▸ API Keys{data.flags?.hasKey ? " (set ✓)" : " (not set)"}. The zero-token router works without it.</p>
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

const SEV_COLOR = { Critical: "#e0574f", High: "#e0a33a", Medium: "#8b93a4", Low: "#6f7686" };
const STATUS_ACTIONS = ["reviewed", "approved", "implemented", "verified", "rejected", "duplicate", "deferred", "cannot_reproduce"];
const FILTERS = [["Open", { open: true }], ["All", {}], ["High / Critical", { severity: "High" }], ["Recurring", { recurring: true }]];

function LearnQueue() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState({ open: true });
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async (f) => { const r = await mayaLearnQueueAction(f || filter).catch(() => null); if (r?.ok) setData(r); };
  useEffect(() => { load(filter); /* eslint-disable-next-line */ }, [filter]);
  const expand = async (id) => { if (openId === id) { setOpenId(null); setDetail(null); return; } setOpenId(id); const r = await mayaLearnGetAction(id).catch(() => null); setDetail(r?.item || null); };
  const setStatus = async (id, status) => { setBusy(true); await mayaLearnUpdateAction(id, { status }).catch(() => {}); await load(); const r = await mayaLearnGetAction(id).catch(() => null); setDetail(r?.item || null); setBusy(false); };
  const a = data?.analytics || {};
  return (
    <section>
      <div className="mya-grid" style={{ marginBottom: 14 }}>
        <div className="mya-card"><div className="mya-k">Open</div><div className="mya-big">{a.open || 0}</div><div className="mya-note">{a.highOpen || 0} high / critical · {a.recurring || 0} recurring</div></div>
        <div className="mya-card"><div className="mya-k">This month</div><div className="mya-big">{a.thisMonth || 0}</div><div className="mya-note">reported</div></div>
        <div className="mya-card"><div className="mya-k">Verified (7 days)</div><div className="mya-big">{a.verifiedThisWeek || 0}</div><div className="mya-note">fixes confirmed</div></div>
      </div>
      <div className="mya-card">
        <div className="lq-filters">{FILTERS.map(([lbl, f]) => <button key={lbl} className={`lq-chip${JSON.stringify(filter) === JSON.stringify(f) ? " on" : ""}`} onClick={() => setFilter(f)}>{lbl}</button>)}</div>
        {(!data || !data.items?.length) ? <p className="mya-empty">No learning items{filter.open ? " open" : ""}. Teach Maya in Learn Mode (admin) — reports land here for review.</p> : (
          <ul className="lq-list">
            {data.items.map((it) => (
              <li key={it.id} className="lq-item">
                <button type="button" className="lq-head" onClick={() => expand(it.id)}>
                  <span className="lq-sev" style={{ background: SEV_COLOR[it.severity] || "#8b93a4" }}>{it.severity}</span>
                  <span className="lq-title">LM-{it.id} · {it.title}</span>
                  <span className="lq-cat">{it.category}</span>
                  {it.occurrences > 1 && <span className="lq-occ">×{it.occurrences}</span>}
                  <span className="lq-stat">{String(it.status).replace("_", " ")}</span>
                </button>
                {openId === it.id && detail && (
                  <div className="lq-detail">
                    <p><b>What happened:</b> {detail.what_happened}</p>
                    {detail.expected && <p><b>Expected:</b> {detail.expected}</p>}
                    {detail.proposed_fix && <p><b>Proposed fix:</b> {detail.proposed_fix}</p>}
                    {detail.resolution && <p><b>Resolution:</b> {detail.resolution}</p>}
                    <p className="lq-metaline">Reported by {detail.reported_by} · {detail.created_at}{detail.access_id ? ` · ${detail.access_id}` : ""}</p>
                    <div className="lq-acts">{STATUS_ACTIONS.map((s) => <button key={s} type="button" className="lq-sbtn" disabled={busy || detail.status === s} onClick={() => setStatus(it.id, s)}>{s.replace("_", " ")}</button>)}</div>
                    {detail.events?.length > 0 && <div className="lq-audit">{detail.events.map((e, i) => <div key={i}>{e.ts} · {e.actor} · {e.action}{e.detail ? ` — ${e.detail}` : ""}</div>)}</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const CSS = `
.lq-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.lq-chip{border:1px solid rgba(255,255,255,.14);background:transparent;color:#9aa3b2;border-radius:999px;font-size:12px;font-weight:600;padding:4px 11px;cursor:pointer;font-family:inherit}
.lq-chip.on{border-color:#C9A96E;color:#EDE4D3;background:rgba(201,169,110,.14)}
.lq-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.lq-item{border:1px solid rgba(255,255,255,.08);border-radius:11px;overflow:hidden;background:rgba(0,0,0,.14)}
.lq-head{width:100%;display:flex;align-items:center;gap:9px;padding:9px 12px;background:transparent;border:0;cursor:pointer;text-align:left;font-family:inherit;color:#e3e7ee}
.lq-sev{flex:none;font-size:10px;font-weight:700;color:#0b0e13;border-radius:5px;padding:2px 6px;text-transform:uppercase}
.lq-title{flex:1;min-width:0;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lq-cat{flex:none;font-size:11px;color:#8b93a4}
.lq-occ{flex:none;font-size:11px;font-weight:700;color:#e0a33a}
.lq-stat{flex:none;font-size:11px;color:#9aa3b2;text-transform:capitalize;border:1px solid rgba(255,255,255,.12);border-radius:5px;padding:1px 7px}
.lq-detail{padding:4px 14px 14px;border-top:1px solid rgba(255,255,255,.06);font-size:.88rem;color:#c7cdd8}
.lq-detail p{margin:8px 0}
.lq-metaline{font-size:11.5px;color:#7f8798}
.lq-acts{display:flex;gap:5px;flex-wrap:wrap;margin:10px 0 0}
.lq-sbtn{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);color:#c7cdd8;border-radius:7px;font-size:11.5px;padding:4px 9px;cursor:pointer;text-transform:capitalize;font-family:inherit}
.lq-sbtn:hover:not(:disabled){border-color:#C9A96E;color:#EDE4D3}
.lq-sbtn:disabled{opacity:.4;cursor:default}
.lq-audit{margin-top:10px;padding-top:8px;border-top:1px dashed rgba(255,255,255,.08);font-size:11px;color:#7f8798;line-height:1.6}
@media (prefers-color-scheme:light){.lq-item{background:#fff;border-color:#e4e6ea}.lq-head{color:#1a1e24}.lq-detail{color:#2c333d}.lq-chip{color:#5a6472;border-color:#d7dadf}}
`;
const CSS_BASE = `
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
.mya a{color:#C9A96E}
.mya code{background:rgba(255,255,255,.08);border-radius:4px;padding:1px 5px;font-size:12px}
@media (prefers-color-scheme:light){.mya{color:#1a1e24}.mya-sub,.mya-note,.mya-k,.mya-empty,.mya-qmeta{color:#5a6472}.mya-card{background:#fff;border-color:#e4e6ea}.mya-in{background:#fff;color:#1a1e24;border-color:#d7dadf}.mya-tabs{border-color:#e4e6ea}.mya-qtext{color:#1a1e24}.mya-table td{color:#2c333d}}
`;
