// Scoped translation support for the CUSTOMER assistant. PURE helper here (looksNonEnglish); the actual
// translate model call lives in ai-actions (it needs the key + usage/cap plumbing). Design: customer text is
// translated to English, run through the normal DETERMINISTIC router/guardrails, and the reply is translated
// back — the translate call has NO tools and NO actions, so it can't be talked into doing anything. Notes and
// tickets to the office always stay English (we act on the English translation).

// Cheap, no-cost guess at whether text is NOT English — so we only spend a translate call when needed.
// Triggers on any non-Latin letters (Arabic/CJK/Cyrillic…), Latin accents, or common Spanish/French markers.
export function looksNonEnglish(text) {
  const t = String(text || "");
  if (!t.trim()) return false;
  if (/[À-ɏͰ-ϿЀ-ӿ؀-ۿऀ-ॿ一-鿿぀-ヿ가-힯]/.test(t)) return true; // accented Latin + many scripts
  if (/\b(hola|gracias|por favor|cuánto|cuanto|cuesta|necesito|cámara|camara|quiero|dónde|donde|cómo|como está|buenos días|señor|ayuda|mi sistema|no funciona|bonjour|merci|s'il vous plaît|combien|besoin|caméra|aidez|probleme|problème)\b/i.test(t)) return true;
  return false;
}
