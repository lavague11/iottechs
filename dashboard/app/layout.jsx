import "./globals.css";

// metadataBase makes the auto-generated og:image an ABSOLUTE URL, which iMessage/social
// scrapers require. In production set APP_URL to the live origin.
export const metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://iot-techs.onrender.com"),
  title: "IOT TECHS · Project Dashboard",
  description: "Security & automation, professionally installed. Track your project from survey to completion.",
  openGraph: {
    title: "IOT TECHS",
    description: "Security & automation, professionally installed.",
    siteName: "IOT TECHS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IOT TECHS",
    description: "Security & automation, professionally installed.",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
