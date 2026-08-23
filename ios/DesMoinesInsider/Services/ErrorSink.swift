import Foundation

/// One place that posts to the `log-error` edge function.
///
/// Extracted from CrashUploader once certificate-pin mismatches needed the same
/// sink (IOS-AUDIT-SEC-013 AC4). Two copies of the field mapping would drift,
/// and `log-error` fails quietly on a field it does not accept -- it validates
/// `source` against `client | edge` and `userId` as a 36-character UUID, and
/// silently substitutes or drops anything else -- so a drifted copy would look
/// like it was reporting while reporting nothing.
///
/// Never throws and never blocks a caller. Everything here is best-effort
/// telemetry; the operations it reports on are more important than the report.
enum ErrorSink {
    /// Path on the Supabase functions host.
    static let functionPath = "/functions/v1/log-error"

    /// Post one event. Returns whether the sink accepted it, so a caller that
    /// holds a durable record (CrashUploader) can decide when to delete it.
    static func send(
        message: String,
        component: String,
        action: String,
        route: String,
        severity: String
    ) async -> Bool {
        guard let base = Config.supabaseURL, let anonKey = Config.supabaseAnonKey else { return false }
        guard let endpoint = URL(string: base.absoluteString + functionPath) else { return false }

        let body: [String: String] = [
            "message": String(message.prefix(2000)),
            "component": component,
            "action": action,
            "route": route,
            "severity": severity,
            "source": "client",
        ]

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            // URLSession.shared deliberately, NOT the pinned Supabase session.
            // A pin-mismatch report has to survive the pin mismatch it is
            // reporting; sending it down the pinned session would be blocked by
            // exactly the condition it exists to tell us about. The payload is a
            // host name and a hash, so an attacker who reads it learns that we
            // noticed them.
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            return (200...299).contains(http.statusCode)
        } catch {
            return false
        }
    }
}
