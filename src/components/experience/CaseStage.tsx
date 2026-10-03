"use client";

import { useEffect, useRef, useState } from "react";
import { FileCheck2, FileQuestion, ReceiptText } from "lucide-react";
import { animate } from "animejs";
import * as THREE from "three";
import type { MedicalBillCase } from "@/types/domain";
import type { ExperienceBeat } from "./view-model";

const money = (value: number) => `$${value.toLocaleString()}`;

function makeDocumentTexture(caseData: MedicalBillCase, mode: "bill" | "correction") {
  const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 1180;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#F2F4F5"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#182631"; context.font = "700 31px Arial"; context.fillText("UNIVERSITY HOSPITAL", 64, 82);
  context.fillStyle = "#6B7A86"; context.font = "21px monospace"; context.fillText(mode === "bill" ? "ITEMIZED STATEMENT · UH-48291" : "WRITTEN CORRECTION · UH-48291", 64, 124);
  context.strokeStyle = "#C8D0D5"; context.beginPath(); context.moveTo(64, 160); context.lineTo(836, 160); context.stroke();
  const items = caseData.bill?.items ?? [];
  items.forEach((item, index) => {
    const y = 245 + index * 105;
    context.fillStyle = "#182631"; context.font = "600 25px Arial"; context.fillText(item.description, 64, y);
    context.textAlign = "right"; context.font = "700 27px Arial";
    context.fillStyle = mode === "correction" && item.description === "Specialist consultation" ? "#A55769" : "#182631";
    context.fillText(mode === "correction" && item.description === "Specialist consultation" ? "REMOVED" : money(item.amount), 836, y);
    context.textAlign = "left"; context.strokeStyle = "#D6DDE1"; context.beginPath(); context.moveTo(64, y + 30); context.lineTo(836, y + 30); context.stroke();
  });
  const total = mode === "correction" ? caseData.resolution?.correctedTotal ?? caseData.transaction.amount : caseData.transaction.amount;
  context.fillStyle = "#182631"; context.font = "700 24px Arial"; context.fillText(mode === "correction" ? "CORRECTED TOTAL" : "PAID TOTAL", 64, 1020);
  context.textAlign = "right"; context.font = "800 58px Arial"; context.fillText(money(total), 836, 1038);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

export function CaseStage({ caseData, beat, selectedId }: { caseData: MedicalBillCase; beat: ExperienceBeat; selectedId: string | null }) {
  const mount = useRef<HTMLDivElement>(null);
  const [webgl, setWebgl] = useState(true);
  useEffect(() => {
    const host = mount.current; if (!host) return;
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedQuery.matches) { setWebgl(false); return; }
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
    catch { setWebgl(false); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); renderer.setClearColor(0, 0); host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(38, 1, .1, 50); camera.position.set(0, .1, 9.2);
    scene.add(new THREE.HemisphereLight(0xe8f1f5, 0x1a2732, 2.3)); const key = new THREE.DirectionalLight(0xffffff, 4.4); key.position.set(-3, 5, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0xd7a5b0, 3.4); rim.position.set(5, 0, 3); scene.add(rim);
    const group = new THREE.Group(); scene.add(group); const disposables: Array<{ dispose: () => void }> = [];
    const texture = makeDocumentTexture(caseData, beat === "outcome" ? "correction" : "bill"); disposables.push(texture);
    const geometry = new THREE.BoxGeometry(4.35, 5.7, .07, 18, 22, 1); disposables.push(geometry);
    const edge = new THREE.MeshStandardMaterial({ color: 0xc3ccd3, roughness: .5 });
    const face = new THREE.MeshStandardMaterial({ map: texture, roughness: .55 }); disposables.push(edge, face);
    const paper = new THREE.Mesh(geometry, [edge, edge, edge, edge, face, edge]); group.add(paper);
    const stripGeometry = new THREE.BoxGeometry(.09, .48, .1); disposables.push(stripGeometry);
    (caseData.bill?.items ?? []).forEach((item, index) => {
      const attention = item.id === selectedId;
      const material = new THREE.MeshStandardMaterial({ color: 0xd7a5b0, metalness: .05, roughness: .6, transparent: true, opacity: attention ? 1 : 0 }); disposables.push(material);
      const strip = new THREE.Mesh(stripGeometry, material); strip.position.set(-2.08, 1.55 - index * .65, .08); paper.add(strip);
    });
    const ringGeometry = new THREE.TorusGeometry(3.2, .011, 6, 120); disposables.push(ringGeometry);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x60798c, transparent: true, opacity: .45 }); disposables.push(ringMaterial);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.rotation.set(.7, .25, 0); scene.add(ring);
    const target = beat === "evidence" || beat === "conversation" ? { x: .8, y: .05, z: 0, ry: -.12, rz: 0 } : beat === "outcome" ? { x: .55, y: .05, z: 0, ry: .12, rz: -.025 } : { x: .45, y: .05, z: 0, ry: -.32, rz: -.08 };
    group.position.set(target.x, target.y, target.z); group.rotation.set(-.05, target.ry, target.rz);
    animate(group.rotation, { y: [target.ry - .08, target.ry], z: [target.rz - .025, target.rz], duration: 850, ease: "outExpo" });
    let frame = 0; let visible = true;
    const render = () => { frame = 0; if (visible) renderer.render(scene, camera); };
    const resize = () => { const width = host.clientWidth, height = host.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); render(); };
    const observer = new ResizeObserver(resize); observer.observe(host);
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible && !frame) frame = requestAnimationFrame(render); }); visibility.observe(host);
    const lost = (event: Event) => { event.preventDefault(); setWebgl(false); };
    renderer.domElement.addEventListener("webglcontextlost", lost); resize();
    return () => { observer.disconnect(); visibility.disconnect(); cancelAnimationFrame(frame); renderer.domElement.removeEventListener("webglcontextlost", lost); disposables.forEach((item) => item.dispose()); renderer.dispose(); renderer.domElement.remove(); };
  }, [beat, caseData, selectedId]);

  return <div className="gx-stage" aria-label="Visual model of the current bill review">
    <div className="gx-stage-light" aria-hidden="true"/>
    {webgl && <div className="gx-stage-canvas" ref={mount} aria-hidden="true"/>}
    {!webgl && <div className="gx-stage-fallback"><ReceiptText size={48}/><strong>{money(caseData.resolution?.correctedTotal ?? caseData.transaction.amount)}</strong><span>{beat === "outcome" ? "Corrected statement" : "University Hospital statement"}</span></div>}
    <div className="gx-stage-label">{beat === "outcome" ? <FileCheck2 size={15}/> : beat === "evidence" || beat === "conversation" ? <FileQuestion size={15}/> : <ReceiptText size={15}/>}<span>{beat === "outcome" ? "Provider-confirmed correction" : beat === "evidence" || beat === "conversation" ? "Evidence review" : "Paid hospital bill"}</span></div>
  </div>;
}
