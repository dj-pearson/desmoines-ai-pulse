/**
 * Biometric Authentication Service
 *
 * Provides Face ID / Touch ID (iOS) and fingerprint/face (Android)
 * authentication for securing sensitive operations like:
 * - App unlock after background
 * - Payment confirmations
 * - Profile/account changes
 */

import { NativeBiometric, type AvailableResult } from 'capacitor-native-biometric';
import { isNative, isPluginAvailable } from '../config/platform';

export type BiometricType = 'face' | 'fingerprint' | 'iris' | 'none';

export interface BiometricStatus {
  isAvailable: boolean;
  biometricType: BiometricType;
  errorMessage?: string;
}

/**
 * Check if biometric authentication is available on the device.
 */
export async function checkBiometricAvailability(): Promise<BiometricStatus> {
  if (!isNative) {
    return { isAvailable: false, biometricType: 'none' };
  }

  try {
    const result: AvailableResult = await NativeBiometric.isAvailable();

    let biometricType: BiometricType = 'none';
    // Map Capacitor biometric type enum to our type
    if (result.biometryType === 1) biometricType = 'fingerprint';
    else if (result.biometryType === 2) biometricType = 'face';
    else if (result.biometryType === 3) biometricType = 'iris';

    return {
      isAvailable: result.isAvailable,
      biometricType,
    };
  } catch (error) {
    return {
      isAvailable: false,
      biometricType: 'none',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Prompt the user for biometric authentication.
 * Returns true if authentication succeeded, false otherwise.
 */
export async function authenticateWithBiometrics(options?: {
  title?: string;
  subtitle?: string;
  description?: string;
  negativeButtonText?: string;
  maxAttempts?: number;
}): Promise<boolean> {
  if (!isNative) return false;

  try {
    await NativeBiometric.verifyIdentity({
      title: options?.title || 'Verify Identity',
      subtitle: options?.subtitle || 'Des Moines AI Pulse',
      description: options?.description || 'Authenticate to continue',
      negativeButtonText: options?.negativeButtonText || 'Cancel',
      maxAttempts: options?.maxAttempts || 3,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Store credentials securely in the device keychain/keystore.
 * Credentials are protected by biometric authentication.
 */
export async function storeCredentials(
  server: string,
  username: string,
  password: string
): Promise<boolean> {
  if (!isNative) return false;

  try {
    await NativeBiometric.setCredentials({
      server,
      username,
      password,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieve stored credentials from the device keychain/keystore.
 * Requires biometric authentication before access.
 */
export async function getCredentials(
  server: string
): Promise<{ username: string; password: string } | null> {
  if (!isNative) return null;

  try {
    const credentials = await NativeBiometric.getCredentials({ server });
    return {
      username: credentials.username,
      password: credentials.password,
    };
  } catch {
    return null;
  }
}

/**
 * Delete stored credentials from the device keychain/keystore.
 */
export async function deleteCredentials(server: string): Promise<boolean> {
  if (!isNative) return false;

  try {
    await NativeBiometric.deleteCredentials({ server });
    return true;
  } catch {
    return false;
  }
}
