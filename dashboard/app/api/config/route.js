import { readFileSync } from "fs";
import path from "path";
import { secretValue, getJobByAccessId } from "../../../lib/db";

function fileFallback() {
  try { return JSON.parse(readFileSync(path.join(process.cwd(), "..", "config.json"), "utf8")); } catch { return {}; }
}

export async function GET(req) {
  // Vault (Development ▸ API Keys) wins, then env, then legacy config.json.
  const googleMapsApiKey = secretValue("GOOGLE_MAPS_API_KEY") || fileFallback().googleMapsApiKey || "";
  // When embedded for a project, hand back its address so the survey tool prefills + searches it.
  let address = "";
  try {
    const pid = new URL(req.url).searchParams.get("project");
    if (pid && pid !== "default") { const p = getJobByAccessId(pid); address = (p && p.address) || ""; }
  } catch { /* address stays empty → tool falls back to the demo address */ }
  return Response.json({ googleMapsApiKey, address });
}
