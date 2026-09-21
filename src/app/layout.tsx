import type { Metadata } from "next";
import { themeBootstrap } from "@/lib/theme";
import "./globals.css";
import "./writes.css";
import "./write-history.css";
import "./reset.css";
import "./expand-options.css";
import "./json-conversion.css";
import "./read-tabs.css";
import "./theme.css";

export const metadata: Metadata = {
  title: "Stripe API Viewer",
  description:
    "A personal Stripe API explorer with separate read and protected write workspaces.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
