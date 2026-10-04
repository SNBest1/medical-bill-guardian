import type { Metadata } from "next";
import { Albert_Sans, DM_Mono, Petrona } from "next/font/google";
import "./globals.css";

const display = Petrona({ subsets: ["latin"], variable: "--font-display" });
const interfaceFont = Albert_Sans({ subsets: ["latin"], variable: "--font-interface" });
const data = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-data" });

export const metadata: Metadata = { title: "Medical Bill Guardian", description: "A clearer view of every hospital charge." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body className={`${display.variable} ${interfaceFont.variable} ${data.variable}`}>{children}</body></html>;
}
