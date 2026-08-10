import { redirect } from "next/navigation";
import { getSessionUser, getNotifSummary } from "../../lib/session";
import { getUserIdentity, getEnrollInvite } from "../../lib/db";
import { Wordmark } from "../components/brand";
import EnrollClient from "./enroll-client";

// Self-service enrolment (signed-in staff) OR invited enrolment via a one-time
// ?token link (no login required — the token names the account).
export default async function EnrollPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const token = String(sp.token || "").trim();

  if (token) {
    const inv = getEnrollInvite(token);
    if (!inv || !inv.valid) return <InvalidInvite reason={inv?.reason} />;
    return <EnrollClient invite={{ token, name: inv.name }} current={null} />;
  }

  const user = await getSessionUser();
  if (!user?.id) redirect("/login");
  const alerts = getNotifSummary(user.id);
  const cur = getUserIdentity(user.id);
  const current = cur ? { status: cur.status, id_type: cur.id_type, enrolled_at: cur.enrolled_at } : null;

  return <EnrollClient user={user} alerts={alerts} current={current} />;
}

function InvalidInvite({ reason }) {
  const msg = reason === "used"
    ? "This enrollment link has already been used."
    : reason === "expired"
      ? "This enrollment link has expired."
      : "This enrollment link isn't valid.";
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "radial-gradient(1100px 500px at 50% -10%,#f4f5f8,#eceef3)", fontFamily: "system-ui,sans-serif", padding: 24 }}>
      <div style={{ background: "#fff", border: "1px solid #e6e8ee", borderRadius: 18, padding: "34px 30px", maxWidth: 420, textAlign: "center", boxShadow: "0 40px 90px -44px rgba(14,19,32,.5)" }}>
        <a href="/" aria-label="IOT TECHS" style={{ display: "inline-flex", marginBottom: 16 }}><Wordmark height={26} /></a>
        <h1 style={{ fontSize: "1.3rem", margin: "0 0 8px", color: "#0e1320" }}>Link unavailable</h1>
        <p style={{ color: "#5b6275", fontSize: ".92rem", lineHeight: 1.55, margin: 0 }}>{msg} Ask an admin to send a fresh one, or sign in and set up Face ID from your account.</p>
        <a href="/login" style={{ display: "inline-block", marginTop: 18, fontWeight: 800, color: "#b08f4f", textDecoration: "none" }}>Go to sign in →</a>
      </div>
    </div>
  );
}
