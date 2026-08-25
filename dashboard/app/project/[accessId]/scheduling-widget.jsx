"use client";
import { useState, useEffect } from "react";
import { seedToolData, startToolAutosync } from "./tool-sync";
import { logAppointmentAction, sendAppointmentEmailAction } from "./actions";
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
  mail:   <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>,
  bell:   <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  edit:   <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
};

// Appointment types — quick-fill chips; the title stays freely typeable.
const APPT_TYPES = ["Installation", "Consultation", "Service Call", "Site Survey", "Upgrade", "Repair", "Meeting"];

const DURATIONS = [["30","30 min"],["60","1 hour"],["90","1.5 hrs"],["120","2 hrs"],["180","3 hrs"],["240","4 hrs"]];

export default function SchedulingWidget({ accessId, assignments = [], staffUsers = [], currentUser = null, project, view, customerView, defaultTitle = "IOT TECHS — Site Survey", apptKind = null, onCount, onBooked, onEvents }) {
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
  // Smart default title (DoD #1): the property's street address + the visit type, e.g.
  // "2503 Jay Pl — Site Survey" / "… — Installation". Visit type follows the appointment kind so an
  // install booking never mislabels itself as a survey. Falls back to the caller's default.
  const visitType = apptKind === "install" ? "Installation" : "Site Survey";
  const streetPrefix = project?.address ? String(project.address).split(",")[0].trim() : "IOT TECHS";
  const streetTitle = project?.address ? `${streetPrefix} — ${visitType}` : defaultTitle;
  // Quick-fill the title with a chosen appointment type, keeping the property prefix.
  const applyType = (type) => setForm(f => ({ ...f, title: `${streetPrefix} — ${type}` }));
  const [form, setForm]         = useState({
    title: streetTitle, date:"", time:"10:00",
    duration:"60", location: project?.address||"", notes:"", invitees:[],
  });
  const [saving, setSaving]     = useState(false);
  const [copied, setCopied]     = useState(null);
  const [sendState, setSendState] = useState({});   // `${eventId}:${verb}` → "busy" | "sent" | "err"
  const [editingId, setEditingId] = useState(null); // event id being edited (reschedule) vs. null = new
  const [sendMenu, setSendMenu]   = useState(null);  // event id whose Send menu is open
  const [confirmCancel, setConfirmCancel] = useState(false);  // "Are you sure?" inside the edit form

  // Default a new event's date to tomorrow (client-only to avoid hydration mismatch).
  useEffect(() => {
    setForm(f => f.date ? f : { ...f, date: tomorrowISO() });
  }, []);

  // Report how many events are scheduled so the caller can gate a step's "done" on a real booking.
  useEffect(() => { onCount?.(data.events.length); }, [data.events.length, onCount]);
  // Report the full event list so a caller (the deck header chip) can show the actual day + time.
  useEffect(() => { onEvents?.(data.events); }, [data.events, onEvents]);

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
    if (editingId != null) {
      // Reschedule / edit an existing appointment in place — then re-send an updated invite so the
      // customer's calendar and everyone's inbox reflect the change.
      let ev = null;
      update(d => { const e = d.events.find(x => x.id === editingId); if (e) { Object.assign(e, form); ev = { ...e }; } });
      if (ev) {
        onBooked?.(ev.date);
        logAppointmentAction(accessId, { verb: "updated", title: ev.title, date: ev.date, event: ev, inviteeEmails: emailsFor(ev) }).catch(() => {});
      }
      closeForm();
      setSaving(false);
      return;
    }
    const ev = { id: uid(), kind: apptKind || undefined, ...form, created: new Date().toISOString().slice(0,10) };
    update(d => d.events.unshift(ev));
    onBooked?.(ev.date);   // let the caller mirror the date onto the project (survey booking → auto-advance)
    logAppointmentAction(accessId, { verb: "scheduled", title: ev.title, date: ev.date, event: ev, inviteeEmails: emailsFor(ev) }).catch(() => {});   // Job Log + email invite
    closeForm();
    setSaving(false);
  }

  function startEdit(ev) {
    setForm({ title: ev.title || streetTitle, date: ev.date || "", time: ev.time || "10:00",
      duration: ev.duration || "60", location: ev.location || project?.address || "", notes: ev.notes || "", invitees: ev.invitees || [] });
    setEditingId(ev.id); setConfirmCancel(false); setShowForm(true);
  }
  function closeForm() {
    setShowForm(false); setEditingId(null); setConfirmCancel(false);
    setForm(f => ({ ...f, title: streetTitle, date: tomorrowISO(), notes: "", invitees: autoNames }));
  }

  function deleteEvent(id) {
    const ev = data.events.find(e => e.id === id);
    update(d => { d.events = d.events.filter(e => e.id !== id); });
    if (ev) logAppointmentAction(accessId, { verb: "canceled", title: ev.title, date: ev.date, event: ev, inviteeEmails: emailsFor(ev) }).catch(() => {});   // Job Log + cancellation email
    if (editingId === id) closeForm();
  }

  function copyInvite(ev) {
    const who = ev.invitees?.length ? ev.invitees.join(", ") : "assigned team";
    const txt = `📅 ${ev.title}\n📍 ${ev.location||"TBD"}\n🕐 ${fmtDate(ev.date)} at ${ev.time} (${ev.duration} min)\n👥 ${who}${ev.notes?`\n\nNotes: ${ev.notes}`:""}`;
    navigator.clipboard.writeText(txt).then(() => { setCopied(ev.id); setTimeout(()=>setCopied(null),2000); });
  }

  // Manually (re)send the invite or a reminder email for one appointment — to the customer, team,
  // guests, and the staff member clicking. `verb`: "scheduled" (invite) | "reminder".
  async function sendAppt(ev, verb) {
    if (isReadOnly) return;
    const k = `${ev.id}:${verb}`;
    setSendState(s => ({ ...s, [k]: "busy" }));
    let ok = false;
    try { const r = await sendAppointmentEmailAction(accessId, { verb, event: ev, inviteeEmails: emailsFor(ev) }); ok = !!r?.ok; } catch {}
    setSendState(s => ({ ...s, [k]: ok ? "sent" : "err" }));
    setTimeout(() => setSendState(s => { const n = { ...s }; delete n[k]; return n; }), 2600);
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
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
  const nameToEmail = {};
  people.forEach(p => { nameToEmail[p.name] = p.email || ""; });
  // An invitee is either a known person's name (→ their email) or a raw typed email (→ itself).
  const emailsFor = ev => (ev.invitees || []).map(n => nameToEmail[n] || (isEmail(n) ? String(n).trim() : "")).filter(Boolean);
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
  // Invite by email: when the box holds a valid email that isn't already invited and isn't one of
  // the known people, offer to add it as-is (external guest).
  const emailToAdd = (() => { const q = invSearch.trim();
    return (isEmail(q) && !form.invitees.includes(q) && !people.some(p => (p.email || "").toLowerCase() === q.toLowerCase())) ? q : ""; })();
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
      {/* Add button — Cancel lives at the bottom of the form now, not up here */}
      {!isReadOnly && !showForm && (
        <button className="sched-add-btn" onClick={() => setShowForm(true)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Schedule Event
        </button>
      )}

      {showForm && (
        <div className="sched-form">
          <div className="sched-row">
            <label className="sched-lbl">Event Title</label>
            <input className="sched-input" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Type anything, or pick a type below" />
            <div className="sched-types">
              {APPT_TYPES.map(t => (
                <button type="button" key={t} className={`sched-type${form.title.endsWith(`— ${t}`) ? " on" : ""}`} onClick={() => applyType(t)}>{t}</button>
              ))}
            </div>
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
            <AddressAutocomplete className="sched-input" value={form.location} onChange={v=>setForm(f=>({...f,location:v}))} placeholder="" />
          </div>
          <div className="sched-row">
            <label className="sched-lbl">Invite Members</label>
            {/* Search first, then the invited chips sit right below it */}
            <div className="sched-invsearch">
              <input className="sched-input" value={invSearch} placeholder="Search a name or type an email…"
                     autoComplete="off" onChange={e => setInvSearch(e.target.value)}
                     onKeyDown={e => { if (e.key === "Enter" && emailToAdd) { e.preventDefault(); addInvitee(emailToAdd); } }} />
              {(invMatches.length > 0 || emailToAdd) && (
                <div className="sched-invdd">
                  {invMatches.map(p => (
                    <button key={(p.email || p.name)} type="button" className="sched-invopt"
                            onMouseDown={e => { e.preventDefault(); addInvitee(p.name); }}>
                      <span className="sched-invopt-name">{p.name}</span>
                      {p.email && <span className="sched-invopt-email">{p.email}</span>}
                      <span className={`sched-chip-role${p.role === "customer" ? " cust" : ""}`}>{p.role || "member"}</span>
                    </button>
                  ))}
                  {emailToAdd && (
                    <button type="button" className="sched-invopt sched-invadd"
                            onMouseDown={e => { e.preventDefault(); addInvitee(emailToAdd); }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
                      <span className="sched-invopt-name">Invite {emailToAdd}</span>
                      <span className="sched-chip-role">email</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Chips — auto-invited (customer + assigned team + you) plus anyone added */}
            {form.invitees.length > 0 && (
              <div className="sched-chips" style={{ marginTop: 8, marginBottom: 0 }}>
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
          </div>
          <div className="sched-row">
            <label className="sched-lbl">Notes</label>
            <textarea className="sched-input sched-ta" rows={2} value={form.notes}
              onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="" />
          </div>
          <div className="sched-form-acts">
            <button type="button" className="sched-cancel-btn" onClick={closeForm}>{editingId != null ? "Close" : "Cancel"}</button>
            {editingId != null && (
              confirmCancel
                ? <span className="sched-cancel-confirm">
                    <span className="sched-cancel-q">Cancel this appointment?</span>
                    <button type="button" className="sched-cancel-yes" onClick={() => deleteEvent(editingId)}>Yes, cancel</button>
                    <button type="button" className="sched-cancel-no" onClick={() => setConfirmCancel(false)}>No</button>
                  </span>
                : <button type="button" className="sched-cancel-appt" onClick={() => setConfirmCancel(true)}>Cancel appointment</button>
            )}
            {form.date && !confirmCancel && (
              <div className="sched-cal-group">
                <span className="sched-cal-lbl">Add to calendar</span>
                <a className="sched-cal-ico" title="Google Calendar" href={gcalUrl(form, form.invitees.map(n=>nameToEmail[n]).filter(Boolean))} target="_blank" rel="noopener noreferrer">{Ico.gcal}</a>
                <button type="button" className="sched-cal-ico" title="Apple Calendar" onClick={() => downloadIcs(form)}>{Ico.apple}</button>
              </div>
            )}
            <button className="sched-save-btn" disabled={!form.date||saving} onClick={saveEvent}>
              {saving ? "Saving…" : editingId != null ? "Update" : "Save Event"}
            </button>
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
                      <a className="sched-ev-ico" href={gcalUrl(ev, emailsFor(ev))} target="_blank" rel="noopener noreferrer" title="Add to Google Calendar">{Ico.gcal}</a>
                      <button className="sched-ev-ico" onClick={()=>downloadIcs(ev)} title="Add to Apple / iCloud Calendar">{Ico.apple}</button>
                      {!isReadOnly && (
                        <span className="sched-send-wrap">
                          <button className="sched-ev-ico" disabled={sendState[`${ev.id}:scheduled`]==="busy"||sendState[`${ev.id}:reminder`]==="busy"}
                            onClick={()=>setSendMenu(m => m===ev.id ? null : ev.id)} title="Send email">
                            {(sendState[`${ev.id}:scheduled`]==="sent"||sendState[`${ev.id}:reminder`]==="sent") ? Ico.check : Ico.mail}
                          </button>
                          {sendMenu===ev.id && (
                            <span className="sched-send-menu">
                              <button type="button" onClick={()=>{ setSendMenu(null); sendAppt(ev,"scheduled"); }}>Send invitation</button>
                              <button type="button" onClick={()=>{ setSendMenu(null); sendAppt(ev,"reminder"); }}>Send reminder</button>
                            </span>
                          )}
                        </span>
                      )}
                      {!isReadOnly && <button className="sched-ev-ico" onClick={()=>startEdit(ev)} title="Edit / reschedule">{Ico.edit}</button>}
                    </div>
                  </div>
                  <div className="sched-ev-line">{Ico.clock}<span>{fmtDate(ev.date)} · {timeRange(ev.time, ev.duration)}</span></div>
                  {ev.location && <div className="sched-ev-line">{Ico.pin}<a className="sched-ev-addr" href={mapsDir(ev.location)} target="_blank" rel="noopener noreferrer">{ev.location}</a></div>}
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
