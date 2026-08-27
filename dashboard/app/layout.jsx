import "./globals.css";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";

// The deck-theme faces, self-hosted by Next (no external CDN). Exposed as CSS vars so any
// component can opt in with var(--font-sans) / var(--font-mono).
const fontSans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const fontMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono", display: "swap" });

// metadataBase makes the auto-generated og:image an ABSOLUTE URL, which iMessage/social
// scrapers require. In production set APP_URL to the live origin.
export const metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://iot-techs.com"),
  title: "IOT TECHS · Project Dashboard",
  description: "Make tomorrow safer today. Track your project from survey to completion.",
  openGraph: {
    title: "IOT TECHS",
    description: "Make tomorrow safer today.",
    siteName: "IOT TECHS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IOT TECHS",
    description: "Make tomorrow safer today.",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
