import Foundation

/// Uploads persisted crash records to the backend (XPLAT-004 AC1).
///
/// CrashReportingService has captured crashes to disk since IOS-AUDIT-FEAT-010
/// and its own header says an upload path is the "NEXT STEP (documented, not yet
/// wired)". Nothing was wired, so every crash the app has ever recorded stayed
/// on the device that crashed. This is that path.
///
/// WHY log-error RATHER THAN A NEW crash-report FUNCTION. The story asks for a
/// `crash-report` edge function. Building one would duplicate work that already
/// runs in production: `supabase/functions/log-error` is `verify_jwt = false`
/// (a crash reporter has no session to offer), rate-limits per IP, scrubs PII
/// before storage, returns no data, and feeds the error-triage agent that
/// clusters `error_events` into dev tasks. Web already posts to it from
/// `src/lib/errorHandler.ts`. A second, mobile-only sink would need its own copy
/// of all four and would put mobile crashes in a table nothing triages.
///
/// WHAT IS LOST, STATED PLAINLY. `error_events` has no stack column, and the
/// cluster signature is a hash of component + action + message, so pasting raw
/// frames into the message would give every crash a unique signature and defeat
/// the clustering that is the reason for choosing this sink. So one frame is
/// carried, reduced to its symbol name -- see `topSymbol`. Full stacks stay on
/// the device, readable through `pendingRecords()`. If frame-level triage is
/// wanted later, that is a column on `error_events`, not a second endpoint.
///
/// FAILURE IS SILENT AND RECORDS SURVIVE IT. Nothing here throws to the caller
/// and a record is deleted only after a 2xx. A failed upload leaves the record
/// on disk for the next launch; the alternative -- draining first -- loses
/// exactly the crashes that happen when the network is worst.
enum CrashUploader {
    /// Most records posted per launch. The sink allows 60 requests/minute per IP
    /// and a device coming back from a crash loop can hold far more than that;
    /// the remainder is not dropped, it waits for the next launch.
    static let maxPerLaunch = 20

    // MARK: - Payload (pure, and the part under test)

    /// The JSON body posted for one record.
    ///
    /// Field mapping is constrained by what `log-error` accepts: `source` is
    /// validated against `client | edge` so mobile is `client`, and `userId` is
    /// validated as a 36-character UUID, so the service's 16-hex-character
    /// hashed id would be silently discarded and is deliberately not sent.
    static func payload(for record: CrashRecord) -> [String: String] {
        var message = record.message
        if let symbol = topSymbol(of: record.callStack) {
            message += " @ " + symbol
        }

        return [
            "message": String(message.prefix(2000)),
            "component": "ios-crash",
            "action": record.kind.rawValue,
            "route": "ios/\(record.appVersion) (\(record.osVersion))",
            "severity": severity(for: record.kind),
            "source": "client",
        ]
    }

    /// A fatal record is critical; a recorded non-fatal is an error. These are
    /// the two values `log-error` keeps that mean what they say here.
    static func severity(for kind: CrashRecord.Kind) -> String {
        switch kind {
        case .fatalSignal, .fatalException: return "critical"
        case .nonFatal: return "error"
        }
    }

    /// Reduce the first application frame to a stable symbol.
    ///
    /// `Thread.callStackSymbols` produces
    /// `4   DesMoinesInsider   0x00000001048c3d40 $s16DesMoines... + 328`.
    /// The index, the load address and the byte offset all move between runs and
    /// between builds, so keeping them would make every occurrence of one crash
    /// a different cluster. Only the symbol survives.
    ///
    /// Frames from the OS (`libsystem_kernel.dylib`, `CoreFoundation`, ...) are
    /// skipped: the top of a crash stack is nearly always the trap itself, which
    /// is identical across unrelated crashes and says nothing about which code
    /// failed. If no application frame is found, nothing is appended rather than
    /// something misleading.
    static func topSymbol(of callStack: [String]) -> String? {
        for frame in callStack {
            let fields = frame.split(separator: " ", omittingEmptySubsequences: true)
            // index, image, address, then the symbol.
            guard fields.count >= 4 else { continue }
            let image = String(fields[1])
            guard image == "DesMoinesInsider" else { continue }

            var symbol = fields[3...].joined(separator: " ")
            // Drop the trailing "+ 328" byte offset, which moves with any edit.
            if let plus = symbol.range(of: " + ", options: .backwards) {
                symbol = String(symbol[..<plus.lowerBound])
            }
            symbol = symbol.trimmingCharacters(in: .whitespaces)
            return symbol.isEmpty ? nil : String(symbol.prefix(200))
        }
        return nil
    }

    // MARK: - Upload

    /// Post every pending record, deleting each one only after the sink accepts
    /// it. Safe to call on every launch; a no-op when unconfigured or empty.
    @MainActor
    static func uploadPending() async {
        guard Config.isConfigured else { return }

        let records = CrashReportingService.shared.pendingRecords()
        guard !records.isEmpty else { return }

        var uploaded = 0
        for record in records.prefix(maxPerLaunch) {
            guard await post(payload(for: record)) else {
                // One failure almost always means the network is down, not that
                // this record is bad. Stop rather than burn the rest against it.
                break
            }
            CrashReportingService.shared.deleteRecord(id: record.id)
            uploaded += 1
        }

        if uploaded > 0 {
            AppLogger.general.info("Uploaded \(uploaded) crash record(s); \(records.count - uploaded) remaining.")
        }
    }

    /// Returns whether the sink accepted the record. The HTTP itself lives
    /// in ErrorSink, which pin-mismatch reporting shares (IOS-AUDIT-SEC-013).
    private static func post(_ body: [String: String]) async -> Bool {
        await ErrorSink.send(
            message: body["message"] ?? "",
            component: body["component"] ?? "",
            action: body["action"] ?? "",
            route: body["route"] ?? "",
            severity: body["severity"] ?? "error"
        )
    }
}
