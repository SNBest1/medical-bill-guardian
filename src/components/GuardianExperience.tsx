"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, FileText, ShieldCheck } from "lucide-react";
import { createTimeline } from "animejs";
import * as THREE from "three";

export function GuardianExperience({ caseId, busy, onScan }: { caseId?: string; busy: boolean; onScan: () => void }) {
  const root = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const container = viewport.current;
    const section = root.current;
    if (!container || !section) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
    catch { return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
    camera.position.set(0, 0, 10);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setClearColor(0, 0);
    container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xcbdde7, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 5); key.position.set(-3, 5, 7); scene.add(key);
    const rim = new THREE.DirectionalLight(0xcaa4ad, 3); rim.position.set(4, -1, 2); scene.add(rim);
    const group = new THREE.Group(); scene.add(group);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    function sheet(index: number) {
      const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 1024;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = index === 2 ? "#efe0e4" : "#edf2f6"; ctx.fillRect(0, 0, 768, 1024);
      ctx.fillStyle = "#293b4f"; ctx.font = "bold 30px Arial";
      ctx.fillText(["UNIVERSITY HOSPITAL", "CLINICAL RECORD", "CHARGE TO VERIFY"][index], 58, 90);
      ctx.fillStyle = "#73828f"; ctx.font = "20px Arial"; ctx.fillText("SYNTHETIC DEMO / SEPT 28, 2026", 58, 130);
      ctx.fillStyle = "#293b4f"; ctx.font = "bold 76px Arial";
      ctx.fillText(["$4,820", "ER encounter", "$700"][index], 58, 250);
      const rows = index === 0 ? ["Emergency room", "Lab work", "CT imaging", "IV medication", "Facility services", "Specialist consultation"] : index === 1 ? ["Encounter documented", "Labs documented", "Imaging documented", "Medication documented", "Facility documented"] : ["Specialist consultation", "No matching encounter", "Ask billing to verify", "Approval required"];
      rows.forEach((row, i) => { ctx.fillStyle = "#6c7c8d"; ctx.font = "24px Arial"; ctx.fillText(row, 58, 365 + i * 80); ctx.fillStyle = "#cbd4db"; ctx.fillRect(58, 386 + i * 80, 650, 2); });
      ctx.fillStyle = "#293b4f"; ctx.font = "bold 21px Arial"; ctx.fillText("MEDICAL BILL GUARDIAN", 58, 950);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
      const geometry = new THREE.BoxGeometry(2.7, 3.6, .055); geometries.push(geometry);
      const edge = new THREE.MeshStandardMaterial({ color: 0xc0cad4, roughness: .3, metalness: .4 });
      const front = new THREE.MeshStandardMaterial({ map: texture, roughness: .5, metalness: .05 }); materials.push(edge, front);
      const mesh = new THREE.Mesh(geometry, [edge, edge, edge, edge, front, edge]);
      mesh.position.set(index * .07, index * .1, -index * .12); group.add(mesh); return mesh;
    }
    const sheets = [0, 1, 2].map(sheet);
    const shieldShape = new THREE.Shape(); shieldShape.moveTo(0, 1.6); shieldShape.lineTo(1.2, 1.1); shieldShape.lineTo(1.1, -.35); shieldShape.quadraticCurveTo(.8, -1.1, 0, -1.6); shieldShape.quadraticCurveTo(-.8, -1.1, -1.1, -.35); shieldShape.lineTo(-1.2, 1.1); shieldShape.closePath();
    const shieldGeometry = new THREE.ExtrudeGeometry(shieldShape, { depth: .18, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: .08, bevelThickness: .08 }); geometries.push(shieldGeometry);
    const shieldMaterial = new THREE.MeshStandardMaterial({ color: 0xd9b6bf, metalness: .85, roughness: .23 }); materials.push(shieldMaterial);
    const shield = new THREE.Mesh(shieldGeometry, shieldMaterial); shield.position.z = 1; shield.scale.setScalar(.001); group.add(shield);
    const ringGeometry = new THREE.TorusGeometry(2.65, .012, 8, 100); geometries.push(ringGeometry);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x7b8f9f, transparent: true, opacity: .35 }); materials.push(ringMaterial);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.rotation.x = .6; ring.rotation.y = .3; scene.add(ring);
    group.rotation.set(-.1, -.35, -.12);
    const timeline = createTimeline({ autoplay: false, defaults: { ease: "inOutQuad" } });
    timeline.add(sheets[0].position, { x: -1.1, y: .35, z: .25, duration: 1000 }, 0)
      .add(sheets[1].position, { x: .5, y: .65, z: -.45, duration: 1000 }, 0)
      .add(sheets[2].position, { x: 1.25, y: -.7, z: .9, duration: 1000 }, 0)
      .add(group.rotation, { y: .25, z: .06, duration: 1000 }, 0)
      .add(sheets[2].rotation, { z: -.16, duration: 1000 }, 0)
      .add(sheets[0].position, { x: -.7, y: .1, z: -1, duration: 1000 }, 1100)
      .add(sheets[1].position, { x: -.5, y: .2, z: -1.2, duration: 1000 }, 1100)
      .add(sheets[2].position, { x: -.3, y: .3, z: -1.4, duration: 1000 }, 1100)
      .add(shield.scale, { x: 1, y: 1, z: 1, duration: 1000 }, 1100)
      .add(group.rotation, { y: -.2, z: -.04, duration: 1000 }, 1100);
    let frame = 0, target = 0, progress = 0, lost = false;
    function resize() { const width = container!.clientWidth, height = container!.clientHeight; renderer.setSize(width, height); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); draw(); }
    function draw() { if (!lost) renderer.render(scene, camera); }
    function update() {
      frame = 0;
      progress += (target - progress) * .13;
      if (Math.abs(target - progress) < .0005) progress = target;
      timeline.seek(progress * timeline.duration);
      ring.rotation.z = progress * .8;
      section!.style.setProperty("--journey-progress", String(progress));
      draw();
      if (Math.abs(target - progress) > .0005) frame = requestAnimationFrame(update);
    }
    function scroll() { if (reduced.matches) return; const rect = section!.getBoundingClientRect(); target = Math.max(0, Math.min(1, -rect.top / Math.max(1, section!.offsetHeight - window.innerHeight))); if (!frame) frame = requestAnimationFrame(update); }
    function preference() { cancelAnimationFrame(frame); frame = 0; if (reduced.matches) { timeline.seek(0); draw(); } else scroll(); }
    function contextLost(event: Event) { event.preventDefault(); lost = true; setReady(false); cancelAnimationFrame(frame); }
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    const observer = new ResizeObserver(resize); observer.observe(container);
    window.addEventListener("scroll", scroll, { passive: true }); reduced.addEventListener("change", preference);
    resize(); scroll(); setReady(true);
    return () => { observer.disconnect(); window.removeEventListener("scroll", scroll); reduced.removeEventListener("change", preference); renderer.domElement.removeEventListener("webglcontextlost", contextLost); cancelAnimationFrame(frame); timeline.revert(); textures.forEach(t=>t.dispose()); geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); renderer.dispose(); renderer.domElement.remove(); };
  }, []);
  return <section className="guardian-cinema" ref={root} aria-label="From a confusing bill to a clear answer">
    <div className="cinema-stage" aria-hidden="true"><div className={`cinema-art ${ready ? "is-ready" : ""}`}><div className="cinema-halo"/><div className="cinema-fallback"><FileText size={70}/><strong>$4,820</strong><span>A bill worth understanding</span></div><div className="cinema-canvas" ref={viewport}/><span className="cinema-caption">PAYMENT · RECORDS · EVIDENCE</span></div><div className="cinema-progress"><span/></div></div>
    <div className="cinema-chapters">
      <article className="cinema-chapter"><div className="cinema-copy"><span className="cinema-eyebrow">ON YOUR SIDE. AFTER YOUR CARE.</span><h1>Less bill stress.<br/><em>More life.</em></h1><p>Getting better is hard enough. Guardian helps you understand your hospital bill and follow through on questions worth asking.</p><div className="cinema-actions">{caseId ? <Link className="cinema-cta" href={`/cases/${caseId}`}>Try the demo <ArrowRight size={20}/></Link> : <button className="cinema-cta" onClick={onScan} disabled={busy}>{busy ? "Finding your bill…" : "Try the demo"}<ArrowRight size={20}/></button>}<a href="#evidence-chapter" className="cinema-secondary">Follow the evidence <ArrowDown size={16}/></a></div></div></article>
      <article className="cinema-chapter" id="evidence-chapter"><div className="cinema-copy"><span className="chapter-index">01 / UNDERSTAND</span><h2>A bill tells<br/>half the story.</h2><p>We bring the payment, itemized bill, and available medical records together. Every question has evidence you can inspect.</p><div className="cinema-proof"><FileText size={18}/><span>Demo: $700 specialist charge needs clarification.</span></div><small>A missing record doesn’t prove a billing error.</small></div></article>
      <article className="cinema-chapter"><div className="cinema-copy"><span className="chapter-index">02 / FOLLOW THROUGH</span><h2>An answer.<br/><em>Not another chore.</em></h2><p>You approve the billing review. In our synthetic demo, billing confirms a duplicate charge. Guardian tracks the correction and refund separately.</p><div className="cinema-settlement"><span>$4,820</span><ArrowRight size={22}/><strong>$4,120</strong></div><div className="cinema-proof"><ShieldCheck size={18}/><span>$700 corrected in the demo. Refund tracked next.</span></div><small>Simulated provider, synthetic patient. No real money moves.</small></div></article>
    </div>
  </section>;
}
