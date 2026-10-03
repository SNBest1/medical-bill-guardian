"use client";

import { useEffect, useRef, useState } from "react";
import type { CallTurn } from "@/services/communications/demo-call";

export function VoiceCall({ turns, title, onComplete, onCancel }: { turns: CallTurn[]; title: string; onComplete: () => void; onCancel: () => void }) {
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const mounted = useRef(true);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; if (watchdog.current) clearTimeout(watchdog.current); if ("speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);

  function stop() {
    generation.current++;
    if (watchdog.current) clearTimeout(watchdog.current);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function play(from: number) {
    stop(); setStarted(true); setError(""); setIndex(from);
    if (!("speechSynthesis" in window)) { setError("Voice playback is unavailable. Read the transcript and use Next turn to continue."); return; }
    const token = generation.current;
    const speak = (position: number) => {
      if (!mounted.current || token !== generation.current) return;
      setIndex(position);
      if (position === turns.length) return;
      const turn = turns[position];
      const utterance = new SpeechSynthesisUtterance(turn.text);
      const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith("en"));
      utterance.voice = voices[turn.speaker === "Guardian" ? 0 : 1] ?? voices[0] ?? null;
      utterance.rate = 1.08;
      utterance.pitch = turn.speaker === "Guardian" ? 0.95 : 1.15;
      utterance.onend = () => { if (watchdog.current) clearTimeout(watchdog.current); speak(position + 1); };
      utterance.onerror = () => { if (token === generation.current && mounted.current) { if (watchdog.current) clearTimeout(watchdog.current); setError("Voice playback stopped. Use Next turn, replay, or wrap up the scripted demo."); } };
      watchdog.current = setTimeout(() => { if (token === generation.current && mounted.current) { stop(); setError("Playback timed out. Continue with the transcript or wrap up the scripted demo."); } }, 30000);
      window.speechSynthesis.speak(utterance);
    };
    speak(from);
  }

  const finished = index >= turns.length;
  return <section className="voice-panel" aria-label={title}>
    <div className="voice-heading"><div><span className="section-kicker">SIMULATED VOICE CALL</span><h2>{title}</h2></div><span className="demo-pill">Fictional billing desk</span></div>
    <p className="voice-disclosure">Browser speech plays both scripted roles. No hospital is dialed and no patient data is transmitted by this app for the call. Available voices depend on your browser.</p>
    <div className="voice-transcript">{turns.map((turn, position) => <div key={position} className={`voice-turn ${position === index && started ? "speaking" : ""}`}><strong>{turn.speaker}</strong><p>{turn.text}</p></div>)}</div>
    <p role="status" aria-live="polite">{finished ? "Script complete. Save the demo outcome to continue." : started ? `${turns[index].speaker} · turn ${index + 1} of ${turns.length}` : "Ready to play the scripted call."}</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="voice-controls"><button className="primary-button" onClick={() => play(0)}>{started ? "Replay call" : "Play voice demo"}</button><button className="secondary-button" disabled={finished} onClick={() => { stop(); setStarted(true); setIndex((value) => Math.min(value + 1, turns.length)); }}>Next turn</button><button className="secondary-button" onClick={() => { stop(); setIndex(turns.length); setStarted(true); }}>Wrap up script</button><button className="primary-button" disabled={!finished} onClick={() => { stop(); onComplete(); }}>Save demo outcome</button><button className="replay-button" onClick={() => { stop(); onCancel(); }}>Cancel</button></div>
  </section>;
}
