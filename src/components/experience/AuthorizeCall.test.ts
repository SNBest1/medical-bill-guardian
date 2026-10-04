import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createCase } from "../../services/agent/orchestrator";
import { scenarios } from "../../services/scenario-data";
import { caseViewModel } from "./view-model";
import { AuthorizeCall } from "./AuthorizeCall";

const paused = { ...createCase(scenarios[0].transaction), status: "REQUESTING_BILL" as const, scenarioId: scenarios[0].id };
const render = (props: { busy?: boolean; error?: string }) => renderToStaticMarkup(createElement(AuthorizeCall, { caseData: paused, busy: props.busy ?? false, error: props.error ?? "", onAuthorize: () => undefined }));

describe("hospital call authorization panel", () => {
  it("is shown only at the REQUESTING_BILL checkpoint", () => {
    expect(caseViewModel(paused).awaitingCallAuth).toBe(true);
    expect(caseViewModel({ ...paused, status: "WAITING_FOR_BILL" }).awaitingCallAuth).toBe(false);
    expect(caseViewModel({ ...paused, status: "DETECTED" }).awaitingCallAuth).toBe(false);
  });
  it("names the patient and hospital, warns it is a real call, and keeps the button disabled until the plan is ready", () => {
    const html = render({});
    expect(html).toContain("Maya Ortiz");
    expect(html).toContain(paused.provider.name);
    expect(html).toContain("places a real phone call");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Authorize hospital call/s);
  });
  it("shows the busy label, an accessible alert region, and the safe error text", () => {
    expect(render({ busy: true })).toContain("Calling hospital…");
    expect(render({ busy: true })).toContain('aria-busy="true"');
    const html = render({ error: "Fish Audio rejected the API key." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Fish Audio rejected the API key.");
  });
});
