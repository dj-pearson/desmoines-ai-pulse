/**
 * React hook for biometric authentication (Face ID / Touch ID / Fingerprint).
 */

import { useState, useCallback, useEffect } from 'react';
import {
  checkBiometricAvailability,
  authenticateWithBiometrics,
  type BiometricStatus,
  type BiometricType,
} from '../services/biometrics';
import { getItem, setItem } from '../services/offline-storage';

const BIOMETRIC_PREF_KEY = 'biometric_auth_enabled';

export interface UseBiometricAuthReturn {
  isAvailable: boolean;
  isEnabled: boolean;
  biometricType: BiometricType;
  authenticate: (reason?: string) => Promise<boolean>;
  toggleBiometric: (enabled: boolean) => Promise<void>;
  biometricLabel: string;
}

/**
 * Manage biometric authentication in React components.
 *
 * @example
 * ```tsx
 * function SecuritySettings() {
 *   const { isAvailable, isEnabled, toggleBiometric, biometricLabel } = useBiometricAuth();
 *
 *   if (!isAvailable) return null;
 *
 *   return (
 *     <div>
 *       <label>Enable {biometricLabel}</label>
 *       <Switch
 *         checked={isEnabled}
 *         onCheckedChange={toggleBiometric}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useBiometricAuth(): UseBiometricAuthReturn {
  const [status, setStatus] = useState<BiometricStatus>({
    isAvailable: false,
    biometricType: 'none',
  });
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const [availability, preference] = await Promise.all([
        checkBiometricAvailability(),
        getItem<boolean>(BIOMETRIC_PREF_KEY),
      ]);
      setStatus(availability);
      setIsEnabled(preference === true && availability.isAvailable);
    })();
  }, []);

  const authenticate = useCallback(
    async (reason?: string): Promise<boolean> => {
      if (!status.isAvailable) return false;

      return authenticateWithBiometrics({
        title: reason || 'Authenticate',
        subtitle: 'Des Moines AI Pulse',
        description: reason || 'Verify your identity to continue',
      });
    },
    [status.isAvailable]
  );

  const toggleBiometric = useCallback(
    async (enabled: boolean): Promise<void> => {
      if (enabled && status.isAvailable) {
        // Require authentication before enabling
        const success = await authenticate('Enable biometric login');
        if (success) {
          setIsEnabled(true);
          await setItem(BIOMETRIC_PREF_KEY, true);
        }
      } else {
        setIsEnabled(false);
        await setItem(BIOMETRIC_PREF_KEY, false);
      }
    },
    [status.isAvailable, authenticate]
  );

  const biometricLabel =
    status.biometricType === 'face'
      ? 'Face ID'
      : status.biometricType === 'fingerprint'
        ? 'Fingerprint'
        : status.biometricType === 'iris'
          ? 'Iris Scan'
          : 'Biometric Login';

  return {
    isAvailable: status.isAvailable,
    isEnabled,
    biometricType: status.biometricType,
    authenticate,
    toggleBiometric,
    biometricLabel,
  };
}
