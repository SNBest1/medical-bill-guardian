"use client";
import { useEffect, useState } from "react";
export function PatientTextStatus({ id }: { id: string }) {
  const [state, setState] = useState<{ enabled: boolean; status: string | null } | null>(null);
  useEffect(() => {
    let stopped = false;
    const refresh = async () => { try { const r = await fetch(`/api/cases/${id}/text-status`, { cache: "no-store" }); if (r.ok && !stopped) setState(await r.json()); } catch {} };
    void refresh(); const timer = setInterval(() => void refresh(), 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [id]);
  if (!state) return null;
  const message = !state.enabled ? "Patient text updates are disabled." : state.status === "FAILED" ? "Patient update failed to send. Retrying automatically; the case is saved." : state.status === "UNCERTAIN" ? "Patient text acceptance is unconfirmed. Check Spectrum before resending." : state.status === "ACCEPTED" ? "Patient update accepted by Photon · delivery unconfirmed." : state.status ? "Patient update queued." : null;
  return message ? <p className="gx-disclosure" role="status">{message}</p> : null;
}
