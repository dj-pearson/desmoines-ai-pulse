/**
 * The current time, re-read every `intervalMs` (home pass-2 WP2 item 2).
 *
 * The Tonight rail filters out shows that have started. Without a clock that
 * ticks, a tab left open from 18:00 would still list the 19:00 show at 21:45,
 * because nothing re-rendered the memo that reads `new Date()`.
 *
 * The interval is paused while the tab is hidden (a background tab has nobody
 * to show the change to), and the time is re-read the moment the tab becomes
 * visible again, so a returning visitor never sees a stale list for up to a
 * whole interval. The interval is cleared on unmount.
 */
import { useEffect, useState } from "react";

function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

export function useNow(intervalMs: number = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => setNow(new Date()), intervalMs);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (isHidden()) {
        stop();
      } else {
        setNow(new Date());
        start();
      }
    };

    if (!isHidden()) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);

  return now;
}
