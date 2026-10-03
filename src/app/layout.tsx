import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Medical Bill Guardian", description: "Understand your hospital bill, review the evidence, and follow through on corrections." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
