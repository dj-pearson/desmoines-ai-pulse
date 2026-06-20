import { UpgradeModal } from "@/components/UpgradeModal";
import { usePaywallState, closePaywall } from "@/lib/paywallStore";

/**
 * The single app-root contextual paywall, driven by the global paywall store
 * (WEB-FEAT-001). Any call site opens it via openPaywall(feature). Per-feature
 * copy + analytics live in UpgradeModal.
 */
export function GlobalUpgradeModal() {
  const { open, feature, requiredTier } = usePaywallState();
  return (
    <UpgradeModal
      open={open}
      onOpenChange={(next) => {
        if (!next) closePaywall();
      }}
      feature={feature}
      requiredTier={requiredTier}
    />
  );
}
