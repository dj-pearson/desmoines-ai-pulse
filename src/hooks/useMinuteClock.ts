import { useMemo, useSyncExternalStore } from "react";

/**
 * The current time, re-rendering once a minute on the minute.
 *
 * For open/closed badges: a card that memoized its status on the hours text
 * alone would say "Open" at 10:05 PM to anyone who loaded the page at 9:55.
 *
 * One timer is shared by every subscriber, so thirty cards on a page cost one
 * setTimeout, not thirty. It also refreshes when the tab becomes visible,
 * because browsers throttle timers in background tabs.
 */

const listeners = new Set<() => void>();
let current = floorToMinute(Date.now());
let timer: ReturnType<typeof setTimeout> | null = null;

function floorToMinute(ms: number): number {
  return ms - (ms % 60_000);
}

function tick(): void {
  const next = floorToMinute(Date.now());
  if (next !== current) {
    current = next;
    listeners.forEach((l) => l());
  }
}

function schedule(): void {
  const delay = 60_000 - (Date.now() % 60_000) + 50;
  timer = setTimeout(() => {
    tick();
    schedule();
  }, delay);
}

function onVisibility(): void {
  if (document.visibilityState === "visible") tick();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    tick();
    schedule();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

function getSnapshot(): number {
  return current;
}

/** Now, floored to the minute. A new Date only when the minute changes. */
export function useMinuteClock(): Date {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => new Date(ms), [ms]);
}
