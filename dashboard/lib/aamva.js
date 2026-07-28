// AAMVA driver's-licence barcode parser.
//
// Every US/Canadian licence carries a PDF417 barcode on the back holding the same data printed on
// the front, as tagged 3-letter elements (AAMVA DL/ID Card Design Standard). Decoding that barcode
// is exact — unlike OCR of the printed face, which misreads names and dates constantly.
//
// Pure string work: no network, no keys. Pairs with components/dl-scanner.jsx, which decodes the
// photo IN THE BROWSER and throws the image away — the licence picture is never uploaded.

const FIELDS = {
  DAQ: "license_no",
  DCS: "last",        // family name
  DAC: "first",       // given name
  DAD: "middle",
  DBB: "dob",         // date of birth
  DBA: "license_exp", // expiry
  DBD: "issued",
  DAG: "street",
  DAI: "city",
  DAJ: "license_state",
  DAK: "zip",
  DCG: "country",
  DAU: "height",
  DBC: "sex",
};

// AAMVA dates are MMDDCCYY in the US and CCYYMMDD in Canada. Detect by the country element when
// present, else by whether the leading pair is a plausible month.
function parseDate(raw, country) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length !== 8) return null;
  const usFirst = country !== "CAN" && +d.slice(0, 2) >= 1 && +d.slice(0, 2) <= 12;
  const [y, m, day] = usFirst
    ? [d.slice(4, 8), d.slice(0, 2), d.slice(2, 4)]
    : [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)];
  if (+m < 1 || +m > 12 || +day < 1 || +day > 31) return null;
  return `${y}-${m}-${day}`;   // ISO, ready for an <input type="date">
}

function titleCase(s) {
  return String(s || "").trim().toLowerCase()
    .split(/\s+/).map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
}

// Returns the fields we actually use on the onboarding form, or null when the text isn't AAMVA.
export function parseAamva(text) {
  const raw = String(text || "");
  if (!/ANSI\s?\d|^@/.test(raw) && !/DAQ/.test(raw)) return null;

  const out = {};
  // Elements are newline-separated "XXXvalue". Some issuers pad with \r — split on either.
  // The FIRST element runs straight on from the subfile designator ("DL" or "ID") at the end of
  // the header line, so strip that prefix before reading the code.
  for (let line of raw.split(/[\r\n]+/)) {
    const dl = line.lastIndexOf("DL");
    if (dl > 0 && FIELDS[line.slice(dl + 2, dl + 5).toUpperCase()]) line = line.slice(dl + 2);
    else if (/^(DL|ID)/.test(line) && FIELDS[line.slice(2, 5).toUpperCase()]) line = line.slice(2);
    const code = line.slice(0, 3).toUpperCase();
    const key = FIELDS[code];
    if (!key) continue;
    const value = line.slice(3).trim();
    if (value && value !== "NONE") out[key] = value;
  }
  // ZIPs arrive zero-padded to 9 ("071030000") — show the familiar 5 or ZIP+4.
  if (out.zip) {
    const z = out.zip.replace(/\D/g, "");
    out.zip = z.length === 9 ? (z.endsWith("0000") ? z.slice(0, 5) : `${z.slice(0, 5)}-${z.slice(5)}`) : z;
  }
  if (!out.license_no && !out.last) return null;   // nothing usable — treat as a failed read

  const country = out.country;
  const name = [out.first, out.middle, out.last].filter(Boolean).join(" ");
  const street = [out.street, out.city, out.license_state, out.zip].filter(Boolean).join(", ");

  return {
    legal_name: name ? titleCase(name) : null,
    dob: parseDate(out.dob, country),
    license_no: out.license_no || null,
    license_state: out.license_state || null,
    license_exp: parseDate(out.license_exp, country),
    address: street ? titleCase(street).replace(/\b([a-z]{2}),/i, (m, s) => `${s.toUpperCase()},`) : null,
  };
}
