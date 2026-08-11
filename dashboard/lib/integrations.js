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
  {
    key: "ANTHROPIC_API_KEY",
    name: "Anthropic (ID Scanner)",
    powers: "Reads driver's licenses on the ID Scanner (/id-scan) via Claude vision",
    docs: "https://console.anthropic.com/settings/keys",
    clientExposed: false,
  },
  {
    key: "GOOGLE_ADDRESS_KEY",
    name: "Google Address Validation",
    powers: "Server-side USPS/CASS address verification for scanned IDs",
    docs: "https://console.cloud.google.com/google/maps-apis/credentials",
    clientExposed: false,
  },
  {
    key: "AWS_REGION",
    name: "AWS Region (Face Liveness)",
    powers: "Region for AWS Rekognition Face Liveness, e.g. us-east-1",
    docs: "https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html",
    clientExposed: false,
  },
  {
    key: "AWS_ACCESS_KEY_ID",
    name: "AWS Access Key ID (Face Liveness)",
    powers: "Certified anti-spoof liveness on Face ID login (Rekognition)",
    docs: "https://console.aws.amazon.com/iam/home#/security_credentials",
    clientExposed: false,
  },
  {
    key: "AWS_SECRET_ACCESS_KEY",
    name: "AWS Secret Access Key (Face Liveness)",
    powers: "Paired secret for the AWS access key above — server-side only",
    docs: "https://console.aws.amazon.com/iam/home#/security_credentials",
    clientExposed: false,
  },
];
