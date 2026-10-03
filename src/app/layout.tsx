import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Medical Bill Guardian", description: "A clearer view of every hospital charge." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
