import type { ExternalToast, toast as SonnerToast } from "sonner";
import { createLogger } from "@/lib/logger";

/**
 * sonner's `toast`, loaded on the first call (WEB-PERF-070).
 *
 * 88 modules imported `toast` from "sonner" at module scope, so sonner
 * (9.2 KB gz) sat in the static closure of /events, /restaurants,
 * /events/:id and most other routes: the route chunk could not run until
 * sonner had downloaded, for a toast that usually never fires. The Toaster
 * (components/ui/sonner.tsx) was already lazy. Import from here instead.
 *
 * The real `toast` lives in the same "sonner" module the lazy Toaster
 * imports, so a toast raised here is published to the same store the
 * Toaster renders from. Calls made while sonner is still loading are
 * queued and replayed in order.
 *
 * Every call returns an id synchronously, as sonner's does: it is the
 * caller's `id` when given, otherwise one minted here and passed through, so
 * `toast.success("Saved", { id })` replacing an earlier toast keeps working.
 *
 * Do not import "sonner" anywhere else for a runtime value;
 * src/__tests__/toastLazy.test.ts fails if a module does.
 */

type Sonner = typeof SonnerToast;
type Message = Parameters<Sonner>[0];
type ToastId = string | number;
type Variant = "success" | "info" | "warning" | "error" | "message";
type Show = (message: Message, data?: ExternalToast) => ToastId;

let sonner: Sonner | null = null;
let loading: Promise<void> | null = null;
const pending: Array<(t: Sonner) => void> = [];
let seq = 0;
const log = createLogger("toast");

function load(): void {
  if (loading) return;
  loading = import("sonner").then(
    (m) => {
      sonner = m.toast;
      for (const run of pending.splice(0)) run(m.toast);
    },
    (error: unknown) => {
      // A failed chunk fetch (offline, a deploy replaced the hash) must not
      // throw into the caller's click handler. Drop the queued toasts and let
      // the next call try again.
      loading = null;
      pending.length = 0;
      log.warn("load", "sonner failed to load", { error: String(error) });
    },
  );
}

function withId(data?: ExternalToast): ExternalToast & { id: ToastId } {
  return { ...data, id: data?.id ?? `toast-${++seq}` };
}

function run(fn: (t: Sonner) => void): void {
  if (sonner) fn(sonner);
  else {
    pending.push(fn);
    load();
  }
}

function variant(name: Variant): Show {
  return (message, data) => {
    const opts = withId(data);
    run((t) => t[name](message, opts));
    return opts.id;
  };
}

const show: Show = (message, data) => {
  const opts = withId(data);
  run((t) => t(message, opts));
  return opts.id;
};

export const toast = Object.assign(show, {
  success: variant("success"),
  info: variant("info"),
  warning: variant("warning"),
  error: variant("error"),
  message: variant("message"),
  // Nothing can be on screen before sonner has loaded, so dismissing then
  // is a no-op rather than a reason to fetch it.
  dismiss: (id?: ToastId): void => {
    if (sonner || loading) run((t) => t.dismiss(id));
  },
});
