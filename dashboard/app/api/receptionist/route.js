import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import {
  secretValue, rateAllow, appendMayaMessage, mayaThread,
  createLeadProject, notifyRoles, getSupportArticles, logProjectEvent,
} from "../../../lib/db";
import { findKnowledge } from "../../../lib/ai-knowledge";
import {
  mergeLead, leadComplete, missingLeadField, wantsQuote, detectService,
  receptionistHandoff, looksLikeExistingClient,
} from "../../../lib/ai-receptionist";

// PUBLIC receptionist endpoint (unauthenticated website visitor). DELIBERATELY deterministic — no model runs
// on untrusted public text, no project/customer reads. The only write is creating a LEAD through the canonical
// db.createLeadProject. Gated behind MAYA_RECEPTIONIST (default off) + a DB-backed per-IP rate limit. An
// anonymous session cookie keys the stored thread (channel 'public') and the lead provenance.
export const runtime = "nodejs";

const SESSION_COOKIE = "maya_rx";
const MAX_TEXT = 500;

function hashIp(ip) { return crypto.createHash("sha256").update(String(ip || "local")).digest("hex").slice(0, 32); }
function prettyContact(c) {
  if (!c) return "";
  if (c.kind === "email") return c.value;
  const d = String(c.value || "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
}

async function sessionKey(jar) {
  let key = jar.get(SESSION_COOKIE)?.value;
  if (!key || !/^[a-f0-9]{24}$/.test(key)) {
    key = crypto.randomBytes(12).toString("hex");
    try { jar.set(SESSION_COOKIE, key, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" }); } catch {}
  }
  return key;
}

function faq(text) {
  try {
    const articles = (getSupportArticles("customer") || []).map((a) => ({ ...a, audience: "customer" }));
    const hit = findKnowledge(text, { articles });
    if (hit) return `From our help center — "${hit.title}": ${hit.snippet}`;
  } catch {}
  return null;
}

const ASK = {
  need: "What are you looking to get set up — cameras, an alarm, access control, networking, audio, or a TV install?",
  name: "Happy to help with that. What name should I put this under?",
  contact: "What's the best phone number or email for our team to reach you?",
};

export async function GET() {
  const jar = await cookies();
  if (secretValue("MAYA_RECEPTIONIST") !== "on") return Response.json({ enabled: false });
  const key = await sessionKey(jar);
  return Response.json({ enabled: true, thread: mayaThread({ channel: "public", sessionKey: key, limit: 40 }) });
}

export async function POST(req) {
  if (secretValue("MAYA_RECEPTIONIST") !== "on") return Response.json({ ok: false, error: "unavailable" }, { status: 404 });

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "local";
  if (!rateAllow(`rx:${hashIp(ip)}`, 30, 600)) return Response.json({ ok: false, error: "Too many messages — please try again shortly." }, { status: 429 });

  const jar = await cookies();
  const key = await sessionKey(jar);

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "bad request" }, { status: 400 }); }
  const text = String(body?.text || "").trim().slice(0, MAX_TEXT);
  if (!text) return Response.json({ ok: false, error: "empty" }, { status: 400 });
  // Client-held capture state, re-validated here (the server is the authority on completion + creation).
  const prior = (body?.lead && typeof body.lead === "object") ? {
    need: typeof body.lead.need === "string" ? body.lead.need.slice(0, 40) : null,
    name: typeof body.lead.name === "string" ? body.lead.name.slice(0, 60) : null,
    contact: body.lead.contact && typeof body.lead.contact === "object"
      ? { kind: body.lead.contact.kind === "email" ? "email" : "phone", value: String(body.lead.contact.value || "").slice(0, 120) }
      : null,
  } : {};

  appendMayaMessage({ channel: "public", sessionKey: key, role: "you", text });

  const reply = (speak, extra = {}) => {
    appendMayaMessage({ channel: "public", sessionKey: key, role: "ai", text: speak });
    return Response.json({ ok: true, reply: speak, ...extra });
  };

  // 1) Wants a human / upset / emergency → notify the team, reassure. (No contact yet → we still ask for one.)
  const ho = receptionistHandoff(text);
  if (ho) {
    try { notifyRoles(["admin", "manager"], { type: "receptionist_handoff", title: `Website visitor wants a person${ho.urgent ? " — URGENT" : ""}`, body: `"${text.slice(0, 160)}"`, link: `/dashboard` }); } catch {}
    return reply(ho.urgent
      ? "I've flagged this for our team right away. If this is a safety emergency, please call 911. Can I grab a phone number so someone can reach you fast?"
      : "I've let our team know you'd like to speak with someone. What's the best number or email to reach you?");
  }

  // 2) Already-a-client question → the receptionist has no account context; point them to sign in.
  if (looksLikeExistingClient(text) && !wantsQuote(text)) {
    return reply("If you're already a customer, sign in to your project portal to see your status, quote, and balance.", { link: { href: "/login", label: "Sign in" } });
  }

  // 3) Lead capture. Merge anything the message revealed; if they want a quote OR we're mid-capture, drive it.
  const lead = mergeLead(prior, text);
  const inCapture = wantsQuote(text) || prior.need || prior.name || prior.contact || detectService(text);
  if (inCapture) {
    if (leadComplete(lead)) {
      let created = null;
      try {
        created = createLeadProject(
          lead.name,
          lead.contact.kind === "email" ? lead.contact.value : null,
          lead.contact.kind === "phone" ? lead.contact.value : null,
          null, lead.need || "CCTV", null, null, {}
        );
      } catch {}
      if (created?.accessId) {
        try { logProjectEvent(created.accessId, { kind: "lead", label: `New lead via website receptionist — "${text.slice(0, 120)}"`, actor: "Maya" }); } catch {}
        try { notifyRoles(["admin", "manager", "sales"], { type: "receptionist_lead", title: `New lead: ${lead.name}${lead.need ? ` (${lead.need})` : ""}`, body: `${lead.contact.kind}: ${lead.contact.value}`, link: `/project/${created.accessId}` }); } catch {}
      }
      return reply(`Thanks, ${lead.name.split(" ")[0]} — you're all set. Our team will reach out${lead.contact.kind === "phone" ? ` at ${prettyContact(lead.contact)}` : ` by email`} to put together your ${lead.need || "security"} quote.`, { lead, done: true });
    }
    const miss = missingLeadField(lead);
    return reply(ASK[miss] || "Could you tell me a bit more?", { lead });
  }

  // 4) Approved public FAQ.
  const k = faq(text);
  if (k) return reply(k);

  // 5) Honest fallback — never invent. Offer to capture so a real person follows up.
  return reply("I can tell you about our camera, alarm, access-control, networking, and audio/TV services — or have our team put together a free quote. Want me to set that up? Just tell me what you're looking for.", { lead });
}
