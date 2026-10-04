import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createCase, investigateCase } from "../../services/agent/orchestrator";
import { MockCommunicationProvider } from "../../services/communications/mock";
import { DemoMedicalProvider, FinchNodeDemoProvider } from "../../services/medical/finchnode-demo";
import { savedSnapshot } from "../../services/medical/finchnode-fixtures";
import { scenarios } from "../../services/scenarios";
import { CallStatusLines } from "./CallingBilling";
import { RecordsPanel } from "./RecordsPanel";

const serving = () => vi.fn<typeof fetch>(async () => new Response(JSON.stringify(savedSnapshot("patient-demo-pediatric-asthma"))));
const pulled = (fetcher: typeof fetch) => investigateCase(createCase(scenarios[2].transaction), new DemoMedicalProvider(new FinchNodeDemoProvider(fetcher, undefined, () => new Date("2026-10-04T12:00:00Z"))), new MockCommunicationProvider(Number.POSITIVE_INFINITY));

describe("records panel", () => {
  it("shows what was pulled per category, the organization, subject, and the live label", async () => {
    const html = renderToStaticMarkup(createElement(RecordsPanel, { caseData: await pulled(serving()) }));
    expect(html).toContain("Records retrieved live from FinchNode public demo API (synthetic patient)");
    expect(html).toContain("Subject patient-demo-pediatric-asthma");
    expect(html).toContain("Northstar Health System");
    expect(html).toContain("Retrieved 2026-10-04 12:00:00 UTC");
    for (const heading of ["Encounters", "Medications on record", "Vital signs"]) expect(html).toContain(heading);
    expect(html).toContain("Asthma follow-up");
    expect(html).toContain("<b>1</b> encounter");
    expect(html).not.toContain("Saved copy");
  });

  it("says the saved copy was used, and never says live, when FinchNode could not be reached", async () => {
    const html = renderToStaticMarkup(createElement(RecordsPanel, { caseData: await pulled(vi.fn<typeof fetch>(async () => { throw new TypeError("fetch failed"); })) }));
    expect(html).toContain("FinchNode unreachable - using the saved copy of this synthetic patient");
    expect(html).toContain("Saved copy read 2026-10-04 12:00:00 UTC");
    expect(html).toContain("Live pull failed (fetch failed)");
    expect(html).not.toMatch(/retrieved live/i);
  });

  it("shows the waiting-screen status line with a record count", async () => {
    const html = renderToStaticMarkup(createElement(CallStatusLines, { caseData: await pulled(serving()) }));
    expect(html).toContain("Medical records retrieved (5 for this visit)");
    expect(html).not.toContain("accident");
  });
});
