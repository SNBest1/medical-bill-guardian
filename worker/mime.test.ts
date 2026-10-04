import { describe, expect, it } from "vitest";
import { caseIdFromSubject, parseProviderReply } from "./mime";
import type { InboundMessage } from "./types";

function statementPdf(): Uint8Array {
  const lines = ["Invoice: 48291", "Provider: University Hospital", "Service date: 2026-09-28", "Charges", "Emergency Room | 99285 | 1100.00", "Total: 1100.00"];
  const content = `BT /F1 12 Tf 50 750 Td 16 TL ${lines.map((line) => `(${line}) Tj T*`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${start}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function email(raw: string, subject = "Re: [CASE-42] Itemized statement"): InboundMessage {
  const bytes = new TextEncoder().encode(raw);
  return {
    from: "nipun.saini9@gmail.com", to: "ai@nipunsaini.com",
    headers: new Headers({ subject, "message-id": "<reply-42@example.com>" }),
    raw: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
    rawSize: bytes.byteLength,
    setReject() {},
  };
}

describe("provider reply parsing", () => {
  it("requires exactly one case marker", () => {
    expect(caseIdFromSubject("Re: [CASE-42]")).toBe("42");
    expect(caseIdFromSubject("CASE-42")).toBeNull();
    expect(caseIdFromSubject("[CASE-42] [CASE-43]")).toBeNull();
  });

  it("parses a MIME reply body without accepting arbitrary HTML as a bill", async () => {
    const parsed = await parseProviderReply(email("From: provider@example.com\r\nTo: ai@nipunsaini.com\r\nContent-Type: text/plain\r\n\r\nPlease see attached."));
    expect(parsed).toMatchObject({ caseId: "42", messageId: "<reply-42@example.com>", body: "Please see attached." });
    expect(parsed?.statement).toBeUndefined();
  });

  it("drops oversized mail before reading it", async () => {
    const message = email("ignored");
    message.rawSize = 6_000_001;
    expect(await parseProviderReply(message)).toBeNull();
  });

  it("extracts and validates a text PDF attachment", async () => {
    const attachment = Buffer.from(statementPdf()).toString("base64");
    const raw = [
      "MIME-Version: 1.0", "Content-Type: multipart/mixed; boundary=guardian", "", "--guardian",
      "Content-Type: text/plain", "", "Please review the statement.", "--guardian",
      "Content-Type: application/pdf; name=bill.pdf", "Content-Disposition: attachment; filename=bill.pdf",
      "Content-Transfer-Encoding: base64", "", attachment, "--guardian--", "",
    ].join("\r\n");
    const parsed = await parseProviderReply(email(raw));
    expect(parsed?.statement).toContain("Invoice: 48291");
    expect(parsed?.statement).toContain("Emergency Room | 99285 | 1100.00");
  });
});
