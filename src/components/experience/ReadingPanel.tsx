"use client";

import { useEffect, useRef } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import type { BillReading, ReadingStep } from "@/types/domain";

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const offset = (reading: BillReading, step: ReadingStep) => `+${((Date.parse(step.at) - Date.parse(reading.startedAt)) / 1000).toFixed(1)}s`;

/** Live log of what the agent actually did while reading the texted PDF; the newest step is highlighted while reading continues. */
export function ReadingPanel({ reading, compact = false }: { reading: BillReading; compact?: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  const live = !reading.done;
  useEffect(() => {
    const element = list.current;
    if (!element || compact) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ top: element.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [reading.steps.length, compact]);
  return <section className={`gx-read ${compact ? "compact" : ""}`} aria-label="Reading the bill">
    <header><span className="gx-kicker">READING THE BILL</span><b className={live ? "live" : reading.failed ? "failed" : "done"}>{live ? "Reading now" : reading.failed ? "Stopped" : "Finished"}</b></header>
    <ol ref={list} aria-live="polite">
      {reading.steps.map((step, index) => {
        const current = live && index === reading.steps.length - 1;
        const tone = step.status ?? "ok";
        return <li key={step.id} className={`${tone} ${current ? "current" : ""}`}>
          <span className="gx-read-icon">{tone === "fail" ? <X size={12}/> : tone === "review" ? <CircleAlert size={12}/> : <Check size={12}/>}</span>
          <div><p>{step.text}</p>{step.detail && <small>{step.detail}</small>}</div>
          <time>{offset(reading, step)}</time>
        </li>;
      })}
      {live && <li className="pending" aria-hidden="true"><span className="gx-read-icon"><i/></span><div><p>Reading…</p></div></li>}
    </ol>
  </section>;
}

/** Paper-style view of the charges as each one is read and checked: green when records support it, amber when billing will be asked. */
export function BillScan({ reading }: { reading: BillReading }) {
  const text = (kind: ReadingStep["kind"]) => reading.steps.find((step) => step.kind === kind)?.text;
  const charges = reading.steps.filter((step) => step.kind === "charge" && step.item);
  const total = reading.steps.find((step) => step.kind === "total")?.text.replace(/ = sum of charges$/, "").replace(/^Total /, "");
  return <div className="gx-scan" aria-label="Bill being read">
    <div className={`gx-scan-paper ${reading.done ? "" : "live"}`}>
      {!reading.done && <span className="gx-scan-line" aria-hidden="true"/>}
      <h2>{text("provider")?.replace(/^Provider: /, "") ?? "Hospital statement"}</h2>
      <p>{text("invoice")?.replace(/^Found /, "") ?? "Locating invoice…"}{text("patient") ? ` · ${text("patient")!.replace(/^Patient: /, "")}` : ""}</p>
      <ul>
        {charges.map((step) => <li key={step.id} className={step.status === "review" ? "review" : "ok"}><span className="gx-scan-mark">{step.status === "review" ? <CircleAlert size={13}/> : <Check size={13}/>}</span><strong>{step.item!.description}</strong><b>{money(step.item!.amount)}</b></li>)}
        {!reading.done && !total && <li className="ghost" aria-hidden="true"><span/><strong/><b/></li>}
      </ul>
      {total && <footer><span>Total</span><strong>{total}</strong></footer>}
    </div>
  </div>;
}
