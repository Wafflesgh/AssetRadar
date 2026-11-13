/**
 * idle.ts — Tells when nobody has used the page for 30 minutes (no mouse, touch, scroll or key).
 * The live streams then step back to short polling: on Cloud Run an open stream keeps the server
 * running and billed, so a tab left visible overnight would otherwise cost all night.
 */
export const IDLE_AFTER_MS = 30 * 60_000;

export const isIdleAt = (lastInputAt: number, now: number): boolean => now - lastInputAt >= IDLE_AFTER_MS;

let lastInputAt = Date.now();
let idle = false;
let started = false;
const listeners = new Set<(idle: boolean) => void>();

function setIdle(next: boolean): void {
  if (idle === next) return;
  idle = next;
  for (const l of listeners) l(idle);
}

function start(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const onInput = () => {
    lastInputAt = Date.now();
    setIdle(false);
  };
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, onInput, { passive: true });
  setInterval(() => setIdle(isIdleAt(lastInputAt, Date.now())), 60_000);
}

export function isIdle(): boolean {
  return idle;
}

/** Calls back with true when the page goes idle and false when someone uses it again. */
export function onIdleChange(listener: (idle: boolean) => void): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
