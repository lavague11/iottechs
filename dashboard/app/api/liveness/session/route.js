import { getSessionUser } from "../../../../lib/session";
import { secretValue } from "../../../../lib/db";
import { RekognitionClient, CreateFaceLivenessSessionCommand } from "@aws-sdk/client-rekognition";
import { STSClient, GetFederationTokenCommand } from "@aws-sdk/client-sts";

// Starts an AWS Rekognition Face Liveness session and hands the browser a set of
// SHORT-LIVED, SCOPED credentials (via STS GetFederationToken) that can do ONLY
// rekognition:StartFaceLivenessSession — never the account's real keys. The
// FaceLivenessDetector component uses these to stream the flash challenge to AWS.
// Staff-only. Keys come from the vault (Development ▸ API Keys).
export const runtime = "nodejs";

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
  const user = await getSessionUser();
  if (!user?.id) return Response.json({ error: "Forbidden" }, { status: 403 });

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
