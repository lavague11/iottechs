"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPage() {
  const [sent, setSent] = useState(false);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f8fa", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: "36px 32px", maxWidth: 400, width: "100%", boxShadow: "0 4px 32px rgba(14,19,32,.1)" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: "1.3rem", color: "#0e1320", marginBottom: 6 }}>
            Reset Password
          </div>
          <div style={{ fontSize: ".88rem", color: "#6b7280" }}>
            Password resets are handled by your administrator.
          </div>
        </div>

        {sent ? (
          <div>
            <div style={{ background: "rgba(28,138,69,.08)", border: "1px solid rgba(28,138,69,.25)", borderRadius: 10, padding: "14px 16px", color: "#1c6b3a", fontSize: ".88rem", marginBottom: 20 }}>
              <strong>Request noted.</strong> Your administrator will generate a temporary password and share it with you directly. Use it to sign in, then update your password from your profile.
            </div>
            <Link href="/login" style={{ display: "block", textAlign: "center", fontSize: ".86rem", color: "#C9A96E", fontWeight: 600, textDecoration: "none" }}>
              ← Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <div style={{ fontSize: ".86rem", color: "#374151", lineHeight: 1.6, marginBottom: 24 }}>
              Your admin can generate a <strong>temporary password</strong> for your account from the <em>Users</em> panel. Once you receive it, sign in and update your password from your profile.
            </div>

            <button
              onClick={() => setSent(true)}
              style={{ width: "100%", padding: "12px", background: "#C9A96E", color: "#0a1020", border: "none", borderRadius: 12, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: "1rem", cursor: "pointer", marginBottom: 14 }}
            >
              I&apos;ve Notified My Admin
            </button>

            <Link href="/login" style={{ display: "block", textAlign: "center", fontSize: ".86rem", color: "#6b7280", textDecoration: "none" }}>
              ← Back to Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
