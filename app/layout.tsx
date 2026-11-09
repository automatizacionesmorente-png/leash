import type { Metadata } from "next";
import { Caveat, Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const serif = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], axes: ["opsz"] });
const sans = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
const hand = Caveat({ variable: "--font-caveat", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Leash: the firewall between AI agents and your PayPal",
  description: "AI agents refund, invoice and spend on your PayPal only within rules you write in plain words, checked against PayPal's own records.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} ${hand.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
