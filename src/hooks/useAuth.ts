// Re-export from AuthContext to maintain backward compatibility.
//
// NOTE: every name here must actually exist in AuthContext. This barrel used to
// re-export `useAuthStatus`, which the WEB-PERF-005 context split had renamed to
// `useAuthFlags`. A missing named re-export is a module-level failure for all 56
// files importing from here — it surfaces as a dev SyntaxError and, once bundled,
// as an `undefined` component (React error #130). See WEB-QA-001.
export {
  useAuth,
  useAuthState,
  useAuthFlags,
  useAuthActions,
} from "@/contexts/AuthContext";

/** @deprecated Renamed to `useAuthFlags` in WEB-PERF-005. Kept so existing
 *  imports keep resolving; prefer `useAuthFlags` in new code. */
export { useAuthFlags as useAuthStatus } from "@/contexts/AuthContext";
