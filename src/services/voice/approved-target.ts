const E164 = /^\+[1-9]\d{7,14}$/;

export interface VoiceTarget {
  providerName: string;
  phone: string;
}

/** Only the approved synthetic hospital phone may be dialed in this demo. */
export function approvedVoiceTarget(providerName: string, env: Record<string, string | undefined> = process.env): VoiceTarget {
  if (providerName !== "University Hospital") throw new Error("Voice calls are limited to the approved University Hospital demo target");
  const phone = env.DEMO_HOSPITAL_PHONE ?? "";
  if (!E164.test(phone)) throw new Error("DEMO_HOSPITAL_PHONE must be an E.164 number");
  return { providerName, phone };
}
