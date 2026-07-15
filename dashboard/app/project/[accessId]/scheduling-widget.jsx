"use client";
import { useState, useEffect } from "react";
import { seedToolData, startToolAutosync } from "./tool-sync";
import AddressAutocomplete from "../../components/address-autocomplete";

function schedKey(id) { return `sched_v1_${id}`; }
function schedLoad(id) {
  try { const r = localStorage.getItem(schedKey(id)); if(r) return JSON.parse(r); } catch(_) {}
  return { events: [] };
}
function schedSave(id, d) { try { localStorage.setItem(schedKey(id), JSON.stringify(d)); } catch(_) {} }

let _uid = Date.now();
function uid() { return ++_uid; }

function gcalUrl({ title, date, time, duration, location, notes }, guestEmails = []) {
  try {
    const [h, m]       = (time||"09:00").split(":").map(Number);
    const [y, mo, day] = (date||"2026-01-01").split("-").map(Number);
    const start = new Date(y, mo-1, day, h, m);
    const end   = new Date(start.getTime() + (Number(duration)||60)*60000);
    const fmt   = d => d.toISOString().replace(/[-:.]/g,"").slice(0,15)+"Z";
    const params = {
      action:"TEMPLATE", text: title||"IOT TECHS Visit",
      dates: `${fmt(start)}/${fmt(end)}`,
      location: location||"", details: notes||"",
    };
    if (guestEmails.length) params.add = guestEmails.join(",");
    return "https://calendar.google.com/calendar/render?" + new URLSearchParams(params);
  } catch(_) { return "#"; }
}

// .ics (iCalendar) — the universal format Apple Calendar / iCloud (and Outlook) import. Times are
// written as floating local time (no timezone), so the appointment shows at the hour it was booked.
function icsFor(ev) {
  const pad = (n) => String(n).padStart(2, "0");
  const [h, m]       = (ev.time || "09:00").split(":").map(Number);
  const [y, mo, day] = (ev.date || "2026-01-01").split("-").map(Number);
  const startLocal = `${y}${pad(mo)}${pad(day)}T${pad(h)}${pad(m)}00`;
  const end = new Date(y, mo - 1, day, h, m + (Number(ev.duration) || 60));
  const endLocal = `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
  const esc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IOT TECHS//Scheduling//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${ev.id || Date.now()}@iottechs`,
    `DTSTART:${startLocal}`, `DTEND:${endLocal}`,
    `SUMMARY:${esc(ev.title || "IOT TECHS Visit")}`,
    ev.location ? `LOCATION:${esc(ev.location)}` : null,
    ev.notes ? `DESCRIPTION:${esc(ev.notes)}` : null,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}
function downloadIcs(ev) {
  if (!ev?.date) return;
  const blob = new Blob([icsFor(ev)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `iot-techs-${ev.date || "visit"}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function tomorrowISO() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function fmtDate(d) {
  try { return new Date(d+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}); }
  catch(_) { return d; }
}
function mapsDir(location) {
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(location || "");
}
function dateTile(d) {
  try { const dt = new Date(d+"T00:00:00"); return { mon: dt.toLocaleDateString("en-US",{month:"short"}).toUpperCase(), day: dt.getDate(), wd: dt.toLocaleDateString("en-US",{weekday:"long"}) }; }
  catch(_) { return { mon:"", day:"", wd:"" }; }
}
function timeRange(time, duration) {
  try {
    const [h, m] = (time||"09:00").split(":").map(Number);
    const start = new Date(2000,0,1,h,m);
    const end   = new Date(start.getTime() + (Number(duration)||60)*60000);
    const f = d => d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    return `${f(start)} – ${f(end)}`;
  } catch(_) { return time; }
}

// Small monochrome icons (no emojis) for a clean appointment card.
const Ico = {
  clock:  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>,
  pin:    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  people: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  gcal:   <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  apple:  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16.4 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.7 2.3 1.1 0 1.5-.7 2.8-.7 1.3 0 1.6.7 2.8.7 1.2 0 1.9-1.1 2.6-2.2.5-.7.7-1.4.9-1.9-.1 0-2.3-.9-2.3-3.5zM14.3 5.8c.6-.7 1-1.7.9-2.8-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.1z"/></svg>,
  dir:    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>,
  copy:   <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  check:  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x:      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

const DURATIONS = [["30","30 min"],["60","1 hour"],["90","1.5 hrs"],["120","2 hrs"],["180","3 hrs"],["240","4 hrs"]];

export default function SchedulingWidget({ accessId, assignments = [], staffUsers = [], currentUser = null, project, view, customerView, defaultTitle = "IOT TECHS — Site Survey" }) {
  const [data, setData]         = useState({ events: [] });
  // Seed from the server backup if this browser has no local draft, then keep the server copy
  // in sync with every local change (see tool-sync.js).
  useEffect(() => {
    let stop = null, live = true;
    (async () => {
      await seedToolData(accessId, "schedule", schedKey(accessId));
      if (!live) return;
      setData(schedLoad(accessId));
      stop = startToolAutosync(accessId, "schedule", schedKey(accessId));
    })();
    return () => { live = false; if (stop) stop(); };
  }, [accessId]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({
    title: defaultTitle, date:"", time:"10:00",
    duration:"60", location: project?.address||"", notes:"", invitees:[],
  });
  const [saving, setSaving]     = useState(false);
  const [copied, setCopied]     = useState(null);

  // Default a new event's date to tomorrow (client-only to avoid hydration mismatch).
  useEffect(() => {
    setForm(f => f.date ? f : { ...f, date: tomorrowISO() });
  }, []);

  const isReadOnly = view === "customer" || customerView;

  function update(fn) {
    setData(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      schedSave(accessId, next);
      return next;
    });
  }

  function saveEvent() {
    if (!form.date) return;
    setSaving(true);
    const ev = { id: uid(), ...form, created: new Date().toISOString().slice(0,10) };
    update(d => d.events.unshift(ev));
    setShowForm(false);
    setForm(f => ({ ...f, date: tomorrowISO(), notes:"", invitees: autoNames }));
    setSaving(false);
  }

  function deleteEvent(id) { update(d => { d.events = d.events.filter(e => e.id !== id); }); }

  function copyInvite(ev) {
    const who = ev.invitees?.length ? ev.invitees.join(", ") : "assigned team";
    const txt = `📅 ${ev.title}\n📍 ${ev.location||"TBD"}\n🕐 ${fmtDate(ev.date)} at ${ev.time} (${ev.duration} min)\n👥 ${who}${ev.notes?`\n\nNotes: ${ev.notes}`:""}`;
    navigator.clipboard.writeText(txt).then(() => { setCopied(ev.id); setTimeout(()=>setCopied(null),2000); });
  }

  // ---- People pool: everyone invitable — internal staff + this project's customer(s) --------
  // Deduped by lowercased email (or name when no email). Each: {name, email, role, kind}.
  const people = (() => {
    const byKey = new Map();
    const add = (name, email, role, kind) => {
      const nm = (name || email || "").trim();
      if (!nm) return;
      const key = (email || nm).toLowerCase();
      if (!byKey.has(key)) byKey.set(key, { name: nm, email: email || "", role: role || "", kind });
    };
    // Project's customer — always invitable and auto-invited.
    add(project?.contact_name || project?.customer, project?.contact_email, "customer", "customer");
    // Project's granted members (assignments) — auto-invited.
    assignments.forEach(a => add(a.user_name, a.user_email, a.role, a.role === "customer" ? "customer" : "staff"));
    // Every internal staff user — searchable, invite on demand.
    staffUsers.forEach(u => add(u.name, u.email, u.role, u.role === "customer" ? "customer" : "staff"));
    // Whoever is logged in — so they can always add themselves.
    if (currentUser) add(currentUser.name, currentUser.email, currentUser.role, currentUser.role === "customer" ? "customer" : "staff");
    return [...byKey.values()];
  })();
  const nameToEmail = {};
  people.forEach(p => { nameToEmail[p.name] = p.email || ""; });
  const emailsFor = ev => (ev.invitees || []).map(n => nameToEmail[n]).filter(Boolean);
  const roleFor   = nm => (people.find(p => p.name === nm)?.role) || "";

  // Auto-invite set = the people actually ON THIS PROJECT (its customer + assigned team) plus
  // whoever is booking — NOT every customer in the system (those stay search-only).
  const autoSet = new Set();
  const projCustomer = (project?.contact_name || project?.customer || "").trim();
  if (projCustomer) autoSet.add(projCustomer);
  assignments.forEach(a => { const nm = (a.user_name || a.user_email || "").trim(); if (nm) autoSet.add(nm); });
  if (currentUser) { const nm = (currentUser.name || currentUser.email || "").trim(); if (nm) autoSet.add(nm); }
  const autoNames = [...autoSet].filter(nm => people.some(p => p.name === nm));
  const autoKey = autoNames.join("|");

  const [invSearch, setInvSearch] = useState("");
  const invMatches = invSearch.trim()
    ? people.filter(p => !form.invitees.includes(p.name) &&
        `${p.name} ${p.email} ${p.role}`.toLowerCase().includes(invSearch.trim().toLowerCase())).slice(0, 8)
    : [];
  const addInvitee    = nm => { setForm(f => f.invitees.includes(nm) ? f : ({ ...f, invitees: [...f.invitees, nm] })); setInvSearch(""); };
  const removeInvitee = nm => setForm(f => ({ ...f, invitees: f.invitees.filter(x => x !== nm) }));

  // Pre-invite the auto set on new events, and back-fill it onto any existing events.
  useEffect(() => {
    if (isReadOnly || autoNames.length === 0) return;
    setForm(f => ({ ...f, invitees: Array.from(new Set([...f.invitees, ...autoNames])) }));
    setData(prev => {
      let changed = false;
      const next = JSON.parse(JSON.stringify(prev));
      (next.events || []).forEach(ev => {
        const inv = ev.invitees || [];
        autoNames.forEach(n => { if (!inv.includes(n)) { inv.push(n); changed = true; } });
        ev.invitees = inv;
      });
      if (changed) schedSave(accessId, next);
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey, isReadOnly, accessId]);

  return (
    <div className="sched-tool">
      {/* Add button */}
      {!isReadOnly && (
        <button className="sched-add-btn" onClick={() => setShowForm(v => !v)}>
          {showForm
            ? <><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cancel</>
            : <><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Schedule Event</>
          }
        </button>
      )}

      {showForm && (
        <div className="sched-form">
          <div className="sched-row">
            <label className="sched-lbl">Event Title</label>
            <input className="sched-input" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="IOT TECHS — Site Survey" />
          </div>
          <div className="sched-row sched-row-3">
            <div>
              <label className="sched-lbl">Date *</label>
              <input className="sched-input" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} />
            </div>
            <div>
              <label className="sched-lbl">Start Time</label>
              <input className="sched-input" type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} />
            </div>
            <div>
              <label className="sched-lbl">Duration</label>
              <select className="sched-input" value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))}>
                {DURATIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="sched-row">
            <label className="sched-lbl">Location</label>
            <AddressAutocomplete className="sched-input" value={form.location} onChange={v=>setForm(f=>({...f,location:v}))} placeholder="Job site address" />
          </div>
          <div className="sched-row">
            <label className="sched-lbl">Invite Members</label>
            {/* Chips — auto-invited (customer + assigned team + you) plus anyone added */}
            {form.invitees.length > 0 && (
              <div className="sched-chips">
                {form.invitees.map(nm => {
                  const r = roleFor(nm);
                  const auto = autoNames.includes(nm);
                  return (
                    <span key={nm} className={`sched-chip${r === "customer" ? " cust" : ""}`}>
                      {nm}
                      {r && <span className="sched-chip-role">{r}</span>}
                      {auto && <span className="sched-chip-auto">auto</span>}
                      <button type="button" className="sched-chip-x" title="Remove" onClick={() => removeInvitee(nm)}>✕</button>
                    </span>
                  );
                })}
              </div>
            )}
            {/* Search bar over internal members + customers */}
            <div className="sched-invsearch">
              <input className="sched-input" value={invSearch} placeholder="Search members or customers to invite…"
                     autoComplete="off" onChange={e => setInvSearch(e.target.value)} />
              {invMatches.length > 0 && (
                <div className="sched-invdd">
                  {invMatches.map(p => (
                    <button key={(p.email || p.name)} type="button" className="sched-invopt"
                            onMouseDown={e => { e.preventDefault(); addInvitee(p.name); }}>
                      <span className="sched-invopt-name">{p.name}</span>
                      {p.email && <span className="sched-invopt-email">{p.email}</span>}
                      <span className={`sched-chip-role${p.role === "customer" ? " cust" : ""}`}>{p.role || "member"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="sched-row">
            <label className="sched-lbl">Notes</label>
            <textarea className="sched-input sched-ta" rows={2} value={form.notes}
              onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Bring ladder, check camera angles, badge access needed…" />
          </div>
          <div className="sched-form-acts">
            <button className="sched-save-btn" disabled={!form.date||saving} onClick={saveEvent}>
              {saving?"Saving…":"Save Event"}
            </button>
            {form.date && (
              <a className="sched-gcal-btn" href={gcalUrl(form, form.invitees.map(n=>nameToEmail[n]).filter(Boolean))} target="_blank" rel="noopener noreferrer">
                {Ico.gcal}
                Add to Google Calendar
              </a>
            )}
            {form.date && (
              <button type="button" className="sched-gcal-btn" onClick={() => downloadIcs(form)}>
                {Ico.apple}
                Add to Apple Calendar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Events list */}
      {data.events.length > 0 ? (
        <div className="sched-events">
          {!showForm && <div className="sched-sec-label">Scheduled Events ({data.events.length})</div>}
          {data.events.map(ev => {
            const dt = dateTile(ev.date);
            return (
              <div key={ev.id} className="sched-event">
                <div className="sched-ev-tile">
                  <span className="sched-ev-mon">{dt.mon}</span>
                  <span className="sched-ev-day">{dt.day}</span>
                </div>
                <div className="sched-ev-main">
                  <div className="sched-ev-row">
                    <span className="sched-ev-title">{ev.title}</span>
                    <div className="sched-ev-acts">
                      {ev.location && <a className="sched-ev-ico" href={mapsDir(ev.location)} target="_blank" rel="noopener noreferrer" title="Get directions">{Ico.dir}</a>}
                      <a className="sched-ev-ico" href={gcalUrl(ev, emailsFor(ev))} target="_blank" rel="noopener noreferrer" title="Add to Google Calendar">{Ico.gcal}</a>
                      <button className="sched-ev-ico" onClick={()=>downloadIcs(ev)} title="Add to Apple / iCloud Calendar">{Ico.apple}</button>
                      <button className="sched-ev-ico" onClick={()=>copyInvite(ev)} title="Copy details">{copied===ev.id ? Ico.check : Ico.copy}</button>
                      {!isReadOnly && <button className="sched-ev-ico sched-ev-del" onClick={()=>deleteEvent(ev.id)} title="Remove">{Ico.x}</button>}
                    </div>
                  </div>
                  <div className="sched-ev-line">{Ico.clock}<span>{fmtDate(ev.date)} · {timeRange(ev.time, ev.duration)}</span></div>
                  {ev.location && <div className="sched-ev-line">{Ico.pin}<span>{ev.location}</span>
                    <a className="sched-ev-dir" href={mapsDir(ev.location)} target="_blank" rel="noopener noreferrer">{Ico.dir} Directions</a>
                  </div>}
                  {ev.invitees?.length > 0 && <div className="sched-ev-line">{Ico.people}<span>{ev.invitees.join(", ")}</span></div>}
                  {ev.notes && <div className="sched-ev-notes">{ev.notes}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !showForm && <div className="sched-empty">{isReadOnly?"No events scheduled yet.":"No events scheduled. Add one above."}</div>
      )}
    </div>
  );
}
