import { useState } from "react";
import { PaywallModal } from "@/components/PaywallModal";
import type { PaywallTier } from "@/lib/paywallContexts";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
  requiredTier?: PaywallTier;
}

/**
 * Backwards-compatible wrapper around the contextual {@link PaywallModal}
 * (WEB-FEAT-001). Existing call sites pass a `feature` string; it resolves to
 * the matching per-feature paywall copy so PremiumGate / PremiumButton present
 * the contextual modal instead of generic upgrade copy with zero call-site
 * changes. New code should prefer importing PaywallModal directly.
 */
export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  requiredTier,
}: UpgradeModalProps) {
  return (
    <PaywallModal
      open={open}
      onOpenChange={onOpenChange}
      context={feature}
      requiredTier={requiredTier}
    />
  );
}

// Hook for easy modal usage
export function useUpgradeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [modalProps, setModalProps] = useState<{
    feature?: string;
    requiredTier?: PaywallTier;
  }>({});

  const openUpgradeModal = (
    feature?: string,
    requiredTier?: PaywallTier,
  ) => {
    setModalProps({ feature, requiredTier });
    setIsOpen(true);
  };

  const closeUpgradeModal = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    openUpgradeModal,
    closeUpgradeModal,
    UpgradeModalComponent: () => (
      <UpgradeModal
        open={isOpen}
        onOpenChange={setIsOpen}
        feature={modalProps.feature}
        requiredTier={modalProps.requiredTier}
      />
    ),
  };
}

export default UpgradeModal;
