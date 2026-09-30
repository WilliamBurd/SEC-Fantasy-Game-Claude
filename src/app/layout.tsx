import type { Metadata } from "next";
import { Barlow_Condensed, Manrope } from "next/font/google";
import { SiteHeader } from "@/components/shell/site-header";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

// Headings, prices and points: a condensed scoreboard face.
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "SEC Gridiron 100",
  description: "Weekly SEC fantasy football with a 100-credit salary cap.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${manrope.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
