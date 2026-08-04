import Link from "next/link";
import { Wordmark } from "../components/brand";

export const metadata = {
  title: "Terms & Conditions · IOT TECHS",
  description: "The terms and conditions governing use of IOT TECHS services.",
};

// SAMPLE Terms & Conditions. Placeholder legal copy — the owner will supply the real terms
// (company details, jurisdiction, warranty specifics, payment/cancellation policy) later.
// Linked from the account-creation form (public/home.html) and the customer info-confirm step
// (lead-info-step.jsx). Keep the structure; swap the body text when the real terms arrive.
const EFFECTIVE = "This is placeholder text — final terms pending.";

const SECTIONS = [
  {
    h: "1. Agreement to Terms",
    p: [
      "These Terms & Conditions (“Terms”) govern your use of the services, security systems, and online project portal provided by IOT TECHS (“we,” “us,” or “our”). By creating an account, confirming your information, or using our services, you agree to be bound by these Terms.",
      "If you do not agree to these Terms, do not create an account or use our services.",
    ],
  },
  {
    h: "2. Services",
    p: [
      "We provide the sale, installation, configuration, and servicing of camera and security systems, along with a customer portal to review proposals, track your project, sign documents, and make payments.",
      "The specific scope of work, equipment, and pricing for your project is defined in the proposal you accept. Nothing on the portal constitutes a binding quote until a proposal is issued and accepted.",
    ],
  },
  {
    h: "3. Your Account",
    p: [
      "You are responsible for maintaining the confidentiality of your login credentials and PIN, and for all activity that occurs under your account. Notify us immediately of any unauthorized use.",
      "You agree that the contact information you provide (name, business, phone, email, and address) is accurate and current.",
    ],
  },
  {
    h: "4. Proposals, Payments & Deposits",
    p: [
      "Deposits, progress payments, and final balances are due on the dates stated in your accepted proposal. Work may be scheduled upon receipt of the required deposit.",
      "Accepted payment methods and any applicable taxes are shown on your proposal and invoice.",
    ],
  },
  {
    h: "5. Installation & Access",
    p: [
      "You agree to provide safe and timely access to the installation site and any information reasonably needed to complete the work. Delays caused by site access, permits, or third parties may affect the schedule.",
    ],
  },
  {
    h: "6. Warranty",
    p: [
      "Warranty coverage, duration, and terms are stated on your completion certificate. Warranty does not cover damage from misuse, tampering, power surges, or acts outside our control.",
    ],
  },
  {
    h: "7. Privacy",
    p: [
      "We collect and use the information you provide to deliver our services, communicate with you, and operate your project portal. We do not sell your personal information.",
    ],
  },
  {
    h: "8. Limitation of Liability",
    p: [
      "To the fullest extent permitted by law, our liability arising out of or related to these Terms or our services is limited to the amount you paid for the services giving rise to the claim.",
      "Security systems reduce but do not eliminate risk; we are not an insurer and do not guarantee that loss, damage, or injury will be prevented.",
    ],
  },
  {
    h: "9. Changes to These Terms",
    p: [
      "We may update these Terms from time to time. Continued use of our services after changes take effect constitutes acceptance of the revised Terms.",
    ],
  },
  {
    h: "10. Contact",
    p: [
      "Questions about these Terms? Reach out through your project portal or contact our office and we will be happy to help.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="tc-root">
      <style>{TC_CSS}</style>
      <header className="tc-top">
        <Link href="/" className="tc-brand" aria-label="IOT TECHS home">
          <Wordmark height={24} />
        </Link>
        <Link href="/" className="tc-back">← Home</Link>
      </header>

      <main className="tc-doc">
        <div className="tc-kicker">Legal</div>
        <h1 className="tc-title">Terms &amp; Conditions</h1>
        <p className="tc-eff">{EFFECTIVE}</p>

        <div className="tc-note">
          This is a sample document. The final Terms &amp; Conditions will be provided by IOT TECHS.
        </div>

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
.tc-note{background:#fbf5e8;border:1px solid #ecdcb4;border-left:3px solid #C9A96E;border-radius:0 10px 10px 0;padding:11px 14px;font-size:.83rem;font-weight:600;color:#7a5f1f;margin-bottom:26px}
.tc-sec{margin:0 0 22px}
.tc-h{font-family:'Bricolage Grotesque',sans-serif;font-size:1.05rem;font-weight:800;margin:0 0 8px;color:#0B0F1A}
.tc-p{font-size:.92rem;line-height:1.62;color:#39404f;margin:0 0 10px}
.tc-foot{margin-top:34px;padding-top:18px;border-top:1px solid #eee;font-size:.8rem;color:#8a8578}
@media(max-width:640px){.tc-doc{padding:26px 20px;border-radius:12px;margin:0 12px 40px}.tc-title{font-size:1.6rem}}
`;
