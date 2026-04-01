import Foundation
import os

/// Executes an async operation with automatic retry on transient failures.
///
/// Uses exponential backoff with jitter to avoid thundering herd.
/// Respects Task cancellation during retry delays.
///
/// Usage:
///     let events = try await withRetry { try await service.fetchEvents() }
///     let data = try await withRetry(maxAttempts: 5) { try await api.call() }
func withRetry<T>(
    maxAttempts: Int = 3,
    backoffBase: TimeInterval = 1.0,
    operation: () async throws -> T
) async throws -> T {
    var lastError: Error?

    for attempt in 0..<maxAttempts {
        do {
            return try await operation()
        } catch {
            lastError = error

            // Don't retry on cancellation
            if Task.isCancelled { throw error }

            // Don't retry on non-transient errors
            guard isTransientError(error) else { throw error }

            // Don't retry after the last attempt
            guard attempt < maxAttempts - 1 else { break }

            // Exponential backoff with jitter: base * 2^attempt + random(0..0.5)
            let delay = backoffBase * pow(2.0, Double(attempt))
            let jitter = Double.random(in: 0...0.5)
            let totalDelay = delay + jitter

            AppLogger.network.info("Transient error (attempt \(attempt + 1)/\(maxAttempts)), retrying in \(String(format: "%.1f", totalDelay))s")

            try await Task.sleep(nanoseconds: UInt64(totalDelay * 1_000_000_000))

            // Check cancellation again after sleep
            if Task.isCancelled { throw error }
        }
    }

    throw lastError!
}

/// Determines whether an error is transient and worth retrying.
private func isTransientError(_ error: Error) -> Bool {
    // Network-level errors (timeout, connection lost, DNS failure, etc.)
    let nsError = error as NSError
    if nsError.domain == NSURLErrorDomain {
        let retryableCodes: Set<Int> = [
            NSURLErrorTimedOut,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorDNSLookupFailed,
            NSURLErrorNotConnectedToInternet,
            NSURLErrorSecureConnectionFailed,
        ]
        return retryableCodes.contains(nsError.code)
    }

    // Check for HTTP 5xx in error description (Supabase SDK wraps these)
    let description = error.localizedDescription.lowercased()
    if description.contains("500")
        || description.contains("502")
        || description.contains("503")
        || description.contains("504")
        || description.contains("timeout")
        || description.contains("connection") {
        return true
    }

    return false
}
