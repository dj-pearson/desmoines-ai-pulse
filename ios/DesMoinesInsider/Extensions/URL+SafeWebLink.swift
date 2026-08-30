import Foundation
import os

/// Centralized safety for *content-supplied* links (event source URLs, business
/// websites, article cross-links). A compromised content row must not be able to
/// open `file:`, `tel:`, `javascript:`, `data:`, or arbitrary custom schemes —
/// only plain web links are allowed (IOS-AUDIT-SEC-002).
///
/// First-party intents constructed in code (`maps://…`, app deep links) do NOT
/// go through this — they're trusted and built by us, not the backend.
extension URL {
    /// True only for `http`/`https` web links.
    var isSafeWebLink: Bool {
        switch scheme?.lowercased() {
        case "http", "https": return true
        default: return false
        }
    }
}

extension String {
    /// Parses a content-supplied string into a safe `http`/`https` URL. A bare
    /// host (`"example.com"`) defaults to `https`. Returns `nil` (logging the
    /// rejection) for unsafe schemes or malformed input, so callers render no
    /// button / drop the link.
    var safeWebURL: URL? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // Detect an explicit scheme (`scheme:`). If absent, treat the value as a
        // bare host and assume https.
        let declaresScheme = trimmed.range(
            of: #"^[a-zA-Z][a-zA-Z0-9+.\-]*:"#,
            options: .regularExpression
        ) != nil

        let candidate = declaresScheme ? URL(string: trimmed) : URL(string: "https://\(trimmed)")

        guard let url = candidate, url.isSafeWebLink else {
            let scheme = URL(string: trimmed)?.scheme ?? "nil"
            AppLogger.nav.warning("Dropped unsafe content link (scheme: \(scheme))")
            return nil
        }
        return url
    }
}
