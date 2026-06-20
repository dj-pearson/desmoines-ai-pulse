import { useSyncExternalStore } from "react";

/**
 * Tiny global store so any call site (e.g. the favorites cap in FavoriteButton)
 * can open the one contextual paywall modal rendered at the app root
 * (WEB-FEAT-001) — without threading props or nesting a modal per gate.
 */
export interface PaywallState {
  open: boolean;
  feature?: string;
  requiredTier?: "insider" | "vip";
}

let state: PaywallState = { open: false };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function openPaywall(feature?: string, requiredTier: "insider" | "vip" = "insider") {
  state = { open: true, feature, requiredTier };
  emit();
}

export function closePaywall() {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => state;

export function usePaywallState(): PaywallState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
