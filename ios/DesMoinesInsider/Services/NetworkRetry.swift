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
///
/// Decisions are based on structured signals only — never on
/// `localizedDescription` substring matching, which is locale-dependent and
/// over-broad (e.g. an event title containing "500" must not trigger a retry,
/// IOS-AUDIT-PERF-008):
///
/// 1. `URLError` / `NSURLErrorDomain` codes for transport-level failures.
/// 2. An HTTP status code surfaced by the error: retry only 5xx and 429.
///    Any other 4xx is a client error and is never retried.
private func isTransientError(_ error: Error) -> Bool {
    // 1. Network-level errors (timeout, connection lost, DNS failure, etc.).
    // Prefer the Swift-native URLError where available; fall back to the
    // bridged NSError for the same domain.
    if let urlError = error as? URLError {
        return retryableURLErrorCodes.contains(urlError.code)
    }

    let nsError = error as NSError
    if nsError.domain == NSURLErrorDomain {
        return retryableNSURLErrorCodes.contains(nsError.code)
    }

    // 2. HTTP status code surfaced by the (e.g. Supabase) error. Retry only
    // 5xx server errors and 429 Too Many Requests; never other 4xx.
    if let status = httpStatusCode(from: error) {
        return status >= 500 || status == 429
    }

    return false
}

/// Retryable transport-level failures, expressed as `URLError.Code`.
private let retryableURLErrorCodes: Set<URLError.Code> = [
    .timedOut,
    .cannotFindHost,
    .cannotConnectToHost,
    .networkConnectionLost,
    .dnsLookupFailed,
    .notConnectedToInternet,
    .secureConnectionFailed,
]

/// Same set, expressed as raw `NSURLErrorDomain` codes for the bridged path.
private let retryableNSURLErrorCodes: Set<Int> = [
    NSURLErrorTimedOut,
    NSURLErrorCannotFindHost,
    NSURLErrorCannotConnectToHost,
    NSURLErrorNetworkConnectionLost,
    NSURLErrorDNSLookupFailed,
    NSURLErrorNotConnectedToInternet,
    NSURLErrorSecureConnectionFailed,
]

/// Attempts to extract an HTTP status code from an error without binding to a
/// specific SDK error type.
///
/// The Supabase Swift SDK surfaces HTTP failures through a handful of types
/// (`PostgrestError`, `FunctionsError`, `StorageError`, and the underlying
/// `HTTPError`) whose shapes differ across SDK versions. Rather than import and
/// pattern-match each one (and risk breaking on a version bump), we inspect the
/// error structurally for either an `HTTPURLResponse` or an integer status
/// field. This stays robust while remaining strictly structural — no string
/// parsing of human-readable descriptions.
private func httpStatusCode(from error: Error) -> Int? {
    statusCode(fromMirrorOf: error, depth: 0)
}

private func statusCode(fromMirrorOf subject: Any, depth: Int) -> Int? {
    // Bound recursion so a pathological/cyclic object graph can't spin.
    guard depth <= 3 else { return nil }

    // Direct hit: an HTTPURLResponse anywhere in the tree.
    if let response = subject as? HTTPURLResponse {
        return response.statusCode
    }

    let mirror = Mirror(reflecting: subject)
    for child in mirror.children {
        // A labelled integer that looks like an HTTP status code.
        if let label = child.label,
           statusCodeLabels.contains(label),
           let intValue = child.value as? Int,
           (100...599).contains(intValue) {
            return intValue
        }

        // Recurse into nested values (e.g. an associated `HTTPURLResponse`,
        // a wrapped `HTTPError`, or an enum's associated values).
        if let nested = statusCode(fromMirrorOf: child.value, depth: depth + 1) {
            return nested
        }
    }

    return nil
}

/// Property/associated-value labels that, when carrying an HTTP-range integer,
/// are treated as a status code.
private let statusCodeLabels: Set<String> = [
    "statusCode", "status", "code", "httpStatusCode",
]
