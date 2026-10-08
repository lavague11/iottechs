// IOT TECHS Master Terms & Conditions — the ONE source of the contract language, shared by the proposal
// acceptance flow (the "Read the full Terms & Conditions" link in the signature modal, which shows every
// section) and the proposal PDF (which REFERENCES this version + captures the customer's initials, rather
// than reprinting all 83 sections). Edit here to change the policy. Verbatim from the owner's master doc
// (Oct 2026) — proofread against the source before relying on it legally.
export const PROPOSAL_TERMS_TITLE = "IOT TECHS Master Terms & Conditions";
export const PROPOSAL_TERMS_VERSION = "October 2026";
export const PROPOSAL_TERMS_INTRO =
  "One agreement for residential and commercial customers. Sections marked for one customer type apply only to that type: Section 8 (commercial only), Section 53 (residential in-home sales only), and the personal guaranty in Section 74 (business accounts only). These Terms apply to proposals, installations, service calls, maintenance, upgrades, repairs, equipment sales, and related low-voltage and security services by IOT TECHS (La Vague Inc.). The proposal, invoice, signed addenda, change orders, Performance Credit Program agreement, and these Terms together form the “Agreement.”";

// Each clause: { n: section number, h: heading, b: body (paragraphs/lists/tables as plain text with \n). }
export const PROPOSAL_TERMS = [
  { n: 1, h: "Customer Service & Mutual Courtesy", b:
`IOT TECHS is committed to professional, respectful, responsive, good-faith service. We make reasonable efforts to accommodate scheduling needs, project concerns, service requests, and reasonable customer requests whenever practical.

Courtesy is a two-way street. Customers are expected to communicate respectfully, respond within a reasonable time, provide required site access and information, honor scheduled appointments and payment obligations, and cooperate reasonably with technicians and project requirements.

IOT TECHS may voluntarily provide scheduling flexibility, credits, fee waivers, expedited assistance, or other accommodations. A courtesy does not modify the Agreement, create a continuing entitlement, set a precedent, or waive any right unless IOT TECHS confirms it in writing.

Repeated missed appointments, nonpayment, nonresponse, denied access, unsafe conditions, abusive or threatening behavior, unreasonable demands, or failure to cooperate may result in reduced scheduling flexibility, withdrawal of discretionary accommodations, suspension of non-emergency service where permitted, or other remedies under the Agreement.` },
  { n: 2, h: "Proposal, Scope & Price Validity", b:
`The scope of work is limited to the equipment, quantities, locations, labor, services, and assumptions in the signed proposal and approved written addenda.

Quoted pricing is valid for seven (7) days from issuance. If an extraordinary, documented supplier price change occurs in that period that IOT TECHS cannot reasonably absorb, IOT TECHS will communicate it promptly before affected equipment is purchased or additional work proceeds.

All prices are subject to applicable sales tax. Cash, advance-payment, package, promotional, and other discounts apply only when stated in writing.` },
  { n: 3, h: "Deposits", b:
`Unless the proposal states otherwise, the initial deposit is 50% of the project price. The deposit reserves technician capacity, scheduling, project planning, purchasing capacity, equipment allocation, materials, and other project resources.

Deposits are non-refundable except where required by law.

If the Customer cancels, postpones indefinitely, refuses to proceed, or abandons the project, IOT TECHS may first apply the deposit against amounts already earned, spent, committed, or incurred, including labor, dispatch, mobilization, site visits, travel, planning, administration, programming, equipment allocation, ordered materials, shipping, vendor charges, permits, and restocking costs.

If net deposit value remains after those deductions, IOT TECHS may, at its discretion and where legally permitted, provide equipment or materials up to that amount at retail value instead of a cash refund. If project charges exceed the deposit, the Customer remains responsible for the lawful remaining balance.` },
  { n: 4, h: "Final Payment & Substantial Completion", b:
`Unless otherwise stated in writing, the remaining balance is due upon substantial completion.

A project is substantially complete when the contracted system is materially installed and functional for its intended purpose, even if minor punch-list items, cosmetic adjustments, labeling, or final tuning remain. Minor corrective work does not postpone the payment obligation.` },
  { n: 5, h: "Payment Plans", b:
`Payment arrangements must be approved by IOT TECHS in writing (text or email is sufficient) and must state the amount and date of each payment. A payment plan changes only the timing of payment; it does not waive or reduce any amount owed unless expressly stated.

If the Customer cannot make a scheduled installment, the Customer must contact IOT TECHS on or before the due date, explain the reason, and obtain approval for a revised date. A payment plan does not remain open after a missed installment if the Customer goes silent.` },
  { n: 6, h: "Past-Due Accounts & Default", b:
`The account is in default when either of the following occurs:
1. Silent late payment. A required payment is more than seven (7) calendar days past its due date, and the Customer has neither an approved payment arrangement nor communicated with IOT TECHS about the delay.
2. Broken arrangement. The Customer misses a payment under an approved arrangement and does not promptly communicate the reason and obtain approval for a revised date.

Default timeline:
• Due date + 1 — Reminder by text and email
• Due date + 5 — Second notice: default in 2 days without payment or contact
• Due date + 7 — Account in default; written default notice with balance and recovery charges
• Default + 10 — Final notice: pay in full or schedule equipment recovery

Paying the past-due amount in full before equipment recovery cures the default.

IOT TECHS may make reasonable attempts to contact the Customer about a past-due balance. Failure to send a reminder, call, or give additional courtesy notice does not waive the Customer's payment obligation or IOT TECHS' rights.

Action on past-due accounts. Once an account is in default, IOT TECHS may, to the extent permitted by law:
• suspend or postpone ongoing installation work;
• decline additional or non-emergency service calls;
• suspend managed, administrative, remote-support, or other services under IOT TECHS' control;
• withhold final system handoff, credentials, documentation, or deliverables not yet due for release;
• cancel or reschedule pending appointments;
• declare amounts immediately due where the Agreement permits;
• assess properly disclosed late, financing, service, collection, or other charges;
• refer the account to a collection agency or collection attorney;
• commence a lawsuit or other lawful collection proceeding;
• pursue a lien, security interest, or repossession remedy under Sections 29 and 30 where legally permitted; and
• recover court costs, collection expenses, attorneys' fees, filing fees, and other enforcement expenses to the extent permitted by law and the Agreement.

IOT TECHS is not required to continue providing additional labor, support, or discretionary services while an account is materially delinquent, except where required by law or a separate written service obligation.

Payment arrangements and partial payments. Any extension, payment arrangement, revised due date, settlement, or waiver must be approved by IOT TECHS. Accepting a late payment, partial payment, or one installment does not waive the remaining balance, cure future defaults, or limit IOT TECHS' rights unless IOT TECHS agrees otherwise in writing.

Collection and legal enforcement. If informal collection efforts are unsuccessful, IOT TECHS may escalate without continuing indefinite attempts to obtain voluntary payment. Escalation may include outside collections, attorney involvement, legal filings, enforcement of contractual or secured rights, and other lawful remedies. The Customer remains responsible for the unpaid balance and any charges or recovery costs lawfully recoverable under the Agreement. IOT TECHS is not required to pursue every remedy, pursue remedies in any order, or delay one remedy while attempting another.

Accurate account information. Where legally permitted, IOT TECHS may provide accurate information about a delinquent account to attorneys, collection agencies, courts, lien or filing authorities, financing providers, or others reasonably involved in lawful collection. IOT TECHS will not knowingly provide false or misleading account information.` },
  { n: 7, h: "Late Fees, Returned Payments & Chargebacks", b:
`Late fee. A payment not received within seven (7) calendar days after its due date is subject to a $35 late fee per late payment, to the extent permitted by law. The late fee does not extend the due date or waive default under Section 6.

Returned payments. A returned, reversed, rejected, dishonored, or failed payment is subject to a $35 returned-payment fee, in addition to any other lawful charges associated with default. IOT TECHS may require certified funds or card payment for future payments after a returned payment.

Chargebacks. The Customer agrees to contact IOT TECHS first about any billing concern before disputing a charge with its card issuer or bank. A chargeback or payment dispute on work, equipment, or services that were authorized and performed is treated as nonpayment under Section 6 from the date the funds are reversed. The Customer is responsible for any processor chargeback fees plus a $35 administrative fee, and IOT TECHS may submit the signed project documents, photos, and service records to contest the dispute.` },
  { n: 8, h: "Supplier Financing / Carrying Costs (commercial only)", b:
`Certain equipment may be obtained by IOT TECHS under supplier credit terms, currently approximately Net 14. If an applicable financed balance remains unpaid beyond that period, IOT TECHS may pass through financing or carrying costs actually incurred, subject to applicable law and prior disclosure.

The currently contemplated supplier rate is 28.99% APR, calculated daily, or the actual supplier rate applicable to the transaction, applied only to the unpaid financed balance. These charges reimburse financing costs incurred and are not an additional profit margin.

This section applies to commercial customers only. For residential customers, the late fee in Section 7 is the only charge for late payment.` },
  { n: 9, h: "Credit Card Payments", b:
`Credit card payments may include a surcharge of up to 3%, not to exceed IOT TECHS' actual card processing cost, only where permitted by applicable law and card-network rules and disclosed before payment. Other payment methods are available without the surcharge.` },
  { n: 10, h: "Scheduling & Rescheduling", b:
`Customers must give at least 48 hours' notice to reschedule a confirmed installation or service appointment.

Late rescheduling, same-day cancellation, denied access, customer unavailability, or cancellation after technicians are dispatched may result in mobilization, transportation, technician-time, standby, or failed-dispatch charges. If technicians arrive and cannot reasonably perform the work because of conditions attributable to the Customer, the visit may be treated as a failed dispatch.` },
  { n: 11, h: "Project Delays, Standby & Per Diem", b:
`Customer-caused delays include inaccessible work areas, unfinished construction, unavailable decision-makers, blocked pathways, no electricity or internet, unavailable network credentials, interference by other contractors, failure to provide access, unsafe conditions, and requested pauses.

Rates:
• Full-day technician delay / per diem — $600 per technician per day
• Half-day technician delay / per diem — $300 per technician
• Transportation / mobilization — $150
• Short-duration standby (up to 2 hours) — $150 minimum

Customer-caused delays automatically extend estimated completion dates.` },
  { n: 12, h: "Changes, Addendums & Change Orders", b:
`Any requested change to equipment quantity, camera location, wire route, mounting method, concealment, programming, system design, access requirements, or other scope may affect price and schedule. IOT TECHS may require a written change order or addendum before performing changed or additional work.

Verbal instructions do not modify the Agreement unless documented or accepted by IOT TECHS. Signed addendums become part of the Agreement.` },
  { n: 13, h: "Hidden & Unforeseen Site Conditions", b:
`Pricing assumes site conditions reasonably visible or disclosed before work. Additional charges may apply for concealed obstructions, inaccessible ceilings, concrete or masonry, blocked pathways, undocumented construction, unsafe materials, water damage, defective electrical conditions, damaged existing cable, required lifts or scaffolding, unusual drilling, structural obstacles, permitting issues, or other conditions not reasonably apparent when the project was priced.` },
  { n: 14, h: "Performance Credit Program (PCP)", b:
`The Performance Credit Program (PCP) is an optional, discretionary pricing credit that rewards customers whose projects can be completed efficiently. Credits range from 2% to 10% of the applicable subtotal, are set at IOT TECHS' sole discretion, and are not guaranteed. The PCP is documented in a separate signed PCP Pricing Agreement, which becomes part of the Agreement.

Credit factors. Credits are based on the factors checked in the PCP Pricing Agreement, grouped as follows. Technician visits are weighted most heavily.
• Technician Visits (major factor) — Project completed in the fewest planned visits, with no return trips caused by the Customer
• Prompt Payment — Deposit and balance paid on time, per Sections 3 and 4
• Access & Labor Efficiency — Surface or exposed mounting, no lift or scaffolding, reusable cabling, efficient wire runs, easy wall and ceiling access
• Job Metrics — Scope, quantities, and schedule completed as planned with no mid-project changes
• Site Conditions — Clear, safe, ready work areas with power, internet, and network credentials available
• Travel & Dispatch — Local or low-toll location, parking and loading access
• Commercial Value — Referral or honest review of any rating (Section 66), signage and portfolio consent under Section 66, volume or bundled work, repeat customer, maintenance agreement, old equipment recycling

Program rules:
• Signed before work begins. The PCP Pricing Agreement and its factors must be completed and signed before any work starts. PCP credits are never applied retroactively and will not be honored if requested after work has started.
• Shown as a line item. The credit applies to the labor subtotal unless the proposal states otherwise, and appears as a separate deduction on the proposal and final invoice. It is never built into base pricing.
• Adjustment or removal. If actual technician visits, payment timing, access, site conditions, or other factors differ from what was committed at signing, IOT TECHS may adjust or remove the credit. The Customer will be notified before final invoicing, and the revised total applies.
• Default voids the credit. If the account goes into default under Section 6, or a payment is reversed under Section 7, any PCP credit may be removed and the full undiscounted price becomes due.
• No continuing entitlement. A PCP credit applies only to the project it was signed for and does not set pricing for future work, change orders, or service calls.

Where a discounted project includes modified warranty terms, a service-call deductible, reduced labor coverage, or another warranty limitation, that condition must be disclosed and accepted in writing in the PCP Pricing Agreement before work begins.` },
  { n: 15, h: "Existing Cable & Infrastructure", b:
`IOT TECHS provides no warranty on pre-existing cable or infrastructure it did not install, including wiring, connectors, terminations, conduit, pathways, switches, network equipment, electrical components, and other customer- or third-party-provided infrastructure.

IOT TECHS may test existing cable before reuse. A passing test means only that the cable tested acceptably at that time. If reused cable passes, the Customer may receive a full credit for the applicable new cable-drop charge, shown on the invoice. The credit does not create a warranty on that cable.

Service calls for intermittent connection, power loss, packet loss, image problems, outages, or failure attributable to existing cabling or infrastructure are billable. If IOT TECHS determines the issue is solely a covered defect in new IOT TECHS-supplied equipment, that equipment may still qualify under its limited warranty.` },
  { n: 16, h: "Limited Workmanship Warranty", b:
`Unless the proposal states otherwise, IOT TECHS provides a six (6) month limited workmanship and installation warranty covering qualifying defects directly attributable to IOT TECHS workmanship. It is not an unlimited maintenance or free-service program.` },
  { n: 17, h: "Limited Equipment Warranty", b:
`Unless otherwise stated, IOT TECHS-supplied equipment carries a one (1) year limited equipment warranty, subject to manufacturer terms and the exclusions in this Agreement.

IOT TECHS may choose the remedy, including repair, re-performance, replacement, or substitution with reasonably comparable equipment. Repair or replacement does not restart the warranty; it continues for the remaining original term or applicable manufacturer coverage unless extended in writing. Extended warranties may be offered separately.` },
  { n: 18, h: "Warranty Exclusions", b:
`Coverage may be denied for failures or damage caused by unauthorized third-party work, tampering, relocation, disconnection, rewiring, resetting, reprogramming, repairs or modifications by others, construction or renovation, surges, lightning, flooding, water intrusion, fire, vandalism, theft, pests, physical damage, internet or network problems, power failures, customer-supplied equipment, existing infrastructure, third-party software, cloud outages, manufacturer app changes, improper use, or conditions outside IOT TECHS' reasonable control.

IOT TECHS may inspect the affected system to determine whether the condition is covered.` },
  { n: 19, h: "Third-Party Work", b:
`If another contractor, electrician, IT provider, employee, owner, tenant, customer, installer, or other third party alters or interferes with an IOT TECHS installation, warranty coverage for the affected equipment or work may be voided. Coverage for unrelated portions of the system is not automatically voided.` },
  { n: 20, h: "Warranty Documentation & Evidence", b:
`Warranty issues should be reported as soon as reasonably possible. Where available, the Customer should preserve recordings, screenshots, timestamps, logs, photos, or error messages showing when the issue began. Footage used as evidence must be reported while still within the system's retention period.

If IOT TECHS cannot verify a claimed warranty condition because evidence was not preserved or was overwritten, the visit may begin as a billable diagnostic service call starting at $199. If the issue is confirmed as fully covered, the covered portion will be adjusted.` },
  { n: 21, h: "Service Calls", b:
`Standard service calls start at $199 unless another rate is quoted. A warranty does not make every service visit free.

Service for excluded causes, customer-caused problems, existing cable, network issues, password problems, third-party modifications, routine maintenance, cleaning, realignment, or other non-covered conditions is billable.

IOT TECHS is not required to provide non-emergency warranty or service dispatch while the Customer has a past-due balance, subject to applicable law.` },
  { n: 22, h: "Service Ticket Policy", b:
`A service ticket awaiting customer response stays open for three (3) calendar days. If the Customer does not respond, IOT TECHS may close the ticket, and further service requires a new ticket.

Warranty eligibility is determined by the applicable warranty and a valid service request. A new ticket opened after the warranty period expires does not revive expired coverage.` },
  { n: 23, h: "Maintenance", b:
`Routine maintenance is separate from the limited warranty unless included in a written maintenance agreement. Maintenance may include cleaning, alignment, health checks, firmware review, storage review, user-management assistance, and preventive inspections.` },
  { n: 24, h: "Passwords, Credentials & Account Recovery", b:
`Until the project balance is paid in full, IOT TECHS may retain installer, administrator, configuration, and system-level credentials and provide customer access appropriate to project status. Final administrative handoff occurs after payment obligations are satisfied.

After handoff, the Customer is responsible for safeguarding passwords, maintaining recovery emails and phone numbers, controlling authorized users, removing former employees, and using multi-factor authentication where available.

Password recovery is billable service unless included in a maintenance plan.
• Initial password diagnostic and reset — $199
• Per-camera reset or reconfiguration — $30 per camera
• Typical recovery range — $199–$499

Work beyond normal recovery scope is quoted separately.` },
  { n: 25, h: "Privacy, Confidentiality & Authorized Contacts", b:
`IOT TECHS treats system details, recordings, credentials, configuration, access methods, account information, and service history as confidential.

Account-specific or system-sensitive information is shared only with the contract signer, account holder, or another person expressly authorized and documented on the account. Employees, managers, partners, tenants, contractors, relatives, vendors, and people at the property are not automatically authorized.

IOT TECHS may require identity verification before changing permissions, resetting credentials, releasing passwords, discussing sensitive details, or transferring control. Disclosure may also occur where legally required or for a legitimate legal process or emergency.` },
  { n: 26, h: "Account / Ownership Transfer", b:
`Transferring the responsible account holder, the account or system, or service records to another person or entity may carry a $199 administrative transfer fee. The existing authorized signer must approve, and IOT TECHS may verify the new party's identity. A transfer does not extend or restart any warranty, maintenance agreement, or service term.` },
  { n: 27, h: "Administrative Control & Final System Handoff", b:
`Until the balance is paid in full, IOT TECHS may withhold final administrator credentials and system turnover. Limited viewing or mobile access may be provided before handoff at IOT TECHS' discretion. Continuing IOT TECHS remote or administrative access after handoff will be documented through the applicable maintenance, monitoring, or managed-service arrangement.` },
  { n: 28, h: "Suspension of Access or Functionality", b:
`Where authorized by the signed Agreement and permitted by law, an account in default may have services, remote support, managed access, mobile access, or other functionality under IOT TECHS' control suspended until cured.

IOT TECHS will never remotely disable local recording, alarm, life-safety, or physical access-control functions as a payment remedy. Suspension applies only to services IOT TECHS itself provides, such as remote support, managed access, and dispatch.` },
  { n: 29, h: "Ownership, Security Interest & Unpaid Equipment", b:
`IOT TECHS retains title to, and a security interest in, all equipment it supplies until the Customer pays for it in full, to the extent permitted by law. Possession of installed equipment before final payment does not waive IOT TECHS' right to collect the unpaid balance.

For commercial customers, IOT TECHS may file a UCC-1 financing statement to record its security interest.` },
  { n: 30, h: "Repossession, Recovery & Restocking", b:
`After default and the final notice in Section 6, IOT TECHS may recover unpaid equipment where lawful and supported by Section 29. Recovery is scheduled with the Customer and performed only with permission to enter and without breach of the peace. If access is refused, IOT TECHS will pursue the balance through collection or legal process.

On recovery, the following apply:
1. Recovery fee: $300 for transportation and a half-day field visit (removal, packing, return).
2. Restocking and reconditioning deduction: 50% of the invoiced value of the recovered equipment, covering de-installation, handling, testing, resetting, reconditioning, packaging, administration, wear, missing accessories, and reduced resale value.
3. Credit: the remaining 50% of equipment value is applied to the outstanding balance.
4. Remaining balance: balance + $300 − credit remains due. Repossession does not erase the debt. Any surplus is refunded as required by law.

Example: Balance at default $3,200 + Recovery fee $300; Equipment recovered (invoiced value) $2,000 − 50% restocking deduction $1,000, Credit applied $1,000 → Remaining balance owed $2,500.

Recovery from a residence takes place only with the Customer's consent at the time of recovery.` },
  { n: 31, h: "Recording Retention", b:
`Any quoted retention period is an estimate unless the proposal expressly guarantees it. Actual storage varies with camera count, resolution, frame rate, bitrate, compression, motion activity, recording mode, storage capacity, and drive condition. Customers are responsible for exporting important footage before it is overwritten.` },
  { n: 32, h: "Camera & System Performance", b:
`Security systems reduce risk but cannot guarantee prevention, detection, identification, or recording of every event. Performance may be affected by lighting, weather, distance, angle, obstructions, movement, network and recording settings, storage, environment, and third-party equipment.

Unless guaranteed in writing, IOT TECHS does not warrant that every face, license plate, incident, person, or vehicle will be identifiable or recorded.` },
  { n: 33, h: "Data Loss & Third-Party Services", b:
`IOT TECHS is not responsible for data or footage loss caused by storage failure, internet failure, power interruption, manufacturer cloud outages, third-party software or app changes, firmware issues outside its control, customer deletion, unauthorized access, equipment damage, or other excluded causes. Customers should export critical recordings promptly.` },
  { n: 34, h: "Privacy, Audio & Legal Use of Surveillance", b:
`The Customer is responsible for ensuring its use of video surveillance, audio recording, employee monitoring, facial recognition, license-plate capture, access control, or other features complies with applicable law. Unless specifically contracted, IOT TECHS does not determine the Customer's legal right to record a location or conversation.` },
  { n: 35, h: "Physical Installation & Cosmetic Work", b:
`Installation may require drilling, anchoring, mounting, penetrations, exposed cable, conduit, wall and ceiling access, and fasteners. Painting, drywall, masonry, waterproofing, landscaping, structural repair, finish carpentry, and cosmetic restoration are excluded unless included in writing.` },
  { n: 36, h: "Customer-Supplied Equipment", b:
`Equipment, wiring, networking hardware, displays, switches, routers, storage, or other components not supplied by IOT TECHS are not covered by its equipment warranty unless accepted in writing. Time diagnosing customer-owned or third-party equipment may be billable.` },
  { n: 37, h: "No Insurance Guarantee", b:
`IOT TECHS is not an insurer. Its systems do not guarantee that theft, burglary, vandalism, misconduct, fire, property loss, injury, or other events will not occur. The Customer is responsible for maintaining appropriate insurance.` },
  { n: 38, h: "Delays Outside IOT TECHS' Control", b:
`IOT TECHS is not responsible for delays caused by weather, shipping interruptions, manufacturer shortages, utility outages, building closures, government action, strikes, illness, emergencies, customer delays, unsafe conditions, permitting, third parties, or other conditions reasonably outside its control. Completion dates will be reasonably extended.` },
  { n: 39, h: "Technician Non-Solicitation, Direct Hiring & Unauthorized Side Work", b:
`IOT TECHS technicians are assigned solely to perform work authorized and managed through IOT TECHS.

The Customer may not directly or indirectly hire, retain, solicit, recruit, contract with, compensate, or arrange private or outside work with an IOT TECHS technician, during the project or for any additional, future, related, or follow-up work. The Customer may not exchange personal contact information with a technician to set up a direct working relationship, arrange side work, or avoid IOT TECHS pricing, scheduling, management, or contract procedures.

All additional work, scope changes, upgrades, modifications, and scheduling requests go through the assigned Project Coordinator, Project Manager, or another authorized IOT TECHS representative, and must be approved in writing before the work starts. If approval is not given promptly, IOT TECHS may pause, reschedule, or apply return-visit or per diem charges under Section 11. Technicians may discuss immediate installation logistics only; contracts, pricing, and scope stay with management.

Material breach and stop-work. Any attempt by the Customer to establish an unauthorized direct working relationship with an IOT TECHS technician is a material breach of the Agreement. Upon discovery, IOT TECHS may immediately: issue a stop-work order; remove the technician or crew from the property; suspend further installation or service; cancel remaining scheduled work; terminate the Agreement where permitted; invoice amounts then due for authorized work, equipment, mobilization, and other applicable charges; and exercise any other remedy available under the Agreement or applicable law. IOT TECHS is not required to allow unauthorized side work to continue because the technician and Customer agreed to it independently.

Technician policy. IOT TECHS technicians are prohibited from accepting side work, private compensation, direct employment, or separate arrangements from an IOT TECHS Customer. A technician who participates may be removed immediately and disciplined, up to termination of employment or contractor status. Technician discipline is an internal IOT TECHS matter and creates no right or claim for the Customer.

Termination of IOT TECHS involvement. If the Customer and a technician continue working together outside IOT TECHS, IOT TECHS may terminate its involvement in the affected project. After termination, IOT TECHS will not supervise, manage, approve, inspect, warrant, or assume responsibility for work performed independently by that technician or any other third party. Warranties, service, and support for any portion of the system later altered, serviced, reprogrammed, rewired, relocated, or repaired by unauthorized or former-technician work may be limited or voided to the extent that work affects the system or IOT TECHS' ability to determine responsibility for a later issue. IOT TECHS remains responsible only for obligations that cannot lawfully be disclaimed and for covered work it performed before termination, subject to the rest of the Agreement.

No circumvention. This section protects IOT TECHS' workforce, customer relationships, confidential business practices, project management, pricing, scheduling, and responsibility for work performed under its name. A Customer who bypasses IOT TECHS to work independently with a technician assumes responsibility for that relationship and for work performed outside IOT TECHS' authorization.` },
  { n: 40, h: "Landlord, Property Owner & Installation Authorization", b:
`The Customer is solely responsible for obtaining any permission required from the property owner, landlord, property manager, building management, condominium or homeowners association, or other authority over the property before installation begins.

By authorizing the work, the Customer represents that they have legal authority to approve the installation or that all required permissions have been obtained. IOT TECHS is not responsible for verifying ownership, lease restrictions, building rules, or landlord approval unless it agrees in writing to do so.

If an authorized party stops, restricts, rejects, or requires modification of the work because the Customer did not obtain approval, the resulting delay or cancellation is a Customer-caused condition. Return visits, standby, transportation, mobilization, per diem, removal, relocation, restoration, and additional labor may be charged under the Agreement.

Cancellations related to missing authorization. Failure to obtain approval does not cancel the Customer's financial obligations. If the project is cancelled, delayed, relocated, or substantially changed for that reason, IOT TECHS may apply the Agreement's cancellation, deposit, restocking, mobilization, equipment, labor, and other charges, and may apply any deposit under Section 3. The Customer must confirm authorization before approving the proposal, scheduling the installation, or allowing IOT TECHS to mobilize technicians or equipment to the property.` },
  { n: 41, h: "Signed Project Documents", b:
`The Customer may be required to electronically review and sign several project documents before installation begins, including the Safe Survey, system mockup or layout, proposal, disclaimers, addendums, change orders, and other project acknowledgments. Each signed document becomes part of the Agreement and serves a different purpose.
• The proposal establishes the approved scope, equipment, quantities, pricing, payment terms, and other commercial terms.
• The Safe Survey documents site conditions, survey observations, installation assumptions, access conditions, existing infrastructure, proposed device locations, and other field information.
• The mockup, layout, or visual plan documents the Customer's approved general placement and design of cameras, devices, equipment, and other components.

The Customer is responsible for reviewing these documents before signing and promptly identifying any incorrect information. Once approved, IOT TECHS may reasonably rely on them when purchasing equipment, scheduling technicians, preparing materials, and performing the installation.` },
  { n: 42, h: "Document Priority and Conflicts", b:
`If two project documents conflict, the more specific or more recently signed document addressing that subject generally controls. Unless a later signed document states otherwise:
• a signed addendum or change order controls the specific change it addresses;
• the signed proposal controls pricing and commercial scope;
• the signed Safe Survey controls documented site conditions and survey assumptions;
• the signed mockup or layout controls approved general device placement and system design; and
• these Master Terms govern general contractual matters not specifically modified by another signed project document.

A verbal request, informal conversation, technician discussion, text message, or unsigned drawing does not override a signed document unless IOT TECHS formally approves and documents the change.` },
  { n: 43, h: "Customer Approval of Survey, Mockup and Layout", b:
`By signing the Safe Survey, mockup, layout, or similar document, the Customer confirms they have had the opportunity to review the proposed installation information on it. Approval authorizes IOT TECHS to proceed substantially in accordance with that plan, subject to reasonable field adjustments required by actual site conditions.

Exact wire paths, conduit routes, mounting heights, angles, penetrations, and device positioning may require reasonable modification during installation because of structural conditions, hidden obstacles, safety concerns, code requirements, equipment limitations, or other practical factors. A material change affecting price, quantity, intended coverage, or major system design goes through the change-order process in Section 12.` },
  { n: 44, h: "Service Response and Scheduling Expectations", b:
`Unless the Customer has a written service-level agreement, IOT TECHS does not guarantee a specific response, arrival, repair, or restoration time for ordinary service requests.

IOT TECHS schedules service using reasonable efforts based on technician availability, urgency, location, parts availability, account status, project obligations, and the nature of the reported condition. An estimated service date or time is not a guaranteed deadline unless designated as one in writing. A system outage does not by itself create an emergency-service obligation.` },
  { n: 45, h: "Emergency and Priority Service", b:
`IOT TECHS may offer expedited, after-hours, weekend, holiday, emergency, or priority service when available, which may carry additional dispatch, labor, transportation, overtime, emergency-response, or minimum charges. Such service depends on technician availability and is not guaranteed unless provided through a separate written service-level or maintenance agreement.

IOT TECHS is not an emergency-response agency. When an immediate threat to persons or property exists, the Customer should contact police, fire, emergency medical services, their alarm monitoring provider, property security, or other emergency services.` },
  { n: 46, h: "Remote Access and Remote Technical Support", b:
`Where technically available and authorized, IOT TECHS may use remote access for diagnostics, configuration, support, programming, troubleshooting, updates, or administration. The Customer authorizes reasonable remote access needed to provide requested or contracted support.

Remote access does not guarantee every problem can be fixed without a site visit. If an on-site visit is required, service-call charges may apply. IOT TECHS may end remote administrative access after final handoff unless continued access is part of an active maintenance, monitoring, management, or service agreement.

The Customer may not give IOT TECHS remote-access credentials to unauthorized third parties or represent that a third party acts for IOT TECHS without authorization.` },
  { n: 47, h: "Customer Footage, Recordings and Data", b:
`Video, audio, access-control records, license-plate data, user activity, and other system data generally remain under the Customer's control, subject to the equipment's capabilities and applicable third-party terms.

IOT TECHS does not routinely monitor, review, preserve, archive, or back up Customer footage unless that service is included in writing. The Customer is responsible for exporting footage or information it wants to keep before it is overwritten, deleted, corrupted, or lost.

If IOT TECHS accesses recordings during service, access is limited to what is reasonably necessary to perform the work, investigate an issue, verify performance, or another legitimate service purpose.` },
  { n: 48, h: "Requests to Retrieve or Export Footage", b:
`Footage retrieval, search, export, conversion, duplication, or help locating an event may be a separate billable service unless included in the Customer's maintenance or service plan.

IOT TECHS does not guarantee that requested footage exists, remains in storage, contains the event, or is good enough for identification or evidence. The Customer should provide the most accurate date, time, camera, and event details available.

Time spent searching large amounts of footage or responding to attorneys, insurers, law enforcement, property managers, or other third parties may be billable.` },
  { n: 49, h: "Disclosure of Customer System Information", b:
`IOT TECHS will not voluntarily release recordings, passwords, system layouts, access records, account information, or other security-sensitive information to someone merely because they work at, manage, occupy, or claim an interest in the property.

Information is released only to the authorized account holder or a documented authorized contact, except where required by law or valid legal process. IOT TECHS may require identity verification and written authorization first. Subpoenas, court orders, warrants, litigation holds, and other legal demands may be referred to IOT TECHS management or legal counsel before anything is released.` },
  { n: 50, h: "Third-Party Applications, Cloud Platforms and Manufacturer Services", b:
`Some features depend on apps, manufacturer servers, cloud platforms, cellular networks, email providers, push-notification services, operating systems, or other services IOT TECHS does not control. Those providers may modify, discontinue, restrict, charge for, or experience outages in their services.

IOT TECHS does not guarantee continuous availability or permanent functionality of any third-party app or cloud feature. Changes required by manufacturer updates, discontinued apps, subscription changes, operating-system updates, or other external platform changes may require billable service, replacement equipment, or reconfiguration.` },
  { n: 51, h: "No Guarantee of Notifications", b:
`Push notifications, email alerts, alarm messages, analytic and motion alerts, smart-detection events, and similar automated notifications depend on multiple technologies and may be delayed, missed, filtered, disabled, or unavailable.

The Customer should not rely on any single electronic notification method as the sole protection for persons or property. IOT TECHS does not guarantee that every event will generate an alert or that every alert will reach a particular device or recipient.` },
  { n: 52, h: "Customer Responsibility for Contact Information", b:
`The Customer must keep telephone numbers, email addresses, authorized contacts, recovery information, and other account information accurate. IOT TECHS is not responsible for missed communications, failed password recovery, unavailable alerts, or delayed service caused by outdated or incorrect contact information.

Changes to authorized contacts or account ownership follow the authorization and transfer procedures in Sections 25 and 26.` },
  { n: 53, h: "Right to Cancel (Residential In-Home Sales)", b:
`If this Agreement was signed at the Customer's home or another location that is not IOT TECHS' place of business, and the law gives the Customer a right to cancel, the Customer may cancel without penalty before midnight of the third business day after signing. At signing, the Customer will receive two copies of the Notice of Cancellation in Appendix A, and the IOT TECHS representative will explain the right to cancel verbally.

If the Customer cancels within that period, IOT TECHS will refund all payments within ten (10) business days after receiving the cancellation notice. Installation will not begin until the cancellation period has ended, unless the Customer has a bona fide personal emergency and gives IOT TECHS a separate, dated, handwritten statement describing the emergency and waiving the right to cancel. Pre-printed waiver forms are never used. After the period ends, the deposit and cancellation terms in Sections 3 and 54 apply.` },
  { n: 54, h: "Customer Cancellation After Work Begins", b:
`If the Customer cancels after the right-to-cancel period ends or after work has started, the Customer is responsible for:
• labor performed through the cancellation date, at the proposal rates or the per diem rates in Section 11;
• equipment and materials installed, delivered, or ordered and non-returnable, at the proposal price;
• returnable equipment, subject to the supplier's restocking fee and return shipping;
• mobilization, permit, programming, and administrative costs already incurred; and
• any other charges earned under the Agreement.

IOT TECHS will apply the deposit and any payments against these amounts under Section 3. The Customer pays any remaining balance within seven (7) days of the final cancellation invoice. A cancellation request must be made in writing under Section 65.` },
  { n: 55, h: "Lock Box, Keys & Access Codes", b:
`The Customer may provide keys, lock box codes, gate or door codes, alarm codes, or other means of access so IOT TECHS can perform the work. IOT TECHS will:
• record each key, code, and lock box received in the project file, and keep it only for the duration of the project or service visit;
• store codes securely and share them only with personnel assigned to the job;
• secure doors, gates, and lock boxes it uses before leaving the property, and return keys when the work ends or upon request; and
• delete stored access codes after project completion unless the Customer has an active service agreement requiring them.

The Customer should change access, alarm, and lock box codes after the project ends. IOT TECHS is not responsible for access left open or unsecured by the Customer, occupants, other contractors, or anyone else, or for losses after keys and codes are returned. If the Customer instructs IOT TECHS to leave the property unlocked, unattended, or accessible, the Customer does so at its own risk.

IOT TECHS' responsibility for lost keys or codes is limited to the reasonable cost of rekeying the affected lock or changing the affected code, where the loss was caused by IOT TECHS.` },
  { n: 56, h: "Site Safety & Hazardous Conditions", b:
`The Customer must provide a reasonably safe work area. IOT TECHS may stop or decline work in any area that presents a safety risk, including suspected asbestos, lead, mold, exposed or live electrical hazards, structural instability, pest infestation, unsafe roofs or ceilings, extreme heat or cold in attics, aggressive animals, or hostile or threatening occupants.

IOT TECHS does not test for, remove, disturb, or remediate hazardous materials. If a hazard is found, work in the affected area stops until the Customer has it corrected by a qualified professional. Any resulting delay, return visit, standby, or redesign is a Customer-caused condition under Section 11. Pets must be secured and children kept away from active work areas.` },
  { n: 57, h: "Permits & Inspections", b:
`Unless the proposal states otherwise, IOT TECHS will obtain the permits it is required to obtain for its own scope of work, and permit and inspection fees are billed to the Customer at cost. The Customer is responsible for building, association, landlord, or other approvals under Section 40, and for providing access for any required inspection.

Delays caused by permit processing, failed inspections due to conditions outside IOT TECHS' scope, or corrections required by an inspector for pre-existing conditions are not IOT TECHS' responsibility and may be billed as additional work.` },
  { n: 58, h: "Acceptance & Punch List", b:
`At completion, IOT TECHS will walk through or demonstrate the system with the Customer when practical. The Customer has three (3) calendar days after completion to report deficiencies in writing.

If no deficiencies are reported in that time, or if the Customer begins using the system for its intended purpose, the work is deemed accepted, subject to the warranties in Sections 16 and 17. Reported punch-list items will be corrected within a reasonable time and do not delay final payment under Section 4.` },
  { n: 59, h: "Property Damage Claims", b:
`Upon request, IOT TECHS will provide a certificate of insurance for the coverage it maintains. Normal installation impacts described in Section 35 are not damage.

Any claim that IOT TECHS damaged property must be reported in writing within forty-eight (48) hours after the work in the affected area, with photos, and the affected area must be left as-is so IOT TECHS can inspect it. IOT TECHS may choose to repair the damage itself or through a contractor it selects, or reimburse the reasonable cost of repair. Damage not reported within that time, or repaired by others before IOT TECHS can inspect, may be denied.` },
  { n: 60, h: "Network & Cybersecurity Responsibility", b:
`After final handoff, the Customer is responsible for the security of its network, internet service, router, firewall, Wi-Fi, user accounts, and devices connected to the system. This includes changing default and installer passwords provided at handoff, keeping recovery information current, controlling user access, and applying manufacturer firmware and app updates unless covered by a maintenance agreement.

IOT TECHS is not responsible for unauthorized access, hacking, malware, data breaches, account takeovers, or privacy incidents caused by the Customer's network, ISP, shared or weak passwords, third-party platforms, or events after handoff, except to the extent caused by IOT TECHS' own negligence.` },
  { n: 61, h: "Alarm Monitoring & Third-Party Monitoring Providers", b:
`IOT TECHS is an authorized dealer for certain monitoring providers, including ADT and SafeStreets. IOT TECHS is not the alarm monitoring provider. Where monitoring is purchased, it is provided under the monitoring company's own separate contract, and that contract governs monitoring services, monitoring fees, monitoring-equipment ownership and warranties, response, cancellation, and renewal.

These Master Terms govern only the equipment, installation, and services provided directly by IOT TECHS. If these Terms conflict with a monitoring provider's contract about monitoring services, the provider's contract controls. Monitoring-provider equipment is not subject to the recovery terms in Section 30 unless IOT TECHS supplied and invoiced it directly.` },
  { n: 62, h: "Limitation of Liability", b:
`To the fullest extent permitted by law:
• IOT TECHS' total liability for any claim arising out of the Agreement, the work, or the system is limited to the total amount the Customer paid IOT TECHS under the applicable proposal or service order for the work giving rise to the claim.
• IOT TECHS is not liable for indirect, incidental, special, consequential, or punitive damages, including lost profits, lost business, lost data or footage, theft, burglary, vandalism, or other property loss that the system did not prevent, detect, or record.

The Customer agrees these limits are a fair allocation of risk and are reflected in IOT TECHS' pricing, consistent with Sections 32 and 37. These limits do not apply to liability for gross negligence, willful misconduct, or any liability that cannot be limited by law. Any limit found unenforceable is reduced to the maximum the law allows.` },
  { n: 63, h: "Indemnification", b:
`The Customer will indemnify, defend, and hold harmless IOT TECHS and its owners, employees, and technicians from claims, damages, fines, and expenses, including reasonable attorneys' fees, arising from:
• the Customer's use of the system, including video or audio recording, employee or tenant monitoring, or capture of neighboring property, as addressed in Section 34;
• the Customer's failure to obtain property authorization under Section 40;
• hazardous or unsafe site conditions under Section 56;
• work performed by the Customer or third parties outside IOT TECHS, including under Section 39; and
• the Customer's breach of the Agreement.

This section does not apply to the extent a claim is caused by IOT TECHS' own negligence or willful misconduct.` },
  { n: 64, h: "Subcontractors", b:
`IOT TECHS may use qualified subcontractors, vendors, or partner technicians to perform any part of the work. IOT TECHS remains responsible to the Customer for work performed under its authorization as provided in the Agreement. Subcontracted personnel are covered by the non-solicitation terms in Section 39 the same as IOT TECHS technicians.` },
  { n: 65, h: "Notices", b:
`Notices under the Agreement, including payment reminders, default and final notices under Section 6, ticket updates, and price-change notices, may be sent by email or text message to the contact information on file, by mail, or through the IOT TECHS customer portal. A notice is considered received when sent electronically, or three (3) business days after mailing.

The Customer must send cancellation requests, damage claims, deficiency reports, and other formal notices to IOT TECHS in writing by email or through the customer portal. A message given only to a technician is not notice to IOT TECHS.` },
  { n: 66, h: "Photos, Social Media, Reviews & Marketing Consent", b:
`Project documentation. IOT TECHS may take photos and video of the site, equipment, wiring, and work before, during, and after installation for quality control, warranty, billing, dispute, and training records. These records are kept confidential under Section 49.

Marketing use (optional). IOT TECHS may use photos or video of the completed work in its website, social media, proposals, and other marketing only if the Customer opts in in Section 83. Marketing content will never show the Customer's name, address, house number, license plates, faces of occupants, interior layouts, recorder or network equipment locations, camera views, or anything else that could identify the property or weaken its security, unless the Customer separately approves it in writing.

The Customer may withdraw marketing consent at any time in writing. IOT TECHS will stop new uses within a reasonable time but is not required to recall printed materials or remove content already shared by third parties. Declining marketing consent does not affect pricing or service, unless a written discount was tied to it.

IOT TECHS' social media. Any photos or video IOT TECHS posts to social media are covered by the marketing consent above, including its rule against showing anything that identifies the property or weakens its security. IOT TECHS will not tag the Customer, its business, or its location without permission.

Customer reviews. The Customer is free to post honest reviews and opinions about IOT TECHS on any platform, positive or negative, and nothing in the Agreement restricts that right. Any PCP credit or incentive offered for a review is given for an honest review of any rating, never for a positive one. IOT TECHS may respond publicly to reviews but will not disclose the Customer's security details, recordings, pricing, or account information in a response.

Security-sensitive posts. The Customer is encouraged not to post camera locations, recorder or network equipment locations, system layouts, screenshots showing camera coverage gaps, passwords, or access codes publicly. IOT TECHS is not responsible for security risks created by the Customer's own posts.

Technicians and personnel. The Customer may not post IOT TECHS technicians' personal contact information, home addresses, or personal social media accounts, or use social media to harass, threaten, or solicit them. Contacting a technician through social media to arrange outside work is a violation of Section 39. Abusive or threatening posts or messages directed at personnel are treated as conduct under Section 1, and IOT TECHS may suspend non-emergency service until the matter is resolved.` },
  { n: 67, h: "Abandoned Equipment & Materials", b:
`If the Customer does not allow installation, accept delivery, or pick up ordered equipment within thirty (30) days after IOT TECHS gives notice that it is ready, IOT TECHS may invoice the equipment as delivered and charge reasonable storage. If the equipment remains unclaimed and unpaid sixty (60) days after a second notice, IOT TECHS may, where permitted by law, return, resell, or reuse it and apply the net proceeds, after restocking costs under Section 30, to the Customer's balance.

Customer property, removed equipment, or old devices left with IOT TECHS for more than thirty (30) days after notice may be disposed of where permitted by law.` },
  { n: 68, h: "Reconnection & Service Restoration", b:
`After a default is cured, IOT TECHS will restore services, remote access, or other functionality suspended under Sections 6 and 28 within two (2) business days after payment clears. A $99 restoration fee applies to each restoration, plus a service-call charge under Section 21 if an on-site visit is required. Work rescheduled because of a default is placed on the next available date and does not keep its original slot.` },
  { n: 69, h: "Invoice Disputes", b:
`The Customer must dispute any invoice in writing under Section 65 within seven (7) calendar days after receiving it, identifying each disputed line item and the reason. The undisputed portion remains due on the original due date. An invoice not disputed within that time is considered accepted, except for errors that cannot lawfully be waived. A good-faith dispute of a specific line item does not place that item in default while IOT TECHS reviews it.` },
  { n: 70, h: "Equipment Substitution & Discontinued Models", b:
`If a specified make, model, or part is discontinued, backordered, or unavailable, IOT TECHS may substitute equipment of equal or better specification and will notify the Customer before installing it. A substitution that does not increase the price or materially change function, coverage, or appearance needs no change order. If the only available alternative costs more or materially differs, it goes through the change-order process in Section 12.` },
  { n: 71, h: "Delivery, Risk of Loss & Equipment Returns", b:
`Risk of loss for equipment passes to the Customer when it is delivered to or installed at the property. Title remains with IOT TECHS until paid in full under Section 29.

Installed, opened, programmed, special-order, or custom-configured equipment cannot be returned. Unopened standard equipment the Customer asks to return within fourteen (14) days after delivery may be accepted at IOT TECHS' discretion, less a 20% restocking fee and any supplier restocking and return shipping charges. Equipment returned as part of a recovery after default is handled under Section 30.` },
  { n: 72, h: "Power, Internet & Customer-Provided Utilities", b:
`Unless included in the proposal, the Customer provides working electrical outlets at recorder, network, and power-supply locations, an active internet connection with router access, and the credentials needed to connect the system. Line-voltage electrical work, new circuits, and outlet installation require a licensed electrician and are not included unless stated in writing.

IOT TECHS recommends a battery backup (UPS) for recorders and network equipment. System outages or data loss caused by power failures, surges, or internet service interruptions are excluded under Sections 18 and 33.` },
  { n: 73, h: "Maintenance & Service Plans: Term, Renewal & Cancellation", b:
`Maintenance, monitoring-support, cloud, or other recurring service plans sold directly by IOT TECHS state their price, billing frequency, included services, and term in a separate signed plan. A plan renews only if the plan document clearly discloses the renewal and the Customer affirmatively agrees to it; IOT TECHS will send a reminder before any renewal as required by law.

The Customer may cancel a renewing plan by written notice under Section 65 at least thirty (30) days before the next billing period. Fees already paid for the current period are non-refundable except as required by law. A plan cannot be used while the account is in default.` },
  { n: 74, h: "Signer Authority & Personal Guaranty", b:
`The person signing the Agreement represents that they are at least eighteen (18) years old and authorized to bind the Customer and approve work at the property.

For business customers, IOT TECHS may require the signer or an owner to sign a personal guaranty. A guarantor who signs the guaranty in Section 83 personally guarantees full and timely payment of all amounts owed under the Agreement, including charges and collection costs under Sections 6 and 30, if the business does not pay. The guaranty continues if the business closes, sells, or changes ownership.` },
  { n: 75, h: "Confidentiality of Pricing & Proposals", b:
`IOT TECHS' proposals, pricing, PCP terms, system designs, survey reports, and layouts are confidential business information. The Customer may share them with its own advisors, landlord, insurer, or lender as needed, but may not provide them to other contractors or competitors for the purpose of obtaining competing bids or copying IOT TECHS' design. Proposals remain IOT TECHS' work product until the project is paid in full.` },
  { n: 76, h: "Assignment", b:
`The Customer may not assign or transfer the Agreement without IOT TECHS' written consent and the transfer procedure in Section 26. IOT TECHS may assign the Agreement or any receivable to a successor, financing provider, or collection agency, with notice to the Customer where required by law.` },
  { n: 77, h: "Independent Contractor & No Third-Party Beneficiaries", b:
`IOT TECHS performs the work as an independent contractor. Nothing in the Agreement creates a partnership, joint venture, employment, or agency relationship. The Agreement benefits only IOT TECHS and the Customer, and no landlord, tenant, occupant, monitoring provider, or other third party may enforce it.` },
  { n: 78, h: "Electronic Signatures and Electronic Acceptance", b:
`Electronic signatures, approvals, and click-to-accept acknowledgments have the same effect as handwritten signatures where permitted by law. The Customer is responsible for ensuring the signer has authority to bind the Customer or property owner.

The Customer agrees that electronic signatures, digital signatures, and electronic initials may be used for all project documents. A Customer may not later invalidate an otherwise valid approval solely because it was signed electronically rather than on paper. Electronically signed copies and system-generated signature records may be kept as part of the project file.` },
  { n: 79, h: "Entire Agreement & Written Modifications", b:
`The Agreement consists of these Terms, the signed proposal, approved addenda, written change orders, applicable warranty or maintenance documents, and any separately signed program agreement. If documents conflict, the more specific signed project document controls its subject matter, as set out in Section 42.

No oral statement by a salesperson, technician, customer, contractor, or other person modifies the Agreement unless confirmed in writing by an authorized IOT TECHS representative.` },
  { n: 80, h: "Waiver & Survival", b:
`If IOT TECHS does not enforce a term, delays enforcing it, or grants a courtesy under Section 1, that does not waive the term or IOT TECHS' right to enforce it later. A waiver is effective only if made in writing by an authorized IOT TECHS representative.

Terms that by their nature should continue after the project ends or the Agreement is terminated will survive, including payment obligations, default and collection (Sections 6–8), ownership and recovery (Sections 29–30), warranties and exclusions, technician non-solicitation (Section 39), confidentiality, limitation of liability (Section 62), and indemnification (Section 63).` },
  { n: 81, h: "Severability", b:
`If any provision is found invalid or unenforceable, the remaining provisions remain effective to the fullest extent permitted by law.` },
  { n: 82, h: "Governing Law & Disputes", b:
`The Agreement is governed by the laws of the State of New Jersey, without regard to conflict-of-law rules, unless the law of the state where the work is performed must apply. Any lawsuit will be brought in the state courts located in the New Jersey county where IOT TECHS maintains its principal place of business, or in the county where the work was performed if the law requires it.

Before filing suit on a dispute other than collection of an unpaid balance, both parties will first try in good faith to resolve it through direct discussion for at least fourteen (14) days after written notice. Collection actions under Section 6 do not require this step.

In any action to collect amounts due or enforce the Agreement, the prevailing party may recover reasonable attorneys' fees, court costs, and collection expenses to the extent permitted by law. For projects in another state, that state's law applies where it must, and the remaining terms apply to the fullest extent permitted.` },
  { n: 83, h: "Customer Acknowledgment", b:
`By signing, the Customer acknowledges reviewing the project scope, pricing, payment obligations, deposit terms, default and recovery terms, scheduling requirements, warranty limitations, service policies, existing-infrastructure exclusions, access and credential policies, and all other incorporated terms, and authorizes IOT TECHS to perform the approved work under these terms.

The signature covers the entire Agreement. The customer initials each required acknowledgment; marketing consent is optional and leaving it blank means they do not consent. Residential in-home sales include the right-to-cancel acknowledgment and Appendix A Notice of Cancellation; business accounts may include the personal guaranty in Section 74.` },
];

// The acknowledgments the customer initials on the proposal signature (Section 83). Required ones must be
// checked to sign. `pcpOnly` items show only when the proposal actually carries a PCP credit.
export const PROPOSAL_ACKS = [
  { key: "terms", required: true, label: "I have read and agree to the IOT TECHS Master Terms & Conditions." },
  { key: "payment", required: true, label: "Prompt payment: the balance is due at substantial completion; a payment more than 7 days late with no approved arrangement puts the account in default, with a $35 late fee and the remedies in Section 6." },
  { key: "pcp", required: true, pcpOnly: true, label: "PCP credit: the credit is discretionary, may be adjusted if conditions change, and is removed if the account defaults." },
  { key: "marketing", required: false, label: "Social media & marketing (optional): IOT TECHS may post non-identifying photos and video of my completed project." },
];
