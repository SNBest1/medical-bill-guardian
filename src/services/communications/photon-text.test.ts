import { describe, expect, it } from "vitest";
import { photonText, sendPhotonText, PhotonSendUncertainError, type PhotonConnection } from "./photon-text";
import type { MedicalBillCase } from "../../types/domain";

const ENV_KEYS = ["PHOTON_DEMO_TEXTS", "DEMO_HOSPITAL_PHONE", "DEMO_PATIENT_PHONE", "SPECTRUM_PROJECT_ID", "SPECTRUM_PROJECT_SECRET"] as const;

async function withEnv<T>(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => T | Promise<T>): Promise<T> {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) { const value = overrides[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { return await fn(); }
  finally { for (const key of ENV_KEYS) { const value = previous[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

const baseEnv = { PHOTON_DEMO_TEXTS: "true", DEMO_HOSPITAL_PHONE: "+15555550123", DEMO_PATIENT_PHONE: "+15555550124", SPECTRUM_PROJECT_ID: "proj", SPECTRUM_PROJECT_SECRET: "secret" };

describe("photonText templates", () => {
  const waiting = { transaction: { id: "nessie-demo-4820" }, status: "WAITING_FOR_BILL" } as unknown as MedicalBillCase;
  const notified = { transaction: { id: "nessie-demo-4820" }, status: "USER_NOTIFIED", summary: "Corrected total: $4,120.00" } as unknown as MedicalBillCase;

  it("builds fixed templates only for the seeded case and only in its eligible status", () => {
    expect(() => photonText(waiting, "NOTIFY_PATIENT")).toThrow();
    expect(() => photonText(notified, "REQUEST_STATEMENT")).toThrow();
    expect(photonText(waiting, "REQUEST_STATEMENT").text).toContain("Synthetic demo statement");
    expect(photonText(notified, "NOTIFY_PATIENT").text).toContain("Corrected total: $4,120.00");
  });

  it("refuses a case other than the seeded synthetic one, even if otherwise eligible", () => {
    const other = { transaction: { id: "some-other-case" }, status: "WAITING_FOR_BILL" } as unknown as MedicalBillCase;
    expect(() => photonText(other, "REQUEST_STATEMENT")).toThrow();
  });
});

describe("sendPhotonText", () => {
  it("never reaches the SDK when PHOTON_DEMO_TEXTS is off, the recipient is unapproved, or credentials are missing — all safe to retry", async () => {
    await withEnv({ ...baseEnv, PHOTON_DEMO_TEXTS: "false" }, async () => {
      await expect(sendPhotonText("+15555550123", "hi")).rejects.not.toBeInstanceOf(PhotonSendUncertainError);
    });
    await withEnv(baseEnv, async () => {
      await expect(sendPhotonText("+19995550000", "hi")).rejects.not.toBeInstanceOf(PhotonSendUncertainError);
    });
    await withEnv({ ...baseEnv, SPECTRUM_PROJECT_ID: undefined }, async () => {
      await expect(sendPhotonText("+15555550123", "hi")).rejects.not.toBeInstanceOf(PhotonSendUncertainError);
    });
  });

  it("returns the SDK's message id on a confirmed acceptance and always stops the connection", async () => {
    let stopped = false;
    const connect = async (): Promise<PhotonConnection> => ({ send: async () => ({ id: "msg-1" }), stop: async () => { stopped = true; } });
    await withEnv(baseEnv, async () => {
      const id = await sendPhotonText("+15555550123", "hi", connect);
      expect(id).toBe("msg-1");
    });
    expect(stopped).toBe(true);
  });

  it("surfaces an uncertain outcome — never a plain failure — once the SDK call has actually started", async () => {
    let stopped = false;
    const noIdConnect = async (): Promise<PhotonConnection> => ({ send: async () => undefined, stop: async () => { stopped = true; } });
    await withEnv(baseEnv, async () => {
      await expect(sendPhotonText("+15555550123", "hi", noIdConnect)).rejects.toBeInstanceOf(PhotonSendUncertainError);
    });
    expect(stopped).toBe(true);

    stopped = false;
    const throwingConnect = async (): Promise<PhotonConnection> => ({ send: async () => { throw new Error("network blip"); }, stop: async () => { stopped = true; } });
    await withEnv(baseEnv, async () => {
      await expect(sendPhotonText("+15555550123", "hi", throwingConnect)).rejects.toBeInstanceOf(PhotonSendUncertainError);
    });
    expect(stopped).toBe(true);
  });

  it("preserves acceptance and uncertainty when connection cleanup fails", async () => {
    await withEnv(baseEnv, async () => {
      const stop = async () => { throw new Error("cleanup failure"); };
      expect(await sendPhotonText("+15555550123", "hi", async () => ({ send: async () => ({ id: "accepted" }), stop }))).toBe("accepted");
      await expect(sendPhotonText("+15555550123", "hi", async () => ({ send: async () => { throw new Error("send failed"); }, stop }))).rejects.toBeInstanceOf(PhotonSendUncertainError);
    });
  });

  it("treats a failure to even start the connection as a definite, retry-safe failure", async () => {
    const failingConnect = async (): Promise<PhotonConnection> => { throw new Error("could not reach Spectrum Cloud"); };
    await withEnv(baseEnv, async () => {
      await expect(sendPhotonText("+15555550123", "hi", failingConnect)).rejects.not.toBeInstanceOf(PhotonSendUncertainError);
    });
  });
});
