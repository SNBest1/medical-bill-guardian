import type { MedicalBillCase } from "../../types/domain";

type ResponseBody = { output?: Array<{ type: string; name?: string; call_id?: string; arguments?: string; content?: Array<{ type: string; text?: string }> }> };

/** Lets an optional model rewrite verified case facts without granting it external actions. */
export async function generateCaseSummary(caseData: MedicalBillCase, fallback: string, apiKey?: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!apiKey) return fallback;
  const facts = {
    provider: caseData.provider.name,
    originalTotal: caseData.resolution?.originalTotal ?? caseData.bill?.total,
    correctedTotal: caseData.resolution?.correctedTotal ?? caseData.bill?.total,
    adjustment: caseData.resolution?.adjustment ?? 0,
    providerConfirmedOutcome: caseData.resolution?.explanation ?? null,
    refundStatus: caseData.recovery?.status ?? null,
    supportedServices: caseData.findings.filter((finding) => finding.clinicalStatus === "SUPPORTED").map((finding) => finding.description),
    needsReview: caseData.findings.filter((finding) => finding.action === "REQUEST_REVIEW").map((finding) => ({ description: finding.description, amount: finding.amount }))
  };
  const tools = [{ type: "function", name: "get_case_facts", description: "Read the structured, verified facts of this medical bill case. This tool has no side effects.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true }];
  const request = async (input: unknown[]) => {
    const response = await fetcher("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", instructions: "Explain the case to a patient in 2-4 plain sentences. Use the get_case_facts tool. Missing clinical evidence is not proof of an incorrect charge. Only call an error provider-confirmed when the facts say so. Do not invent prices, savings, or medical details.", input, tools, store: false }) });
    if (!response.ok) throw new Error(`OpenAI summary request failed: ${response.status}`);
    return response.json() as Promise<ResponseBody>;
  };
  try {
    const firstInput = [{ role: "user", content: "Summarize this resolved bill review." }];
    const first = await request(firstInput);
    const call = first.output?.find((item) => item.type === "function_call" && item.name === "get_case_facts");
    if (!call?.call_id) return fallback;
    const second = await request([...firstInput, ...first.output!, { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(facts) }]);
    const text = second.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join(" ").trim() ?? "";
    const required = [facts.originalTotal, facts.correctedTotal, facts.adjustment].filter((value): value is number => typeof value === "number").map((value) => `$${value.toLocaleString()}`);
    const allowedNumbers = [facts.originalTotal, facts.correctedTotal, facts.adjustment, ...facts.needsReview.map((item) => item.amount)];
    const mentionedNumbers = [...text.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)].map((match) => Number(match[1].replaceAll(",", "")));
    if (!text || /fraud|scam|criminal/i.test(text) || (facts.refundStatus === "REFUND_PENDING" && /recovered|refunded|money (?:has been |was )?(?:received|returned)|refund (?:has |was )?(?:arrived|received|completed)/i.test(text)) || !required.every((amount) => text.includes(amount)) || mentionedNumbers.some((amount) => !allowedNumbers.includes(amount))) return fallback;
    return text;
  } catch { return fallback; }
}
