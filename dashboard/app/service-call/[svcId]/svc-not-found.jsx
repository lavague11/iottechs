import { Wordmark } from "../../components/brand";

// Unknown Service Call ID — neutral, no data. Points the visitor at reporting a new issue.
export default function SvcNotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 24, textAlign: "center", background: "radial-gradient(1000px 460px at 50% -10%,#f0f2f7 0%,#fff 60%)", fontFamily: "'Hanken Grotesk',system-ui,sans-serif", color: "#0e1320" }}>
      <Wordmark height={28} />
      <h1 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: "1.6rem", margin: 0 }}>We couldn&rsquo;t find that service call.</h1>
      <p style={{ color: "#5b6275", maxWidth: "42ch", margin: 0 }}>Double-check the Service Call ID, or report the issue again and we&rsquo;ll open a fresh one.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
        <a href="/report-issue" style={{ background: "#C9A96E", color: "#0e1320", fontWeight: 700, padding: "13px 24px", borderRadius: 12, textDecoration: "none" }}>Report an issue</a>
        <a href="/" style={{ background: "#fff", color: "#0e1320", fontWeight: 700, padding: "12px 22px", borderRadius: 12, textDecoration: "none", border: "1.5px solid #e6e8ee" }}>Home</a>
      </div>
    </div>
  );
}
