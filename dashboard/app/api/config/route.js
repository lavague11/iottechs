import { readFileSync } from "fs";
import path from "path";
import { secretValue, getJobByAccessId } from "../../../lib/db";

function fileFallback() {
  try { return JSON.parse(readFileSync(path.join(process.cwd(), "..", "config.json"), "utf8")); } catch { return {}; }
}

export async function GET(req) {
  // Vault (Development ▸ API Keys) wins, then env, then legacy config.json.
  const googleMapsApiKey = secretValue("GOOGLE_MAPS_API_KEY") || fileFallback().googleMapsApiKey || "";
  // When embedded for a project, hand back its name + address so the survey tool can title
  // its header and prefill/search the property.
  let address = "", name = "";
  try {
    const pid = new URL(req.url).searchParams.get("project");
    if (pid && pid !== "default") {
      const p = getJobByAccessId(pid);
      if (p) { address = p.address || ""; name = p.company_name || p.customer || p.contact_name || ""; }
    }
  } catch { /* stays empty → tool falls back to defaults */ }
  return Response.json({ googleMapsApiKey, address, name });
}
