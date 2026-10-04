import { describe, expect, it } from "vitest";
import { verifiedSender } from "./sender";

const arc = (results: string) => new Headers({ "arc-authentication-results": `i=1; mx.cloudflare.net; ${results}` });

describe("verifiedSender", () => {
  it("accepts a DMARC pass aligned with the sender's domain", () => {
    expect(verifiedSender(arc("dkim=pass header.d=gmail.com header.s=20230601; dmarc=pass header.from=gmail.com policy.dmarc=none; spf=pass smtp.mailfrom=nipun.saini9@gmail.com"), "nipun.saini9@gmail.com")).toEqual({ ok: true });
    expect(verifiedSender(new Headers({ "authentication-results": "mx.cloudflare.net; dmarc=pass (p=NONE) header.from=Gmail.com" }), "nipun.saini9@gmail.com").ok).toBe(true);
  });

  it("rejects a forged From that fails or lacks DMARC", () => {
    expect(verifiedSender(arc("dkim=none; dmarc=fail header.from=gmail.com; spf=pass smtp.mailfrom=attacker.example"), "nipun.saini9@gmail.com")).toEqual({ ok: false, reason: "DMARC did not pass for gmail.com" });
    expect(verifiedSender(new Headers(), "nipun.saini9@gmail.com")).toEqual({ ok: false, reason: "No Cloudflare authentication results" });
  });

  it("rejects a pass for a different domain, or results from another server", () => {
    expect(verifiedSender(arc("dmarc=pass header.from=attacker.example"), "nipun.saini9@gmail.com").ok).toBe(false);
    expect(verifiedSender(new Headers({ "authentication-results": "evil.example; dmarc=pass header.from=gmail.com" }), "nipun.saini9@gmail.com")).toEqual({ ok: false, reason: "No Cloudflare authentication results" });
  });
});
