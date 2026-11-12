import Link from "next/link";
import { Wordmark } from "../components/brand";

export const metadata = {
  title: "Terms & Conditions · IOT TECHS",
  description: "The terms and conditions governing use of IOT TECHS services.",
};

// Terms & Conditions for IOT TECHS (operated by La Vague Inc.) — security/CCTV, low-voltage,
// networking, audio installation + ADT monitoring across NYC & NJ, plus the customer portal.
// Linked from the account-creation form (public/home.html) and the customer info-confirm step
// (lead-info-step.jsx).
// NOTE FOR THE OWNER: this is a solid working draft written to be adopted as-is, but it has NOT
// been reviewed by an attorney. Before relying on it, have counsel confirm the governing-law state,
// the legal entity name/address, the warranty + cancellation specifics, and the arbitration clause.
// Update EFFECTIVE whenever the body changes.
const EFFECTIVE = "Effective November 12, 2026";

const SECTIONS = [
  {
    h: "1. Agreement to These Terms",
    p: [
      "These Terms & Conditions (“Terms”) are a binding agreement between you (“you” or the “Customer”) and La Vague Inc., doing business as IOT TECHS (“IOT TECHS,” “we,” “us,” or “our”). They govern your use of our services, security systems, website, and online customer portal.",
      "By creating an account, confirming your information, accepting a proposal, signing a document electronically, or using our services, you agree to be bound by these Terms. If you do not agree, do not create an account or use our services.",
    ],
  },
  {
    h: "2. Our Services",
    p: [
      "We design, sell, install, configure, and service security and low-voltage systems — including video surveillance (CCTV), access control, alarm and intrusion systems, structured cabling and networking, and commercial audio — and we offer alarm monitoring through third-party monitoring providers. We serve residential and commercial customers in the New York City and New Jersey areas.",
      "We also provide an online portal where you can review proposals, track your project, sign documents, and make payments. The specific scope of work, equipment, and pricing for your project are defined in the proposal you accept. Nothing on the website or portal is a binding quote until a written proposal is issued and accepted.",
    ],
  },
  {
    h: "3. Your Account & Electronic Communications",
    p: [
      "You are responsible for keeping your login credentials and PIN confidential and for all activity under your account. Notify us immediately of any unauthorized use. You agree that the contact and account information you provide (name, business, phone, email, and address) is accurate and kept current.",
      "You consent to receive communications, notices, proposals, invoices, and agreements from us electronically, and you agree that your electronic signature on a proposal or document has the same legal effect as a handwritten signature.",
    ],
  },
  {
    h: "4. Proposals, Pricing & Estimates",
    p: [
      "Estimates and figures shown before a proposal is accepted are for planning only and may change based on a site survey, actual conditions, equipment availability, or changes you request. Pricing in an accepted proposal is firm except for changes documented in a written change order or addendum, which you approve through the portal.",
      "Applicable sales tax and any permit or inspection fees are shown on your proposal or invoice unless stated otherwise.",
    ],
  },
  {
    h: "5. Payments, Deposits & Late Payments",
    p: [
      "Deposits, progress payments, and final balances are due on the dates and amounts stated in your accepted proposal. We may schedule or begin work upon receipt of the required deposit, and we may withhold final deliverables (such as a completion certificate or system credentials) until the balance is paid in full.",
      "Accepted payment methods are shown on your proposal and invoice. Amounts not paid when due may be subject to a late fee and to suspension of work or services to the extent permitted by law.",
    ],
  },
  {
    h: "6. Scheduling, Installation & Site Access",
    p: [
      "You agree to provide safe, timely access to the installation site and any information, power, or network access reasonably needed to complete the work. You are responsible for obtaining any landlord, HOA, or property-owner permissions required for the installation.",
      "Scheduled dates are estimates. Delays caused by site access, permits, inspections, weather, product availability, or third parties may affect the schedule and are not our responsibility.",
    ],
  },
  {
    h: "7. Cancellation & Refunds",
    p: [
      "You may cancel a project before work begins; any deposit is refundable less the cost of equipment already ordered, custom items, permits obtained, and work already performed. Once installation has begun, amounts for completed work and installed or special-order equipment are non-refundable.",
      "Where a statutory right to cancel applies (for example, a right-to-cancel period for certain consumer contracts), that right controls over this section.",
    ],
  },
  {
    h: "8. Monitoring Services",
    p: [
      "If your system includes alarm monitoring, that monitoring is performed by a third-party monitoring provider under that provider’s own terms, which you agree to separately. Monitoring depends on working power, internet or cellular connectivity, and the monitored equipment, none of which we guarantee to be uninterrupted.",
      "We are not the monitoring provider and are not responsible for the acts, omissions, or response times of the monitoring provider or of any emergency responder.",
    ],
  },
  {
    h: "9. Warranty",
    p: [
      "We warrant our installation workmanship for the period stated on your completion certificate. Manufacturer warranties on equipment are provided by the respective manufacturers and passed through to you where transferable.",
      "Our warranty does not cover damage or failure caused by misuse, abuse, tampering, unauthorized modification or relocation, power surges, lightning, water, pests, loss of power or connectivity, or other causes outside our reasonable control. This is the only warranty we provide; all other warranties, express or implied, including merchantability and fitness for a particular purpose, are disclaimed to the fullest extent permitted by law.",
    ],
  },
  {
    h: "10. Customer Responsibilities",
    p: [
      "You are responsible for using the system lawfully, including complying with laws on recording video and audio and on notifying others where required. You agree not to place cameras or devices where they would violate another person’s reasonable expectation of privacy.",
      "You are responsible for safeguarding your own passwords, PINs, and recorded footage, and for maintaining the power and internet service the system depends on.",
    ],
  },
  {
    h: "11. Privacy",
    p: [
      "We collect and use the information you provide to deliver our services, communicate with you, and operate your portal, as described in our privacy practices. We do not sell your personal information. We may share information with service providers (such as payment processors and monitoring providers) only as needed to provide the services.",
    ],
  },
  {
    h: "12. Intellectual Property",
    p: [
      "The website, portal, software, designs, and documentation we provide are owned by us or our licensors and are protected by law. You may use them only to receive and manage your services. You may not copy, resell, reverse-engineer, or create derivative works from them.",
    ],
  },
  {
    h: "13. Limitation of Liability",
    p: [
      "Security and monitoring systems reduce but do not eliminate risk. We are not an insurer, and we do not guarantee that any loss, theft, damage, or injury will be prevented or detected. You agree to obtain and maintain your own insurance for such risks.",
      "To the fullest extent permitted by law, our total liability arising out of or relating to these Terms or our services will not exceed the amount you paid us for the services giving rise to the claim, and we will not be liable for indirect, incidental, special, consequential, or punitive damages.",
    ],
  },
  {
    h: "14. Indemnification",
    p: [
      "You agree to indemnify and hold harmless IOT TECHS and its owners, employees, and contractors from claims, damages, and expenses arising from your use or misuse of the system, your violation of these Terms, or your violation of any law or third-party right.",
    ],
  },
  {
    h: "15. Governing Law & Dispute Resolution",
    p: [
      "These Terms are governed by the laws of the State of New York, without regard to its conflict-of-laws rules. The parties will first attempt to resolve any dispute informally by contacting each other.",
      "If a dispute cannot be resolved informally, it will be resolved by binding arbitration or in the state or federal courts located in New York, as permitted by law, and each party waives any right to a jury trial to the extent permitted. Nothing here prevents either party from seeking relief in small-claims court.",
    ],
  },
  {
    h: "16. Changes to These Terms",
    p: [
      "We may update these Terms from time to time. We will post the updated version with a new effective date. Your continued use of our services after changes take effect constitutes acceptance of the revised Terms.",
    ],
  },
  {
    h: "17. Severability & Entire Agreement",
    p: [
      "If any provision of these Terms is found unenforceable, the remaining provisions stay in effect. These Terms, together with your accepted proposal and any addenda, are the entire agreement between you and us regarding your project and supersede prior discussions.",
    ],
  },
  {
    h: "18. Contact",
    p: [
      "Questions about these Terms? Reach out through your project portal or contact the IOT TECHS office and we will be glad to help.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="tc-root">
      <style>{TC_CSS}</style>
      <header className="tc-top">
        <a href="/go" className="tc-brand" aria-label="IOT TECHS home">
          <Wordmark height={24} />
        </a>
        <Link href="/" className="tc-back">← Home</Link>
      </header>

      <main className="tc-doc">
        <div className="tc-kicker">Legal</div>
        <h1 className="tc-title">Terms &amp; Conditions</h1>
        <p className="tc-eff">{EFFECTIVE}</p>

        <p className="tc-intro">
          Please read these Terms carefully. They explain the agreement between you and IOT TECHS when you
          create an account, accept a proposal, or use our services.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.h} className="tc-sec">
            <h2 className="tc-h">{s.h}</h2>
            {s.p.map((para, i) => <p key={i} className="tc-p">{para}</p>)}
          </section>
        ))}

        <footer className="tc-foot">© {"IOT TECHS"} · All rights reserved.</footer>
      </main>
    </div>
  );
}

const TC_CSS = `
.tc-root{min-height:100vh;background:#f6f5f2;color:#0B0F1A;font-family:var(--font,'Inter',system-ui,sans-serif)}
.tc-top{max-width:820px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:20px 24px}
.tc-brand{display:inline-flex;text-decoration:none}
.tc-back{font-size:.86rem;font-weight:700;color:#8a6d2f;text-decoration:none}
.tc-back:hover{text-decoration:underline}
.tc-doc{max-width:820px;margin:0 auto 60px;background:#fff;border:1px solid #e4e0d8;border-radius:16px;padding:40px 44px}
.tc-kicker{font-size:.68rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a8894e}
.tc-title{font-family:'Bricolage Grotesque',sans-serif;font-size:2rem;font-weight:800;margin:6px 0 8px;letter-spacing:-.01em}
.tc-eff{font-size:.84rem;color:#6f7686;margin:0 0 18px}
.tc-intro{font-size:.92rem;line-height:1.62;color:#39404f;margin:0 0 26px}
.tc-sec{margin:0 0 22px}
.tc-h{font-family:'Bricolage Grotesque',sans-serif;font-size:1.05rem;font-weight:800;margin:0 0 8px;color:#0B0F1A}
.tc-p{font-size:.92rem;line-height:1.62;color:#39404f;margin:0 0 10px}
.tc-foot{margin-top:34px;padding-top:18px;border-top:1px solid #eee;font-size:.8rem;color:#8a8578}
@media(max-width:640px){.tc-doc{padding:26px 20px;border-radius:12px;margin:0 12px 40px}.tc-title{font-size:1.6rem}}
`;
