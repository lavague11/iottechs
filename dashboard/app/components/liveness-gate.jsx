"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Amplify } from "aws-amplify";
import "@aws-amplify/ui-react/styles.css";

// AWS Rekognition Face Liveness — the certified oval + flash check. We fetch a
// session + short-lived scoped credentials from our server (no Cognito), hand
// them to the detector, then read the verdict server-side. On a pass we surface
// the reference frame so the caller can run our own 1:N face match on it.
const FaceLivenessDetector = dynamic(
  () => import("@aws-amplify/ui-react-liveness").then((m) => m.FaceLivenessDetector),
  { ssr: false, loading: () => <div className="lv-load">Loading secure check…</div> }
);

export default function LivenessGate({ onPass, onFail, threshold = 80 }) {
  const [session, setSession] = useState(null);   // { sessionId, region, credentials }
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/liveness/session", { method: "POST" });
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) { setErr(j.error || "Couldn't start the liveness check."); return; }
        try { Amplify.configure({}); } catch (e) {}
        setSession(j);
      } catch (e) { if (alive) setErr("Connection error — try again."); }
    })();
    return () => { alive = false; };
  }, []);

  async function handleComplete() {
    try {
      const r = await fetch(`/api/liveness/result?sessionId=${encodeURIComponent(session.sessionId)}`);
      const j = await r.json();
      if (j.status === "SUCCEEDED" && (j.confidence ?? 0) >= threshold) {
        onPass?.({ confidence: j.confidence, referenceImage: j.referenceImage });
      } else {
        onFail?.({ reason: "not_live", confidence: j.confidence ?? null });
      }
    } catch (e) { onFail?.({ reason: "result_error" }); }
  }

  if (err) return <div className="lv-err">{err}</div>;
  if (!session) return <div className="lv-load">Starting secure liveness check…</div>;

  return (
    <div className="lv-wrap">
      <style>{LV_CSS}</style>
      <FaceLivenessDetector
        sessionId={session.sessionId}
        region={session.region}
        config={{
          credentialProvider: async () => ({
            accessKeyId: session.credentials.accessKeyId,
            secretAccessKey: session.credentials.secretAccessKey,
            sessionToken: session.credentials.sessionToken,
          }),
        }}
        onAnalysisComplete={handleComplete}
        onError={(e) => onFail?.({ reason: "aws_error", detail: e?.state || e?.message || "" })}
      />
    </div>
  );
}

const LV_CSS = `
.lv-wrap{max-width:480px;margin:0 auto}
.lv-load{padding:24px;text-align:center;color:#5b6275;font-size:.9rem}
.lv-err{padding:16px;text-align:center;color:#c0392b;background:#fbeeec;border-radius:12px;font-size:.9rem}
`;
