/**
 * Which environment this function is running in, for security decisions.
 *
 * A MISSING ENVIRONMENT IS PRODUCTION. This used to default to 'development'
 * in three places (validateApiKey, getAllowedOrigins, isOriginAllowed), so a
 * deploy that lost the secret, or never set it, let every request through the
 * API-key gate and allowed lovable.dev origins. The safe reading of "unknown"
 * is the strict one. Local development sets ENVIRONMENT=development explicitly
 * (.env.example:61), which is the only way to get the relaxed behaviour now.
 */
export type RuntimeEnvironment = 'production' | 'staging' | 'development';

export function runtimeEnvironment(): RuntimeEnvironment {
  const raw = (Deno.env.get('ENVIRONMENT') ?? '').trim().toLowerCase();
  if (raw === 'development' || raw === 'staging') return raw;
  return 'production';
}
