// Schema registry for the document-reader library. Each entry drives a generic reader:
// the fields it extracts, the vision prompt, and which field indexes the record (subject +
// number) in the searchable library. No secrets here. The driver's-licence reader is its own
// richer tool (/id-scan); these are full-page documents (photo → vision → fields → save).

export const DOC_READERS = {
  registration: {
    key: "registration",
    label: "Registration",
    noun: "vehicle registration",
    subjectKey: "owner_name",
    numberKey: "plate",
    fields: [
      { k: "owner_name", l: "Owner" },
      { k: "owner_address", l: "Address", w: 2 },
      { k: "plate", l: "Plate", mono: true },
      { k: "vin", l: "VIN", mono: true, w: 2 },
      { k: "year", l: "Year" },
      { k: "make", l: "Make" },
      { k: "model", l: "Model" },
      { k: "color", l: "Color" },
      { k: "state", l: "State" },
      { k: "expires", l: "Expires", ph: "MM/DD/YYYY" },
    ],
  },
  insurance: {
    key: "insurance",
    label: "Insurance",
    noun: "insurance card (auto or homeowner)",
    subjectKey: "member_name",
    numberKey: "policy_number",
    fields: [
      { k: "carrier", l: "Carrier", w: 2 },
      { k: "member_name", l: "Member" },
      { k: "policy_number", l: "Policy #", mono: true },
      { k: "group_number", l: "Group #", mono: true },
      { k: "plan_type", l: "Type", ph: "auto / home" },
      { k: "effective_date", l: "Effective", ph: "MM/DD/YYYY" },
      { k: "expiration_date", l: "Expires", ph: "MM/DD/YYYY" },
      { k: "naic", l: "NAIC" },
    ],
  },
  business_license: {
    key: "business_license",
    label: "Business license",
    noun: "business license or permit",
    subjectKey: "business_name",
    numberKey: "license_number",
    fields: [
      { k: "business_name", l: "Business", w: 2 },
      { k: "owner_name", l: "Owner / officer" },
      { k: "license_number", l: "License #", mono: true },
      { k: "license_type", l: "Type" },
      { k: "jurisdiction", l: "Jurisdiction" },
      { k: "address", l: "Address", w: 2 },
      { k: "issue_date", l: "Issued", ph: "MM/DD/YYYY" },
      { k: "expiration_date", l: "Expires", ph: "MM/DD/YYYY" },
      { k: "ein", l: "EIN", mono: true },
    ],
  },
};

export const DOC_KEYS = Object.keys(DOC_READERS);

// Build the extraction prompt from a reader's field list. Mirrors the licence reader's
// contract: flat JSON, empty strings for unreadable fields, plus an `_uncertain` array.
export function promptFor(type) {
  const r = DOC_READERS[type];
  if (!r) return "";
  const keys = r.fields.map((f) => `"${f.k}"`).join(", ");
  return [
    `You are reading a US ${r.noun}.`,
    "Read ONLY this document. If any other document is in the frame, ignore it completely.",
    "Return ONLY a JSON object — no preamble, no explanation, no markdown fences.",
    `Keys (use an empty string for anything you cannot read with confidence — never guess): ${keys}`,
    "Rules:",
    "- All dates as MM/DD/YYYY.",
    '- "state" / "jurisdiction" as the 2-letter code where applicable.',
    "- Copy identifiers (plate, VIN, policy #, license #, EIN) exactly as printed.",
    "- If the image is not this kind of document, return every key as an empty string.",
    '- Add one extra key, "_uncertain": an array of the field names you are not fully confident you read correctly. Use [] if everything was clear.',
  ].join("\n");
}
