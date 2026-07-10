import "./globals.css";

export const metadata = {
  title: "IOT TECHS · Project Dashboard",
  description: "Field service platform — project management for IOT TECHS",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
