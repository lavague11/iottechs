// The company's NAP — Name, Address, Phone — in ONE place.
//
// This exists because the wrong number was on every PDF the company sends. `(646) 396-0775` was
// hardcoded six times across four renderers (the shared PDF chrome, so proposals; invoices; change
// orders; completion certificates) and that number is **the Zelle payment token, not a contact
// number**. The canonical public number is (917) 727-0081, which until now only `lib/email.js` had,
// in a local const of its own.
//
// Anything customer-facing — a PDF header or footer, an email, a page, a schema block — takes its
// contact details from here. A test asserts the Zelle token appears nowhere but this file's warning.
export const COMPANY_NAME = "IOT TECHS";
export const SUPPORT_PHONE = "(917) 727-0081";
export const SUPPORT_TEL = "+19177270081";          // tel: href form
export const SUPPORT_EMAIL = "support@iot-techs.com";
export const SUPPORT_WEB = "www.iot-techs.com";

// NEVER use this as a contact number. It is the Zelle handle the business receives payments on, and
// it was being printed as "call us" on customer documents. Exported only so the guard test can look
// for it without hardcoding it a seventh time.
export const ZELLE_TOKEN_NOT_A_PHONE = "(646) 396-0775";

// The one-line contact strip the PDF renderers print. `sep` matches each document's existing spacing
// so this change moves no pixels.
export function contactLine(sep = "  ·  ") {
  return [SUPPORT_PHONE, SUPPORT_EMAIL, SUPPORT_WEB].join(sep);
}
// The same strip with the company name in front, for document footers.
export function footerLine(sep = "  ·  ", suffix = "") {
  return [COMPANY_NAME, SUPPORT_PHONE, SUPPORT_EMAIL, SUPPORT_WEB].join(sep) + (suffix ? sep + suffix : "");
}
