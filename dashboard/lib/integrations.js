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
    key: "TWILIO_ACCOUNT_SID",
    name: "Twilio Account SID",
    powers: "Phone-number SMS 2FA at login (Twilio Verify)",
    docs: "https://console.twilio.com",
    clientExposed: false,
  },
  {
    key: "TWILIO_AUTH_TOKEN",
    name: "Twilio Auth Token",
    powers: "Paired secret for the Twilio Account SID — server-side only",
    docs: "https://console.twilio.com",
    clientExposed: false,
  },
  {
    key: "TWILIO_VERIFY_SERVICE_SID",
    name: "Twilio Verify Service SID",
    powers: "The Verify service (VA…) that sends & checks login codes",
    docs: "https://console.twilio.com/us1/develop/verify/services",
    clientExposed: false,
  },
  {
    key: "TELNYX_API_KEY",
    name: "Telnyx API Key",
    powers: "Alternative SMS 2FA provider (Telnyx Verify) — cheaper per message",
    docs: "https://portal.telnyx.com/#/app/api-keys",
    clientExposed: false,
  },
  {
    key: "TELNYX_VERIFY_PROFILE_ID",
    name: "Telnyx Verify Profile ID",
    powers: "The Telnyx Verify profile that sends & checks login codes",
    docs: "https://portal.telnyx.com/#/app/verify",
    clientExposed: false,
  },
  {
    key: "SMS_PROVIDER",
    name: "SMS Provider (optional)",
    powers: "Force which SMS 2FA provider to use: 'telnyx' or 'twilio'. Leave blank to auto-detect from whichever keys are filled in.",
    docs: "",
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
    key: "OPENAI_API_KEY",
    name: "OpenAI (Survey AI)",
    powers: "Satellite Enhance + Floor-Plan Generate in the site survey (server-side only)",
    docs: "https://platform.openai.com/api-keys",
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
