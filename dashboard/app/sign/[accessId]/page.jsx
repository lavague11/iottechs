import SignRedirect from "./sign-redirect";

// Dedicated, shareable "Review & Sign" link (/sign/<accessId>). It exists so a texted/forwarded signing
// link previews with its OWN social card — the `opengraph-image` in THIS route segment — distinct from the
// generic project card (/project/<id>). The page itself just forwards a real browser to the actual signer
// (?sign=1 on the project page, which handles auth/PIN + option selection + signing); a social crawler
// reads the card below without following the redirect. noindex, like every forwarded customer link.
export function generateMetadata() {
  const title = "Review & Sign Your Proposal";
  const description = "Review and sign your IOT TECHS proposal.";
  return {
    title: "Review & Sign · IOT TECHS",
    description,
    openGraph: { title, description, siteName: "IOT TECHS", type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: false, follow: false },
  };
}

export default async function SignPage({ params }) {
  const { accessId } = await params;
  const dest = `/project/${encodeURIComponent(accessId)}?open=proposal&sign=1`;
  return <SignRedirect dest={dest} />;
}
