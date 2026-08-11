import { secretValue } from "../../../../lib/db";
import { headers } from "next/headers";
import { RekognitionClient, CreateFaceLivenessSessionCommand } from "@aws-sdk/client-rekognition";
import { STSClient, GetFederationTokenCommand } from "@aws-sdk/client-sts";

// Starts an AWS Rekognition Face Liveness session and hands the browser a set of
// SHORT-LIVED, SCOPED credentials (via STS GetFederationToken) that can do ONLY
// rekognition:StartFaceLivenessSession — never the account's real keys. The
// FaceLivenessDetector component uses these to stream the flash challenge to AWS.
// Public on purpose: face-LOGIN needs a liveness session BEFORE the person has a
// session cookie. Guarded by an IP throttle so nobody can burn AWS sessions
// (~$0.015 each) in a loop. Keys come from the vault (Development ▸ API Keys).
export const runtime = "nodejs";

// In-memory IP throttle: max 10 liveness starts per 10 min per IP (single node).
const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 10;
function throttled(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_HITS) { HITS.set(ip, arr); return true; }
  arr.push(now); HITS.set(ip, arr);
  if (HITS.size > 5000) { for (const [k, v] of HITS) if (!v.some((t) => now - t < WINDOW_MS)) HITS.delete(k); }
  return false;
}

const LIVENESS_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action: ["rekognition:StartFaceLivenessSession"], Resource: "*" }],
});

function awsKeys() {
  const region = secretValue("AWS_REGION") || "us-east-1";
  const accessKeyId = secretValue("AWS_ACCESS_KEY_ID");
  const secretAccessKey = secretValue("AWS_SECRET_ACCESS_KEY");
  return { region, accessKeyId, secretAccessKey, ok: !!(accessKeyId && secretAccessKey) };
}

export async function POST() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  if (throttled(ip)) return Response.json({ error: "Too many attempts — wait a minute, then try again." }, { status: 429 });

  const k = awsKeys();
  if (!k.ok) return Response.json({ error: "AWS Face Liveness isn't configured — add the AWS keys in Development ▸ API Keys." }, { status: 503 });

  try {
    const credentials = { accessKeyId: k.accessKeyId, secretAccessKey: k.secretAccessKey };
    const rek = new RekognitionClient({ region: k.region, credentials });
    const { SessionId } = await rek.send(new CreateFaceLivenessSessionCommand({}));

    const sts = new STSClient({ region: k.region, credentials });
    const fed = await sts.send(new GetFederationTokenCommand({ Name: "iot-liveness", Policy: LIVENESS_POLICY, DurationSeconds: 900 }));
    const c = fed.Credentials || {};

    return Response.json({
      sessionId: SessionId,
      region: k.region,
      credentials: { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.SessionToken, expiration: c.Expiration },
    });
  } catch (e) {
    console.error("liveness session:", e?.name, e?.message);
    return Response.json({ error: "Couldn't start the liveness check — check AWS keys/permissions." }, { status: 502 });
  }
}
