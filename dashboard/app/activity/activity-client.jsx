"use client";

import { useState } from "react";
import AdminShell from "../components/admin-shell";
import { USER_ROLE_COLOR } from "../components/admin-shell";

const EVENT_META = {
  login:         { label: "Login",        tone: "active" },
  logout:        { label: "Logout",       tone: "" },
  pin_access:    { label: "PIN Access",   tone: "value" },
  gateway_login: { label: "Gateway",      tone: "active" },
  demo:          { label: "Inquiry",      tone: "done" },
};

function parseDevice(ua) {
  if (!ua) return { browser: "—", os: "Unknown", type: "Unknown" };
  const mobile = /mobile|iphone|android/i.test(ua) && !/ipad/i.test(ua);
  const tablet = /ipad|tablet/i.test(ua);
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  let os = "Unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  return { browser, os, type: tablet ? "Tablet" : mobile ? "Mobile" : "Desktop" };
}
function formatTs(iso) {
  if (!iso) return "—";
  return new Date(iso + "Z").toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
function timeAgo(iso) {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso + "Z")) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  const d = Math.floor(mins / 1440);
  return d === 1 ? "Yesterday" : `${d}d ago`;
}
function sessionDur(a, b) {
  if (!a || !b) return null;
  const mins = Math.round((new Date(b + "Z") - new Date(a + "Z")) / 60000);
  if (mins < 1) return "< 1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function ipDisplay(ip) {
  if (!ip) return "—";
  // Show full IP; truncate only if it's an IPv6 that's very long
  if (ip.includes(":") && ip.length > 20) {
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":") + "…";
  }
  return ip;
}
function initials(name) { return name ? name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "?"; }

export default function ActivityClient({ user, alerts, events }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort]     = useState("time");
  const needle = search.trim().toLowerCase();

  const visible = events.filter((e) => {
    if (filter !== "all" && e.event_type !== filter) return false;
    if (!needle) return true;
    return [e.user_name, e.username, e.ip_address, e.user_agent, e.notes, e.project_customer]
      .filter(Boolean).some((v) => v.toLowerCase().includes(needle));
  }).sort((a, b) => {
    if (sort === "project") return (a.project_customer || "~").localeCompare(b.project_customer || "~") || b.id - a.id;
    if (sort === "ip")      return (a.ip_address || "~").localeCompare(b.ip_address || "~", undefined, { numeric: true }) || b.id - a.id;
    if (sort === "user")    return (a.user_name || "~").localeCompare(b.user_name || "~") || b.id - a.id;
    return b.id - a.id; // time (newest first)
  });

  const counts = {
    all:        events.length,
    login:      events.filter((e) => e.event_type === "login").length,
    logout:     events.filter((e) => e.event_type === "logout").length,
    pin_access: events.filter((e) => e.event_type === "pin_access").length,
  };

  return (
    <AdminShell user={user} alerts={alerts} active="activity">
      <div className="apx-wrap">
        <div className="page-head">
          <h1>Activity Log</h1>
          <div className="ph-sub">{visible.length} of {events.length} events</div>
        </div>

        <div className="sec-head">
          <div className="filters">
            {[["all", `All (${counts.all})`], ["login", `Logins (${counts.login})`], ["logout", `Logouts (${counts.logout})`], ["pin_access", `PIN (${counts.pin_access})`]].map(([k, lbl]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{lbl}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: ".8rem", color: "var(--muted)", fontWeight: 600 }}>
              Sort
              <select className="usel" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="time">Most recent</option>
                <option value="project">Project</option>
                <option value="ip">IP address</option>
                <option value="user">User</option>
              </select>
            </span>
            <input className="apx-input" style={{ maxWidth: 240 }} placeholder="Search user, IP, device…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="panel mb">
          {visible.length === 0 ? (
            <div className="empty">No activity yet. Events appear here after users log in or access projects via PIN.</div>
          ) : (
            <table className="dtable">
              <thead><tr><th>Time</th><th>Event</th><th>User / Role</th><th>IP Address</th><th>Device</th><th>Project / Details</th></tr></thead>
              <tbody>
                {visible.map((e) => {
                  const meta = EVENT_META[e.event_type] || { label: e.event_type, tone: "" };
                  const device = parseDevice(e.user_agent);
                  const dur = sessionDur(e.login_at, e.logout_at);
                  return (
                    <tr key={e.id} style={e.user_role && USER_ROLE_COLOR[e.user_role] ? { borderLeft: `3px solid ${USER_ROLE_COLOR[e.user_role]}22` } : undefined}>
                      <td><div style={{ fontWeight: 600 }}>{timeAgo(e.login_at)}</div><div style={{ fontSize: ".76rem", color: "var(--muted)" }}>{formatTs(e.login_at)}</div></td>
                      <td><span className={`chip ${meta.tone}`}>{meta.label}</span></td>
                      <td>
                        {e.user_name ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="uav" style={{ width: 30, height: 30, fontSize: ".74rem", background: USER_ROLE_COLOR[e.user_role] || "var(--slate)", color: e.user_role === "admin" ? "#0a1020" : "#fff" }}>{initials(e.user_name)}</div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: ".86rem" }}>{e.user_name}</div>
                              <div style={{ fontSize: ".74rem", textTransform: "capitalize", color: USER_ROLE_COLOR[e.user_role] || "var(--muted)", fontWeight: 600 }}>{e.user_role || "—"}</div>
                            </div>
                          </div>
                        ) : e.project_customer ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="uav" style={{ width: 30, height: 30, fontSize: ".74rem", background: "var(--gold-deep,#8a6d2f)", color: "#fff" }}>{initials(e.project_customer)}</div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: ".86rem" }}>{e.project_customer}</div>
                              <div style={{ fontSize: ".74rem", color: "var(--muted)", fontWeight: 600 }}>via project PIN</div>
                            </div>
                          </div>
                        ) : <span style={{ color: "var(--muted)" }}>Guest</span>}
                      </td>
                      <td style={{ color: "var(--muted)" }}>{ipDisplay(e.ip_address)}</td>
                      <td style={{ color: "var(--muted)" }}>{e.user_agent ? <><div style={{ color: "var(--ink)", fontSize: ".84rem" }}>{device.browser}</div><div style={{ fontSize: ".74rem" }}>{device.os} · {device.type}</div></> : "—"}</td>
                      <td style={{ color: "var(--muted)", fontSize: ".82rem" }}>
                        {e.project_access_id && (
                          <div style={{ marginBottom: 2 }}>
                            {e.project_customer && <span style={{ color: "var(--ink)", fontWeight: 600, marginRight: 6 }}>{e.project_customer}</span>}
                            <a href={`/project/${e.project_access_id}`} style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none", fontSize: ".78rem" }}>
                              #{e.project_access_id}
                            </a>
                          </div>
                        )}
                        {e.notes && <div style={{ color: "var(--muted)" }}>{e.notes}</div>}
                        {!e.project_access_id && e.project_customer && !e.notes && <div>{e.project_customer}</div>}
                        {dur && <div>Session: {dur}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
