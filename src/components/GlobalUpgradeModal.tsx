import { Suspense, lazy } from "react";
import { usePaywallState, closePaywall } from "@/lib/paywallStore";

/**
 * The single app-root contextual paywall, driven by the global paywall store
 * (WEB-FEAT-001). Any call site opens it via openPaywall(feature). Per-feature
 * copy + analytics live in UpgradeModal.
 *
 * WEB-PERF-020 AC3: UpgradeModal is 415 lines with 11 imports and this component
 * is mounted at the app root, so it used to land in the entry chunk and be
 * downloaded by every visitor on every page - including the large majority who
 * never hit a paywall.
 *
 * Returning null while closed is what makes the lazy import work. React.lazy
 * fetches when the component RENDERS, so keeping <UpgradeModal open={false}>
 * mounted would have loaded the chunk immediately and changed nothing.
 */
const UpgradeModal = lazy(() =>
  import("@/components/UpgradeModal").then((m) => ({ default: m.UpgradeModal })),
);

export function GlobalUpgradeModal() {
  const { open, feature, requiredTier } = usePaywallState();

  if (!open) return null;

  return (
    // No fallback: a spinner behind a modal that is about to appear is worse
    // than the few frames it takes to fetch.
    <Suspense fallback={null}>
      <UpgradeModal
        open
        onOpenChange={(next) => {
          if (!next) closePaywall();
        }}
        feature={feature}
        requiredTier={requiredTier}
      />
    </Suspense>
  );
}
