import { readFileSync } from "fs";
import path from "path";
import { secretValue } from "../../../lib/db";

function fileFallback() {
  try { return JSON.parse(readFileSync(path.join(process.cwd(), "..", "config.json"), "utf8")); } catch { return {}; }
}

export async function GET() {
  // Vault (Development ▸ API Keys) wins, then env, then legacy config.json.
  const googleMapsApiKey = secretValue("GOOGLE_MAPS_API_KEY") || fileFallback().googleMapsApiKey || "";
  return Response.json({ googleMapsApiKey });
}
