import { NextResponse, type NextRequest } from "next/server";

/** Fails closed before any live case or API route can expose real patient data. */
export function proxy(_request: NextRequest) {
  if (process.env.DEMO_MODE === "false") return NextResponse.json({ error: "Live mode is disabled until user identity, patient consent, and a provider communication adapter are implemented" }, { status: 503 });
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*", "/cases/:path*"] };
