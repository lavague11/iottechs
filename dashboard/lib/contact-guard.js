// Who may write a project's contact RECORD (name / business / phone / email / address). Pure — the server
// actions pass in the facts (ownership, whether intake is already confirmed, the role capability) and every
// action that writes the record asks this ONE function. Writing a phone re-derives the project's access PIN
// (db.updateProjectContact), so this is also what stops a customer rotating their own credential.
export const CONTACT_KEYS = Object.freeze(["company_name", "contact_name", "contact_phone", "contact_email", "address"]);
export const touchesContact = (fields) => !!fields && CONTACT_KEYS.some((k) => k in fields);

// → an error string (nothing may be written) or null (go ahead).
export function contactWriteError({ role, owns = false, infoConfirmed = false, canEditContact = false, fields }) {
  const touches = touchesContact(fields);
  if (!owns) return "Not your project.";   // every role: a grant for X is not a grant for Y
  if (role === "customer") {
    // Once, at intake: until info_confirmed_at is stamped. After that only the free-text message is theirs.
    if (touches && infoConfirmed) return "Details are locked. Contact the office to change them.";
    return null;
  }
  if (touches && !canEditContact) return "Unauthorized.";
  if (!touches && !["admin", "manager", "sales", "tech"].includes(role)) return "Unauthorized.";
  return null;
}
