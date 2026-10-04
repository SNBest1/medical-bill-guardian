import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scenarios } from "../scenarios";
import { parseItemizedBill } from "./parse-bill";
import { extractPdfText, PdfReadError } from "./pdf-text";
import { BillParseError, longDateToIso, parsePdfBill } from "./parse-pdf-bill";

const files: Record<string, string> = { "bike-wrist": "maya-ortiz-lr-20931.pdf", "car-concussion": "daniel-brooks-st-77140.pdf", "ski-ankle": "priya-nair-au-30518.pdf" };
const pdfBytes = (scenarioId: string) => readFileSync(new URL(`../../../public/bills/${files[scenarioId]}`, import.meta.url));

describe("PDF text extraction and bill parsing", () => {
  it.each(scenarios.map((scenario) => [scenario.id, scenario] as const))("reads the real %s PDF into the same bill the scenario statement describes", async (_id, scenario) => {
    const { pages, text } = await extractPdfText(pdfBytes(scenario.id));
    expect(pages).toBe(1);
    const bill = parsePdfBill(text);
    const expected = parseItemizedBill(scenario.statement);
    expect(bill.provider).toBe(scenario.hospital.name);
    expect(bill.patient).toBe(`${scenario.patient.firstName} ${scenario.patient.lastName}`);
    expect(bill.invoiceId).toBe(expected.invoiceId);
    expect(bill.total).toBe(expected.total);
    expect(bill.patientResponsibility).toBe(expected.patientResponsibility);
    expect(bill.insuranceAdjustments).toBe(expected.insuranceAdjustments);
    expect(bill.items.map(({ description, code, amount, serviceDate }) => ({ description, code, amount, serviceDate }))).toEqual(expected.items.map(({ description, code, amount, serviceDate }) => ({ description, code, amount, serviceDate })));
  });

  it("rejects non-PDF bytes", async () => {
    await expect(extractPdfText(Buffer.from("not a pdf at all"))).rejects.toBeInstanceOf(PdfReadError);
  });
});

const good = `Lakeside Regional Medical Center
ITEMIZED STATEMENT
Invoice Number: LR-1
Patient Maya Ortiz Invoice Number LR-1
Service Date September 14, 2026
ITEMIZED CHARGES
# DESCRIPTION CODE AMOUNT
1 Emergency room 99284 $1,050.00
2 Wrist X-ray — $380.00
Insurance adjustments $0.00
Patient responsibility $1,430.00
Total charges $1,430.00`;

describe("parsePdfBill on malformed input", () => {
  it("parses a minimal well-formed statement and tolerates reflowed whitespace", () => {
    expect(parsePdfBill(good).items).toHaveLength(2);
    expect(parsePdfBill(good.replace(/\n/g, "\r\n").replace(/ {1}/g, "  ")).total).toBe(1430);
  });

  it.each([
    ["empty text", ""],
    ["no invoice number", good.replace(/Invoice Number[^\n]*\n/g, "")],
    ["bad service date", good.replace("September 14, 2026", "Septober 40, 2026")],
    ["impossible calendar date", good.replace("September 14, 2026", "February 30, 2026")],
    ["missing total", good.replace(/Total charges.*$/m, "")],
    ["total does not equal the charges", good.replace("Total charges $1,430.00", "Total charges $1,500.00")],
    ["no charge rows", good.replace(/^[12] .*$/gm, "")],
    ["only a heading", "ITEMIZED STATEMENT"]
  ])("fails visibly on %s", (_name, text) => {
    expect(() => parsePdfBill(text)).toThrow(BillParseError);
  });

  it("parses dates strictly", () => {
    expect(longDateToIso("September 6, 2026")).toBe("2026-09-06");
    expect(longDateToIso("Sep 6 2026")).toBe("2026-09-06");
    expect(longDateToIso("2026-09-06")).toBeNull();
  });
});
