import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Self-hosted variable faces, per the brief.
 *
 * Archivo carries the display voice: a grotesque with a width axis, so the
 * clock can be set heavy and wide enough to feel like it is pressing down on
 * the page. Geist Mono carries every number that is not the clock, because a
 * ledger of money wants one column width per glyph.
 */
const display = localFont({
  variable: "--font-display",
  display: "swap",
  src: [{ path: "./fonts/Archivo-Variable.woff2", weight: "100 900", style: "normal" }],
});

const mono = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [{ path: "./fonts/GeistMono-Variable.woff2", weight: "100 900", style: "normal" }],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://keepitalive.lol";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "keepitalive.lol",
  description: "This page dies at zero. Paying is the only thing that moves the clock.",
  openGraph: {
    title: "keepitalive.lol",
    description: "This page dies at zero. Paying is the only thing that moves the clock.",
    url: siteUrl,
    siteName: "keepitalive.lol",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "keepitalive.lol",
    description: "This site dies in 24 hours unless you pay.",
  },
  robots: { index: true, follow: true },
};

/*
 * Light is locked, not a preference. The dread is carried entirely by the
 * clock, and it needs a calm ground to be wrong against. A dark version of
 * this page reads as a game; there is no second theme to fall back to.
 */
export const viewport: Viewport = {
  themeColor: "#F3F3F1",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
