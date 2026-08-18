// Project-type → icon + color. A colored glyph on each project row so you can tell at a glance
// what kind of job it is (cameras vs ADT vs networking …). Shared by the dashboard Projects panel
// and the /projects board. Detection is by the `kind` flag (ADT) then the service/category text.
const IC = {
  cam:   <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  shield:<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  net:   <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-2h14v2M12 12v2"/></svg>,
  lock:  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  hdd:   <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 12h.01M10 12h8"/></svg>,
  pos:   <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M9 18h6"/></svg>,
  audio: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>,
  box:   <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/><path d="m3.3 7 8.7 5 8.7-5"/></svg>,
};

// Returns { label, color, icon }. Colors are distinct and reused elsewhere in the app palette.
export function projectTypeMeta(p) {
  if (p?.kind === "adt") return { label: "ADT Monitoring", color: "#C9A96E", icon: IC.shield };
  const s = String(p?.service || p?.category || p?.service_code || "").toLowerCase();
  if (/camera|cctv|surveil/.test(s))        return { label: "Cameras",   color: "#3257ff", icon: IC.cam };
  if (/network|cat\s?6|ethernet|wi-?fi/.test(s)) return { label: "Networking", color: "#16a085", icon: IC.net };
  if (/access|door|entry|intercom/.test(s)) return { label: "Access",    color: "#9b59b6", icon: IC.lock };
  if (/nvr|storage|record/.test(s))         return { label: "Storage",   color: "#5b6470", icon: IC.hdd };
  if (/pos|toast/.test(s))                  return { label: "POS",       color: "#e67e22", icon: IC.pos };
  if (/audio|sound|speaker/.test(s))        return { label: "Audio",     color: "#e84393", icon: IC.audio };
  return { label: "Other", color: "#8a8578", icon: IC.box };
}

// The colored type glyph. Size is the square box in px.
export function ProjectTypeIcon({ project, size = 34 }) {
  const m = projectTypeMeta(project);
  return (
    <span title={m.label} aria-label={m.label} style={{
      width: size, height: size, flex: "none", display: "grid", placeItems: "center",
      color: m.color, background: m.color + "1a", border: `1px solid ${m.color}33`, borderRadius: 9,
    }}>{m.icon}</span>
  );
}
