"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MedicalBillCase } from "@/types/domain";

const MAX_POLL_FAILURES = 5;

export function useCaseSession(id: string) {
  const [caseData, setCaseData] = useState<MedicalBillCase | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pollStalled, setPollStalled] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const mutation = useRef(false);

  // Ignore a delayed response when a newer text or website action has already updated the case.
  const acceptCase = useCallback((incoming: MedicalBillCase) => {
    setCaseData((current) => current?.id === incoming.id && current.updatedAt > incoming.updatedAt ? current : incoming);
  }, []);

  const load = useCallback(async () => {
    const response = await fetch(`/api/cases/${id}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Case not found");
    acceptCase(await response.json());
  }, [id, acceptCase]);

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Case not found")); }, [load]);

  // Keep paused approvals and completed cases fresh too: a text reply may change any state.
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending || mutation.current) return;
      pending = true;
      try {
        const response = await fetch(`/api/cases/${id}`, { cache: "no-store" });
        if (!response.ok) return;
        const incoming: MedicalBillCase = await response.json();
        const activeResponse = await fetch("/api/active-case", { cache: "no-store" });
        const active: MedicalBillCase | null = activeResponse.ok ? await activeResponse.json() : null;
        if (!cancelled && active && active.id !== id) { window.location.replace("/"); return; }
        if (!cancelled && !mutation.current) acceptCase(incoming);
      } catch { /* Existing case remains visible; retry on the next tick. */ }
      finally { pending = false; }
    };
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [id, acceptCase]);

  // While the agent is reading a texted PDF, only re-read the case (no analyze mutation) so each saved step shows up quickly.
  const reading = caseData?.status === "WAITING_FOR_BILL" && Boolean(caseData.reading && !caseData.reading.done);
  useEffect(() => {
    if (!reading) return;
    let cancelled = false;
    const timer = window.setInterval(() => { void fetch(`/api/cases/${id}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (!cancelled && data) acceptCase(data); }).catch(() => undefined); }, 800);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [reading, id]);

  useEffect(() => {
    if (caseData?.status !== "WAITING_FOR_BILL" || pollStalled || reading) return;
    let cancelled = false;
    let failures = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/cases/${id}/analyze`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Bill analysis failed");
        if (cancelled) return;
        failures = 0;
        setError("");
        acceptCase(data);
      } catch (cause) {
        if (cancelled) return;
        failures += 1;
        setError(cause instanceof Error ? cause.message : "Bill analysis failed");
        if (failures >= MAX_POLL_FAILURES) setPollStalled(true);
      }
    };
    const timer = window.setInterval(() => void poll(), 900);
    void poll();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [caseData?.status, id, pollStalled, pollAttempt, reading]);

  // While the live review call is in progress, ask the server to read its transcript; it records the outcome once the call ends.
  useEffect(() => {
    if (caseData?.status !== "WAITING_FOR_PROVIDER") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/cases/${id}/settle-review`, { method: "POST" });
        const data = await response.json();
        if (cancelled) return;
        if (response.ok || response.status === 202) { setError(""); acceptCase(data); }
      } catch { /* the next tick asks again */ }
    };
    const timer = window.setInterval(() => void poll(), 1500);
    void poll();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [caseData?.status, id]);

  const retryPoll = useCallback(() => { setError(""); setPollStalled(false); setPollAttempt((attempt) => attempt + 1); }, []);

  const action = useCallback(async (path: string, body: object = {}) => {
    if (mutation.current) return null;
    mutation.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/cases/${id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) {
        await load().catch(() => undefined);
        throw new Error(data.error || "The action could not be completed");
      }
      acceptCase(data);
      return data as MedicalBillCase;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action failed");
      return null;
    } finally { mutation.current = false; setBusy(false); }
  }, [id, load]);

  return { caseData, busy, error, setError, action, reload: load, pollStalled, retryPoll };
}
