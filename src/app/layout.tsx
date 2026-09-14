import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stripe API Viewer",
  description:
    "A little clarity for your Stripe data. A personal, read-only API explorer.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
