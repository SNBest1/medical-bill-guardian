"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Pause, Play, Volume2, X } from "lucide-react";
import { billingReviewCall, insuredBillingReviewCall } from "@/services/communications/demo-call";
import type { MedicalBillCase } from "@/types/domain";

export function ReviewConversation({ caseData, busy, onCancel, onSave }: { caseData: MedicalBillCase; busy: boolean; onCancel: () => void; onSave: () => Promise<void> }) {
  const turns = caseData.insurance?.coverage === "INSURED" ? insuredBillingReviewCall : billingReviewCall;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; window.speechSynthesis?.cancel(); }, []);

  function stop() { generation.current += 1; window.speechSynthesis?.cancel(); setPlaying(false); }
  function play(position = index) {
    stop(); setPlaying(true); const token = generation.current;
    const next = (current: number) => {
      if (token !== generation.current) return;
      if (current >= turns.length) { setIndex(turns.length); setPlaying(false); return; }
      setIndex(current);
      if (!("speechSynthesis" in window)) { setPlaying(false); return; }
      const line = new SpeechSynthesisUtterance(turns[current].text);
      line.rate = 1.08; line.pitch = turns[current].speaker === "Guardian" ? .94 : 1.08;
      line.onend = () => next(current + 1); line.onerror = () => setPlaying(false);
      window.speechSynthesis.speak(line);
    };
    next(position);
  }

  const current = turns[Math.min(index, turns.length - 1)];
  const finished = index >= turns.length;
  return <section className="gx-conversation" aria-label="Billing conversation">
    <div className="gx-call-bar"><span><Volume2 size={16}/> Billing call · scripted demo</span><button onClick={() => { stop(); onCancel(); }} aria-label="Close call"><X size={18}/></button></div>
    <div className="gx-speakers"><span className={current?.speaker === "Guardian" && !finished ? "active" : ""}>Guardian</span><i/><span className={current?.speaker === "Billing representative" && !finished ? "active" : ""}>Hospital billing</span></div>
    <div className="gx-current-line">
      <small>{finished ? "Conversation complete" : `${current.speaker} · ${index + 1} of ${turns.length}`}</small>
      <p>{finished ? "The scripted provider response is ready to save to this case." : current.text}</p>
    </div>
    <details className="gx-transcript"><summary>Read complete transcript</summary>{turns.map((turn, turnIndex) => <p key={turnIndex}><strong>{turn.speaker}:</strong> {turn.text}</p>)}</details>
    <div className="gx-call-actions">
      {!finished && <button className="gx-call-play" onClick={() => playing ? stop() : play()}>{playing ? <Pause size={17}/> : <Play size={17}/>} {playing ? "Pause" : index ? "Resume" : "Play call"}</button>}
      {!finished && <button className="gx-read-next" onClick={() => { stop(); setIndex((value) => Math.min(value + 1, turns.length)); }}>Read next <ArrowRight size={15}/></button>}
      {finished && <button className="gx-save-outcome" disabled={busy} onClick={() => void onSave()}>{busy ? "Saving confirmation…" : "Save confirmed outcome"}<ArrowRight size={17}/></button>}
    </div>
  </section>;
}
