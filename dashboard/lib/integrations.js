// Known third-party integrations shown in Development ▸ API Keys.
// This file holds NO secrets — only the registry describing each key: what it's
// called, what it powers, and where to get it. The actual values live in the
// app_secrets vault (DB) or env, read via secretValue() in lib/db.js.
//
// clientExposed: true means the key is inherently public (e.g. a browser-side
// Google Maps key served through /api/config). Everything else is server-only
// and must never be sent to the browser.
export const INTEGRATIONS = [
  {
    key: "GOOGLE_MAPS_API_KEY",
    name: "Google Maps / Places",
    powers: "Address autocomplete on intake, apply & survey forms",
    docs: "https://console.cloud.google.com/google/maps-apis/credentials",
    clientExposed: true,
  },
  {
    key: "TRACKING_API_KEY",
    name: "AfterShip Tracking",
    powers: "Live carrier shipment tracking on the shipping tool",
    docs: "https://admin.aftership.com/settings/api-keys",
    clientExposed: false,
  },
  {
    key: "RESEND_API_KEY",
    name: "Resend Email",
    powers: "Transactional customer emails (proposal sent, stage updates)",
    docs: "https://resend.com/api-keys",
    clientExposed: false,
  },
];
