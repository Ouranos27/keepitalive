import type { Metadata, Viewport } from "next";
import { OpenPanelComponent } from "@openpanel/nextjs";
import localFont from "next/font/local";
import { config } from "@/lib/env";
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

const siteUrl = config.siteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "lastlight.lol",
  description: "Every payment buys seconds and a permanent link. Whoever holds the last light at zero keeps this page forever.",
  openGraph: {
    title: "lastlight.lol",
    description: "Every payment buys seconds and a permanent link. Whoever holds the last light at zero keeps this page forever.",
    url: siteUrl,
    siteName: "lastlight.lol",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "lastlight.lol",
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
      <body>
        {children}
        {/*
          Analytics only when a client id is configured, so a local run and a
          preview deploy send nothing. There is one page here, so screen views
          are the whole of what there is to measure.

          apiUrl points the SDK at a self-hosted OpenPanel and scriptUrl loads
          the SDK itself from one. They are two hosts, not one: a self-hosted
          instance answers events on its API origin and serves op1.js from its
          dashboard origin. Either can be left unset independently.

          Both are spread in rather than passed as undefined because the
          component serialises its options into an inline script, and an absent
          key is what the SDK's own fallbacks are written against.
        */}
        {config.analyticsClientId ? (
          <OpenPanelComponent
            clientId={config.analyticsClientId}
            {...(config.analyticsApiUrl ? { apiUrl: config.analyticsApiUrl } : {})}
            {...(config.analyticsScriptUrl ? { scriptUrl: config.analyticsScriptUrl } : {})}
            trackScreenViews
          />
        ) : null}
      </body>
    </html>
  );
}
