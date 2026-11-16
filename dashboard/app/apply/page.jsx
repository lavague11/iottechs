import ApplyClient from "./apply-client";

export const metadata = {
  title: "Security Technician Jobs in NJ & NYC — Now Hiring | IOT TECHS",
  description: "Install and service security systems across NYC & NJ. Paid training — no experience needed. Apply in minutes.",
  alternates: { canonical: "/apply" },
  openGraph: {
    title: "Join IOT TECHS — Now Hiring",
    description: "Build a career keeping people safe. Paid training, weekly pay, real growth across NYC & NJ. Apply now.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Join IOT TECHS — Now Hiring",
    description: "Build a career keeping people safe. Paid training, weekly pay, real growth. Apply now.",
  },
};

// Public job application. No auth — anyone can apply; they get an Application ID + PIN to track it.
export default function ApplyPage() {
  return <ApplyClient />;
}
