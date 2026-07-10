import { readFileSync } from "fs";
import path from "path";

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(path.join(process.cwd(), "..", "config.json"), "utf8")); } catch {}
  return {
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || cfg.googleMapsApiKey || "",
  };
}

export async function GET() {
  const { googleMapsApiKey } = loadConfig();
  return Response.json({ googleMapsApiKey });
}
