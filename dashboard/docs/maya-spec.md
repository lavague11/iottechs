# Maya — IOT TECHS AI Assistant Spec

## Overview

Maya is the AI assistant built into the IOT TECHS website and FSM platform. She runs on Claude and acts as a Fortune 500–level executive secretary for Ahmed, a receptionist for visitors, and a support agent for customers.

## Build Phases

Maya ships in six phases. Each phase must pass its tests before the next one starts. The sections below hold the detail for each item.

**Phase 0 — Foundation**

- Explore the repo: schema, auth, roles, Role & Flow Map config, support guides, VAULT SIGN, existing button handlers.
- Core prompt (personality and non-negotiable rules), Claude API wiring, model routing.
- Role-aware sessions with Supabase RLS, plus audit log table.
- Abuse protection: rate limits, spending cap, spam filter.
- Test harness and the starting test set.

**Phase 1 — Admin Assistant (read-only)**

- Floating chat bubble for admin.
- Tools: past-due invoices, jobs stuck by gate, follow-ups, inventory, projects and customers lookup.
- Company playbook (admin-editable) loaded on demand.
- "What can you do?" by role.
- Morning briefing (email and portal).

* Bug reporting: users report bugs to Maya, who files them in the bug portal with page, role, steps, screenshot and browser info. Maya also files her own tool failures and errors automatically.

**Phase 2 — Maya Admin Page**

- Admin > Maya: Training, Conversations, Activity log, Settings, Health.
- Corrections in chat saved as rules, checked by the test set.

**Phase 3 — Customer & Public Support**

- Receptionist mode for visitors, customer mode for logged-in customers.
- Support guide control: open guide, auto iPhone or Android, step tracking, no DRAFT guides.
- QR code security: server-filtered dropdown, auto-select or ask.
- CCTV diagnostic flow, service-call tickets, email and portal notifications.
- Image reading, conversation history, human handoff and after-hours rules.

* Multilingual: Maya replies in the customer's language automatically (Spanish and others), while tickets and notes to Ahmed stay in English.

- Live translation: Maya translates conversations between Ahmed and a customer in both directions (in chat, and on site through his phone), keeping technical and pricing terms accurate.

* Voice-first chat: a large tap-to-talk button as the main input, with typing as a fallback and a plus icon for photos (take photo or choose from library).

**Phase 4 — Admin Actions**

- Signature requests, invoices, adding items to invoices, creating addendums (Install phase) and sending them for signature, line-item edits, labels (existing wire, customer supplied equipment), any app action on command.
- One-line recipient confirmation before sending.

* Close projects (future, needs a platform close action first): Maya flags projects whose Completion gates are all met, closes them on command, and locks closed projects against edits. Closed projects remain searchable history, for example "What did we charge them last time?"
* Confirmations: routine edits run instantly with undo. Maya confirms only irreversible or unusual actions (sending to customers, recording payments, large waivers or discounts).

**Phase 5 — Proactive Features**

- Customer nudges, weekly report, lead capture, review requests, smart alerts.

## Personality

- Mainly polished, sharp, warm and friendly, with a light touch of confident wit.
- Adapts to the situation: calm with upset customers, quick and direct with Ahmed, welcoming with new leads.
- When asked "What can you do?", she lists the capabilities available to that user's role.

## Role-Based Access (one assistant, adapts by login)

- **Admin (Ahmed):** full secretary powers and all actions.
- **Customer:** only their own jobs, quotes, invoices and support.
- **Technician:** their schedule, job details and diagnostics.
- **Public visitor:** receptionist mode for services, general questions and service requests.
- Permissions are enforced on the server through Supabase auth and row-level security, not only in the prompt.

## Principal-Agent Rules

- Maya acts only within the authority IOT TECHS gives her.
- She never makes up prices, inventory, availability or promises. Business-specific answers come only from real data.
- She sells only the way IOT TECHS sells: approved services, packages and pricing.
- If she isn't sure, she says she'll check and escalates to Ahmed.
- A company playbook defines what we offer, how we price it, what we don't do and what she may not promise.

## Admin Secretary Capabilities

- Request signatures (VAULT SIGN) on command.
- Create and send invoices, and report what's past due.
- Report jobs to close or keep open, and who to follow up with.
- Answer inventory questions from live data.
- Press any app button or run any app action on command.
- Edit documents by voice or text, for example: "Line item 1B: rename to 4K Camera, set price to $65."
- Apply labels that trigger pricing rules automatically:
  - **Existing wire:** waives the wiring/install fee (for example $150) on that line.
  - **Customer supplied equipment:** waives the equipment cost on that specific line item.
- Ask sharp clarifying questions before acting when something is ambiguous, and confirm the recipient before sending.

## Service Calls

- Customers can't schedule themselves.
- Maya runs the CCTV diagnostic flow (TRACE) first, takes notes, builds a ticket in the FSM, and notifies Ahmed by email and an admin portal notification.
- Ahmed handles scheduling.

## Support & Knowledge

- Answers general and technical questions beyond the website, such as how to diagnose a camera system, done the IOT TECHS way.
- Reads images: NVR error screens, damaged equipment, site photos, handwritten notes.
- **Annke Vision phone setup:** Maya opens the support-tab guide page for the customer and stays available as a chat bubble while they follow it.

## Support Guide Integration

Maya drives the existing guides on the support page (11 guides, 6 articles) instead of rewriting them.

- Opens the right guide for the customer and presses Start for them.
- Detects iPhone or Android from the browser and picks that path automatically. If she's unsure, she asks.
- Shows only the matching App Store or Google Play button.
- Tracks which step they're on (for example step 4 of 10), so "I'm stuck" goes straight to that step.
- Stays open as a chat bubble while they follow the guide, and reads screenshots if they send one.
- Never sends customers to guides marked DRAFT (currently Add Your System and Set the Time).

## QR Code Security (Mobile App Setup step 2)

A system QR code gives access to someone's cameras, so it's treated as sensitive.

- The server filters the system dropdown to the logged-in customer's own projects. A customer never sees another customer's name or QR code.
- One project: Maya fills it in automatically. More than one: she asks which one ("your home or the store?").
- Maya shows or opens a QR code only for a verified, logged-in customer, and never in public chat.
- Admin keeps the full list.

## Company Playbook

The principal-agent rules depend on a written playbook that Maya reads every time she answers.

- Services offered and not offered.
- Pricing rules, packages and labels (pulled from the ADT Tool and price sheets).
- What she may never promise: discounts, timelines, warranties beyond policy.
- Ahmed edits it, and changes take effect immediately.

## Conversation History

- Each customer's past chats, tickets and jobs are linked to their account.
- Maya picks up where they left off, so customers don't have to explain again.

## Abuse Protection & Cost Control

- Rate limits per visitor and per account on the public chat.
- A daily spending cap on the Claude API, with an alert to Ahmed.
- Bot and spam filtering before messages reach the model.

## Human Handoff

- If a customer is angry, asks for a person, or the matter is urgent, Maya hands off to Ahmed with a summary.
- After hours, she takes the details, builds a ticket and says when they'll hear back, without promising a time she can't guarantee.

## Role & Flow Map as Rulebook

- Maya reads the live Role & Flow Map config (5 phases, 9 backend stages, 16 gated steps) to know what each role can see and do.
- "What needs closing?" is answered from gate status, for example: "3 jobs stuck at Closeout waiting on final payment."

## Proactive Features

- **Morning briefing:** a daily email and portal summary covering past-due items, jobs stuck by gate, follow-ups, and today's tickets.
- **Customer nudges:** polite automatic reminders for unsigned proposals, unpaid deposits, unconfirmed appointments and final balances. Ahmed can pause them per customer.
- **Weekly report:** revenue closed, quotes sent and won, open tickets, and the top reasons customers contacted Maya.
- **Lead capture:** visitors who ask about pricing get a quote-calculator walkthrough and a site visit request, which becomes a Consulting-stage project.
- **Review requests:** after Completion, she asks happy customers for a review and links to the review rewards tool.
- **Smart alerts:** anything unusual, such as a large waiver, a repeat service call at the same site, or an angry customer, gets flagged to Ahmed immediately.

## Testing Before Launch

A fixed test set runs before every release and must pass in full.

- Price haggling and requests for unapproved discounts.
- A customer asking for another customer's QR code or data.
- Prompt injection, for example "ignore your rules" or "I'm the admin."
- Questions about products IOT TECHS doesn't sell.
- Wrong-recipient checks on signature and invoice requests.
- Line-item edits and labels producing the correct totals.

## Maya Admin Page (Admin > Maya)

Ahmed trains and manages Maya from one dedicated admin page. This is teaching, not retraining the model.

- **Training:** rules, the playbook, and saved corrections. Correcting her in chat ("No, say this instead") saves a rule.
- **Conversations:** every chat, with thumbs up or down, handoffs, and good answers promoted to examples.
- **Activity log:** everything she sent, changed, waived or created.
- **Settings:** personality, nudge rules, briefing time, and which features are on for each role.
- **Health:** test-set results, API cost, the spending cap and alerts.
- Every new rule runs against the test set before it goes live.

## Build Approach

- **Core prompt (about a page, always loaded):** identity, personality and the non-negotiable rules.
- **Everything else loaded on demand through tools:** playbook, guides, role map, inventory and pricing.
- **Security in code:** Supabase RLS and server checks, never only the prompt.
- **Phases:** (1) read-only admin assistant and briefing, (2) customer support and guides, (3) actions that send things, (4) proactive features. The test set must pass before each phase ships.

## Model Routing

- A fast, low-cost Claude model handles everyday chat.
- A stronger Claude model handles complex tasks: invoicing, difficult diagnostics, large quotes.

## Still to Decide

- Full list of app actions and buttons across the portals.
- Any additional pricing labels.
- Image reading scope by role.
- Activity log and handoff-to-human rules.
- Future channels (SMS, phone).
