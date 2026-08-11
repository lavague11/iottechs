import { getSessionUser } from "../../../../lib/session";
import { secretValue } from "../../../../lib/db";
import { RekognitionClient, GetFaceLivenessSessionResultsCommand } from "@aws-sdk/client-rekognition";

// Reads the AWS Face Liveness verdict for a session (server-side, with the real
// keys — the browser never sees the score logic). Returns { status, confidence }.
// The caller only proceeds to the face match when confidence clears the bar.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await getSessionUser();
  if (!user?.id) return Response.json({ error: "Forbidden" }, { status: 403 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "sessionId required" }, { status: 400 });

  const region = secretValue("AWS_REGION") || "us-east-1";
  const accessKeyId = secretValue("AWS_ACCESS_KEY_ID");
  const secretAccessKey = secretValue("AWS_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) return Response.json({ error: "AWS not configured" }, { status: 503 });

  try {
    const rek = new RekognitionClient({ region, credentials: { accessKeyId, secretAccessKey } });
    const r = await rek.send(new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId }));
    // AWS returns a reference frame of the live face — reuse it for our own 1:N match.
    const bytes = r.ReferenceImage?.Bytes;
    const referenceImage = bytes ? "data:image/jpeg;base64," + Buffer.from(bytes).toString("base64") : null;
    return Response.json({ status: r.Status, confidence: r.Confidence ?? null, referenceImage });
  } catch (e) {
    console.error("liveness result:", e?.name, e?.message);
    return Response.json({ error: "Couldn't read the liveness result." }, { status: 502 });
  }
}
