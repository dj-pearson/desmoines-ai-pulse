import { useReferralCapture } from "@/hooks/useReferralCapture";

/**
 * Headless: keeps a ?ref code and attributes it once the visitor is signed
 * in (plan WP6). Mount once inside AuthProvider and BrowserRouter.
 */
export function ReferralCapture() {
  useReferralCapture();
  return null;
}
