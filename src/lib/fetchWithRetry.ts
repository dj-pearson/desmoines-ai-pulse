import { createLogger } from './logger';

const log = createLogger('fetchWithRetry');

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelay?: number;
  /** Only retry on these status codes. Defaults to 5xx range. */
  retryableStatuses?: number[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  retryableStatuses: [500, 502, 503, 504],
};

/**
 * Determines if an error is retryable.
 * Network errors (TypeError from fetch) and 5xx server errors are retryable.
 * 4xx client errors are NOT retryable.
 */
function isRetryable(error: unknown, retryableStatuses: number[]): boolean {
  // Network errors (no response received)
  if (error instanceof TypeError) return true;

  // Response errors with retryable status codes
  if (error instanceof Response) {
    return retryableStatuses.includes(error.status);
  }

  return false;
}

/**
 * Wraps the native fetch with configurable retry logic and exponential backoff.
 *
 * Only retries on network errors and 5xx status codes.
 * Does NOT retry on 4xx client errors.
 *
 * @example
 * const response = await fetchWithRetry('/api/events', { maxRetries: 3 });
 * const data = await response.json();
 *
 * @example
 * // Use with TanStack Query
 * useQuery({
 *   queryKey: ['events'],
 *   queryFn: () => fetchWithRetry('/api/events').then(r => r.json()),
 * });
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: RetryOptions
): Promise<Response> {
  const { maxRetries, baseDelay, retryableStatuses } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);

      // If response is not OK and is retryable, throw to trigger retry
      if (!response.ok && retryableStatuses.includes(response.status)) {
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          if (import.meta.env.DEV) {
            log.warn('retry', `Attempt ${attempt + 1}/${maxRetries} failed with ${response.status}, retrying in ${delay}ms`, {
              url: typeof input === 'string' ? input : input.toString(),
              status: response.status,
            });
          }
          await sleep(delay);
          continue;
        }
        // Final attempt failed — return the response as-is for caller to handle
        return response;
      }

      return response;
    } catch (error: unknown) {
      lastError = error;

      if (attempt < maxRetries && isRetryable(error, retryableStatuses)) {
        const delay = baseDelay * Math.pow(2, attempt);
        if (import.meta.env.DEV) {
          log.warn('retry', `Attempt ${attempt + 1}/${maxRetries} failed with network error, retrying in ${delay}ms`, {
            url: typeof input === 'string' ? input : input.toString(),
            error: error instanceof Error ? error.message : String(error),
          });
        }
        await sleep(delay);
        continue;
      }

      // Non-retryable error or max retries exceeded
      throw error;
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
