// #6 Explain-the-quote — a small, deterministic glossary of standard CCTV / AV / alarm line items and quote
// terms, used by the customer assistant to explain WHAT a line is. PURE + 0-token. Entries are generic,
// industry-standard explanations that are safe to show any customer; they NEVER state a price and never carry
// company-specific pricing. The `explain_item` read confirms the term against the customer's OWN proposal
// ("your package includes N × …") — this file only says what the thing is and why it's there.

// Each entry: { id, match, title, body }. `match` is tested against the raw lowercased question AND against a
// line name when grounding. Order matters — the most specific term wins (checked top to bottom).
export const GLOSSARY = Object.freeze([
  { id: "nvr", match: /\b(nvr|dvr|network video recorder|recorder|head ?end)\b/,
    title: "NVR (the recorder)",
    body: "The NVR is the recorder every camera connects to. It powers the cameras over their network cable, stores all the footage, and is what you log into to watch live or review recordings. The channel number (8 / 16 / 32) is how many cameras it supports, so it's sized to your camera count." },
  { id: "camera", match: /\b(camera|cam|cctv)\b/,
    title: "Security camera",
    body: "Each camera watches one area and sends its video to the NVR over a single network cable that also powers it. Where each one points and what it covers is set during the site survey, so every camera has a specific job — an entrance, a register, a blind spot — rather than being decorative." },
  { id: "drop", match: /\b(cat ?6 drop|line drop|cable drop|the drop|a drop|wiring drop|network drop|data drop|drop)\b/,
    title: "Cable drop",
    body: "A \"drop\" is one new low-voltage cable run from the equipment rack to a device location — pulled through walls or ceilings, terminated, and tested. It's the labor and materials to physically get a clean, powered connection to each camera or device, which is most of the hands-on install work." },
  { id: "labor", match: /\b(labor|labour|install(?:ation)? (?:fee|charge|cost|labor)|mounting|device mounting|bundle|per[- ]camera)\b/,
    title: "Install labor",
    body: "The labor covers running and terminating the cable, mounting the device, and connecting and testing it. On a camera it's bundled per camera (the drop plus mounting and setup) so the quote scales cleanly with the number of devices instead of hiding the install cost." },
  { id: "keystone", match: /\b(keystone|jack|termination)\b/,
    title: "Keystone / termination",
    body: "A keystone is the wall jack where a cable terminates into a clean, labeled port — the finished end of a cable run so a device can be plugged in and later serviced without re-pulling wire." },
  { id: "speaker", match: /\b(ceiling speaker|speaker|speakers)\b/,
    title: "Speaker",
    body: "A commercial ceiling speaker delivers even background audio across a zone. Speakers are wired back to an amplifier that drives them, so the quote pairs the speaker count with an amplifier sized to the zones." },
  { id: "amplifier", match: /\b(amplifier|amp|4[- ]zone|head unit)\b/,
    title: "Amplifier",
    body: "The amplifier is the head end of the sound system — it powers the speakers and splits the building into zones you can control separately (e.g. dining vs patio). One amplifier drives multiple speakers, so it's priced once for the system, not per speaker." },
  { id: "rack", match: /\b(rack ?& ?(?:mount|dress)|rack and (?:mount|dress)|rack|patch panel|equipment rack)\b/,
    title: "Rack & mount",
    body: "The rack is where the recorder, amplifier, network gear and cabling live — mounted, powered and dressed (cables organized and labeled) in one place. It keeps the head-end equipment protected, serviceable and tidy rather than loose on a shelf." },
  { id: "keypad", match: /\b(keypad|key pad)\b/,
    title: "Alarm keypad",
    body: "The keypad is how you arm and disarm the alarm and see its status. It's the day-to-day control point for the system, usually placed by the main entrance." },
  { id: "motion", match: /\b(motion sensor|motion detector|motion|pir)\b/,
    title: "Motion sensor",
    body: "A motion sensor detects movement inside a space when the system is armed and triggers the alarm. It covers an interior area as a backup to the door and window sensors on the perimeter." },
  { id: "glassbreak", match: /\b(glass[- ]?break|glass break|glass sensor)\b/,
    title: "Glass-break sensor",
    body: "A glass-break sensor listens for the specific sound frequency of breaking glass, so a window can be protected even if a door sensor isn't triggered — useful for storefronts and large windows." },
  { id: "contact", match: /\b(door ?\/? ?window sensor|door sensor|window sensor|contact sensor|contact)\b/,
    title: "Door / window sensor",
    body: "A contact sensor has two parts — one on the frame, one on the door or window — and trips the alarm when they separate. It's the perimeter protection that tells the system an opening was used." },
  { id: "panel", match: /\b(control panel|alarm panel|panel)\b/,
    title: "Control panel",
    body: "The control panel is the brain of the alarm — every sensor and keypad reports to it, and it decides when to sound the alarm and send alerts. There's one per system." },
  { id: "smoke", match: /\b(smoke|co detector|carbon monoxide|smoke ?\/? ?co)\b/,
    title: "Smoke / CO detector",
    body: "A monitored smoke / carbon-monoxide detector ties life-safety into the alarm system so an alert goes out even when no one is on site." },
  { id: "cardreader", match: /\b(card reader|access reader|badge reader|fob reader|reader)\b/,
    title: "Card reader",
    body: "A card reader is the access-control pad at a door — staff present a card or fob to unlock it, and every entry is logged. It pairs with a strike or maglock that actually releases the door." },
  { id: "strike", match: /\b(electric strike|door strike|strike)\b/,
    title: "Electric strike",
    body: "An electric strike is the hardware in the door frame that releases the latch when access is granted, so an approved card unlocks the door without a key." },
  { id: "maglock", match: /\b(maglock|mag lock|magnetic lock)\b/,
    title: "Maglock",
    body: "A maglock is a magnetic lock that holds a door shut until the access system releases it — used where a strike won't fit, and always wired to fail safe for egress." },
  { id: "controller", match: /\b(door controller|access controller|controller)\b/,
    title: "Door controller",
    body: "The door controller is the access-control brain for a door or group of doors — it decides who gets in based on the readers and keeps the entry log." },
  // Quote-level terms (concepts, not equipment). `explain_terms` handles deposit / PCP with the customer's
  // real numbers; these are the plain-language definitions it leans on.
  { id: "poe", match: /\b(poe|power over ethernet)\b/,
    title: "PoE (power over Ethernet)",
    body: "PoE means a single network cable carries both the data and the power to a device, so a camera or access point needs one wire instead of a separate power outlet at each location." },
]);

// Resolve a question (and optionally a matched line name) to the single best glossary entry, or null.
// Pure: searches the raw text first; the most specific entry (earliest in GLOSSARY) wins.
export function glossaryFor(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  for (const e of GLOSSARY) if (e.match.test(t)) return e;
  return null;
}

// Does this question look like a "what / why is this item" explain request (vs a status/money question)?
// Needs a REASON-ASKING cue AND an equipment/term word, so it never hijacks an unrelated FAQ question — and
// deliberately EXCLUDES bare "need" / "do we need" phrasings, which are doubt (an objection), so those reach
// the customer objection capture (#7) instead of getting a generic glossary answer.
const EXPLAIN_CUE = /\b(what(?:'s| is| are| does)|why(?:'s| is| are| do(?:es)?)?|explain|tell me about|what do you mean by|purpose of|point of)\b/i;
export function isExplainItem(text) {
  const t = String(text || "").toLowerCase();
  return EXPLAIN_CUE.test(t) && glossaryFor(t) != null;
}
