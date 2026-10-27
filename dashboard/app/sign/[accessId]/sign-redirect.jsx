"use client";
import { useEffect } from "react";

// Forwards a real visitor from the shareable /sign/<id> link to the actual signer on the project page.
// A social crawler never runs this (it reads the OG card from the server HTML); only a browser redirects.
export default function SignRedirect({ dest }) {
  useEffect(() => {
    const t = setTimeout(() => { try { window.location.replace(dest); } catch { window.location.href = dest; } }, 40);
    return () => clearTimeout(t);
  }, [dest]);
  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, background: "#0B0F1A", color: "#E8E6E1", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: ".82rem", fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "#C9A96E" }}>IOT TECHS</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>Opening your proposal…</div>
      <a href={dest} style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 22px", borderRadius: 10, background: "#C9A96E", color: "#101418", fontWeight: 700, fontSize: ".9rem", textDecoration: "none" }}>Review &amp; Sign →</a>
      <noscript><meta httpEquiv="refresh" content={`0;url=${dest}`} /></noscript>
    </main>
  );
}
