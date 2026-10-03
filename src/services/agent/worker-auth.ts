import { timingSafeEqual } from "node:crypto";

/** Dedicated worker token; project/API credentials are never reused for app authentication. */
export function authorizedWorker(request: Request): boolean {
  const token = process.env.GUARDIAN_WORKER_TOKEN;
  if (!token || token.length < 32) return false;
  const received = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  return Buffer.byteLength(received) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
