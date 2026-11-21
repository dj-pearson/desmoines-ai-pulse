import type { ComponentType } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("lazyOrNothing");

function Nothing(): null {
  return null;
}

/**
 * Wrap a React.lazy importer for a HEADLESS app-root component so a failed
 * chunk fetch renders nothing instead of throwing.
 *
 * The app-root components that use this (SessionManager's admin timeout,
 * GuestFavoriteMigrator's runner) sit above every route's error boundary. A
 * plain lazy() that rejects - the usual cause is a chunk Cloudflare purged
 * after a deploy - would throw into the root boundary and replace the whole
 * page with an error card, for a component that renders nothing. Route chunks
 * use App.tsx's lazyWithRetry instead, which reloads; the next route change
 * does that here too, and these components mount again on the fresh page.
 *
 * Only for components whose absence is harmless for one page view.
 */
export function lazyOrNothing<P>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
): () => Promise<{ default: ComponentType<P> }> {
  return () =>
    importFn().catch((error: unknown) => {
      log.warn("import", "lazy chunk failed; rendering nothing", { error: String(error) });
      return { default: Nothing as ComponentType<P> };
    });
}
