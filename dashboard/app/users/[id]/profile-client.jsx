"use client";

import AdminShell, { USER_ROLE_COLOR } from "../../components/admin-shell";
import { useRouter } from "next/navigation";

const ROLE_LABEL = { admin: "Admin", manager: "Manager", sales: "Sales", tech: "Tech", customer: "Customer" };
const STAGE_LABEL = {
  inquiry: "Inquiry", survey: "Survey", proposal: "Proposal", approval: "Approval",
  schedule: "Schedule", install: "Install", qc: "QC", payment: "Payment", completion: "Completion",
};

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function timeAgo(iso) {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso + "Z")) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export default function ProfileClient({ user, alerts, profile, projects }) {
  const router = useRouter();
  const roleColor = USER_ROLE_COLOR[profile.role] || "#888";

  return (
    <AdminShell user={user} alerts={alerts} active="users">
      <div className="apx-wrap">
        <div className="page-head" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={{ background: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: ".82rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <div>
            <h1>User Profile</h1>
            <div className="ph-sub">Viewing {profile.name || profile.email}</div>
          </div>
        </div>

        {/* Profile card */}
        <div className="panel mb" style={{ padding: "24px 22px", display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
            background: roleColor + "22", border: `2px solid ${roleColor}44`,
            color: roleColor, fontFamily: "'Bricolage Grotesque',sans-serif",
            fontSize: "1.4rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {initials(profile.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: "1.15rem", color: "var(--ink)" }}>
                {profile.name || "(No name)"}
              </span>
              <span style={{
                fontSize: ".7rem", fontWeight: 700, padding: "3px 10px", borderRadius: 100,
                background: roleColor + "22", color: roleColor, border: `1px solid ${roleColor}44`,
              }}>
                {ROLE_LABEL[profile.role] || profile.role}
              </span>
              {profile.disabled ? (
                <span style={{ fontSize: ".7rem", fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: "#fee", color: "#c0392b", border: "1px solid #f5c6c6" }}>Disabled</span>
              ) : (
                <span style={{ fontSize: ".7rem", fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: "var(--green-soft)", color: "var(--green)", border: "1px solid var(--green-soft)" }}>Active</span>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", fontSize: ".84rem", color: "var(--muted)", marginTop: 6 }}>
              {profile.email && <span>{profile.email}</span>}
              {profile.phone && <span>{profile.phone}</span>}
              {profile.username && <span>@{profile.username}</span>}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: ".78rem", color: "var(--muted)", flexWrap: "wrap" }}>
              {profile.last_login && <span>Last login: <b style={{ color: "var(--ink)" }}>{timeAgo(profile.last_login)}</b></span>}
              {profile.session_mins != null && <span>Avg session: <b style={{ color: "var(--ink)" }}>{profile.session_mins}m</b></span>}
            </div>
          </div>
        </div>

        {/* Projects */}
        <div className="panel">
          <div className="panel-head">
            <h3>Projects ({projects.length})</h3>
          </div>
          {projects.length === 0 ? (
            <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--muted)", fontSize: ".88rem" }}>
              Not assigned to any projects yet.
            </div>
          ) : (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Customer</th>
                  <th>Stage</th>
                  <th>Service</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.access_id} style={{ cursor: "pointer" }} onClick={() => router.push(`/project/${p.access_id}`)}>
                    <td><span className="mono idlink">{p.access_id}</span></td>
                    <td className="name-cell">{p.customer}</td>
                    <td>
                      <span style={{
                        fontSize: ".72rem", fontWeight: 700, padding: "3px 9px", borderRadius: 6,
                        background: "var(--bg-tint)", color: "var(--ink)", border: "1px solid var(--line)",
                      }}>
                        {STAGE_LABEL[p.stage] || p.stage}
                      </span>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: ".84rem" }}>{p.service || "—"}</td>
                    <td>
                      <span style={{
                        fontSize: ".7rem", fontWeight: 700, padding: "2px 8px", borderRadius: 100,
                        background: (USER_ROLE_COLOR[p.assignment_role] || "#888") + "22",
                        color: USER_ROLE_COLOR[p.assignment_role] || "#888",
                        border: `1px solid ${(USER_ROLE_COLOR[p.assignment_role] || "#888")}44`,
                      }}>
                        {ROLE_LABEL[p.assignment_role] || p.assignment_role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
