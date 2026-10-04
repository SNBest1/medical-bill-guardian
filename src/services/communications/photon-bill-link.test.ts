import { describe, expect, it } from "vitest";
import { evaluateHospitalBillLink, parseLocalBillLinkMessage } from "./photon-bill-link";
import type { PhotonInboundFields } from "./photon-inbox";

const hospital = "+15555550100";
const base: PhotonInboundFields = { messageId: "m-1", direction: "inbound", messagePlatform: "iMessage", spacePlatform: "iMessage", spaceType: "dm", senderId: hospital, contentType: "text", contentText: "Here is the itemized bill: https://bills.example.test/maya-ortiz-lr-20931.pdf thanks" };

describe("hospital bill-link policy", () => {
  it("accepts a DM from the hospital phone with an https .pdf link, taking the first URL", () => {
    expect(evaluateHospitalBillLink(base, hospital)).toEqual({ messageId: "m-1", url: "https://bills.example.test/maya-ortiz-lr-20931.pdf" });
    expect(evaluateHospitalBillLink({ ...base, contentText: "https://a.example.test/x.pdf?sig=1 and https://b.example.test/y.pdf" }, hospital)?.url).toBe("https://a.example.test/x.pdf?sig=1");
    expect(evaluateHospitalBillLink({ ...base, contentText: "Bill (https://bills.example.test/b.PDF)." }, hospital)?.url).toBe("https://bills.example.test/b.PDF");
  });

  it("rejects wrong sender, group chats, other platforms, attachments, and outbound messages", () => {
    expect(evaluateHospitalBillLink({ ...base, senderId: "+15555550101" }, hospital)).toBeNull();
    expect(evaluateHospitalBillLink(base, "")).toBeNull();
    expect(evaluateHospitalBillLink({ ...base, spaceType: "group" }, hospital)).toBeNull();
    expect(evaluateHospitalBillLink({ ...base, messagePlatform: "sms" }, hospital)).toBeNull();
    expect(evaluateHospitalBillLink({ ...base, contentType: "attachment" }, hospital)).toBeNull();
    expect(evaluateHospitalBillLink({ ...base, direction: "outbound" }, hospital)).toBeNull();
  });

  it("rejects non-PDF links, plain http for remote hosts, oversize text, and missing IDs", () => {
    expect(evaluateHospitalBillLink({ ...base, contentText: "https://bills.example.test/page.html" }, hospital)).toBeNull();
    expect(evaluateHospitalBillLink({ ...base, contentText: "http://bills.example.test/b.pdf" }, hospital)).toBeNull();
    expect(evaluateHospitalBillLink({ ...base, contentText: "no link here" }, hospital)).toBeNull();
    expect(evaluateHospitalBillLink({ ...base, contentText: `https://bills.example.test/b.pdf ${"x".repeat(2000)}` }, hospital)).toBeNull();
    expect(evaluateHospitalBillLink({ ...base, messageId: "" }, hospital)).toBeNull();
    expect(evaluateHospitalBillLink({ ...base, contentText: "http://127.0.0.1:9/b.pdf" }, hospital)?.url).toBe("http://127.0.0.1:9/b.pdf");
  });

  it("adapts the SDK in-process message shape", () => {
    const link = parseLocalBillLinkMessage({ __platform: "iMessage", type: "dm" }, { id: "m-2", direction: "inbound", platform: "iMessage", sender: { id: hospital }, content: { type: "text", text: "https://bills.example.test/z.pdf" } }, hospital);
    expect(link?.messageId).toBe("m-2");
  });
});
