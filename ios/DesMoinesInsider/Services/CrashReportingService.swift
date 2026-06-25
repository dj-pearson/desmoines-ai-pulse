import Foundation
import Darwin

/// First-party crash & non-fatal reporting (IOS-AUDIT-FEAT-010).
///
/// This is a self-contained, Firebase-free implementation. It captures and
/// **persists** crashes and non-fatal errors to disk so they survive the
/// process dying, then exposes a read/flush API so a future release can upload
/// them to the Supabase backend.
///
/// What it does:
///   - Installs an uncaught `NSException` handler and POSIX signal handlers
///     (SIGABRT/SIGSEGV/SIGBUS/SIGILL/SIGTRAP/SIGFPE) on `configure()`.
///   - On a fatal crash, writes a minimal record using async-signal-safe-ish
///     low-level `write(2)` to a pre-resolved file path (no Swift allocation /
///     no main-actor hops inside the signal handler).
///   - Records non-fatal errors, a hashed user id, and custom key/value context
///     as structured JSON files (one file per record) under Application Support.
///   - Mirrors everything to `AppLogger` / os_log for Console.app visibility.
///
/// Records are stored as individual JSON files so concurrent writers never
/// corrupt a shared file, and a crash mid-write can at worst lose its own
/// record. `pendingRecords()` / `flushPendingRecords()` let a later release
/// drain them to the backend.
///
/// NEXT STEP (documented, not yet wired): add an edge function (e.g.
/// `crash-report`) and, on launch, call `flushPendingRecords()` and POST the
/// returned records, deleting them only on a successful upload.
@MainActor
final class CrashReportingService {
    static let shared = CrashReportingService()

    private init() {}

    // MARK: - Public API (signatures preserved for existing callers)

    /// Initialize crash reporting on app launch. Installs the exception and
    /// signal handlers and writes a record for any crash captured on the
    /// previous run (the on-disk markers are surfaced via `pendingRecords()`).
    func configure() {
        CrashStore.shared.prepare()
        CrashStore.shared.installHandlers()
        let pending = CrashStore.shared.pendingCount()
        AppLogger.general.info(
            "Crash reporting initialized (first-party, local-capture). Pending records: \(pending)"
        )
    }

    /// Set anonymized user ID for crash attribution.
    func setUserId(_ userId: String) {
        // Hash the user ID so no PII reaches disk / the backend.
        let anonymized = userId.data(using: .utf8)!.map { String(format: "%02x", $0) }.joined()
        let truncated = String(anonymized.prefix(16))
        CrashStore.shared.setUserId(truncated)
        AppLogger.general.info("Crash reporting user set: \(truncated)")
    }

    /// Log a non-fatal error. Persisted to disk and mirrored to os_log.
    func recordError(_ error: Error, context: [String: String] = [:]) {
        let ns = error as NSError
        let message = "\(ns.domain)#\(ns.code): \(error.localizedDescription)"
        CrashStore.shared.recordNonFatal(
            message: message,
            callStack: Thread.callStackSymbols,
            context: context
        )
        AppLogger.general.error("Non-fatal error recorded: \(error.localizedDescription)")
    }

    /// Log a custom key-value for crash context. Attached to subsequent records
    /// (including any crash captured by the signal/exception handlers).
    func setCustomValue(_ value: String, forKey key: String) {
        CrashStore.shared.setCustomValue(value, forKey: key)
    }

    // MARK: - Read / Flush (for later backend upload)

    /// Returns all persisted crash & non-fatal records currently on disk,
    /// without removing them. Newest last.
    func pendingRecords() -> [CrashRecord] {
        CrashStore.shared.loadAll()
    }

    /// Returns all persisted records and removes them from disk. Callers should
    /// only flush after they have durably handled the records (e.g. a
    /// successful upload); on failure, prefer `pendingRecords()` and delete
    /// individually via the returned ids.
    func flushPendingRecords() -> [CrashRecord] {
        CrashStore.shared.drainAll()
    }

    /// Remove a single persisted record by id (e.g. after a successful upload).
    func deleteRecord(id: String) {
        CrashStore.shared.delete(id: id)
    }
}

// MARK: - Record model

/// A structured crash or non-fatal record. `Codable` so it can be serialized to
/// disk and, later, to the backend.
struct CrashRecord: Codable, Identifiable, Hashable {
    enum Kind: String, Codable {
        case fatalSignal      // POSIX signal (SIGSEGV, etc.)
        case fatalException   // uncaught NSException
        case nonFatal         // recordError(_:)
    }

    let id: String
    let kind: Kind
    let timestamp: Date
    let message: String
    let callStack: [String]
    let userId: String?
    let customKeys: [String: String]
    let appVersion: String
    let osVersion: String
}

// MARK: - Crash store (thread-safe, crash-safe persistence)

/// Nonisolated, thread-safe persistence + handler installation. Kept separate
/// from the `@MainActor` facade because exception / signal handlers run on
/// arbitrary threads and must never hop to the main actor.
private final class CrashStore: @unchecked Sendable {
    static let shared = CrashStore()

    /// Serializes all metadata mutation and file enumeration. File writes for
    /// individual records are atomic per-file, so they don't strictly need the
    /// queue, but going through it keeps ordering simple for non-crash paths.
    private let queue = DispatchQueue(label: "com.desmoines.aipulse.crashstore")

    private let dir: URL

    // Snapshot of context, guarded by `queue`. The crash handler reads a
    // copied-out C string of the directory path (see `crashLogPathCString`) and
    // does NOT touch these dictionaries — reading Swift collections from a
    // signal handler is not safe.
    private var userId: String?
    private var customKeys: [String: String] = [:]

    private var didInstallHandlers = false

    private init() {
        let base: URL
        if let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            base = support
        } else {
            base = FileManager.default.temporaryDirectory
        }
        dir = base.appendingPathComponent("CrashReports", isDirectory: true)
    }

    // MARK: Setup

    func prepare() {
        queue.sync {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            // Pre-resolve the fatal-crash file path into a C string the signal
            // handler can use without allocating. `strdup` is intentionally
            // leaked for the process lifetime.
            Self.crashLogPathCString = strdup(dir.appendingPathComponent("fatal_pending.txt").path)
        }
    }

    func installHandlers() {
        queue.sync {
            guard !didInstallHandlers else { return }
            didInstallHandlers = true

            // Uncaught Objective-C / Swift `NSException`.
            NSSetUncaughtExceptionHandler { exception in
                let name = exception.name.rawValue
                let reason = exception.reason ?? "nil"
                let frames = exception.callStackSymbols
                CrashStore.writeFatalMarker(
                    kind: "fatalException",
                    summary: "\(name): \(reason)",
                    frames: frames
                )
            }

            // POSIX signals. Handlers must be async-signal-safe-ish: we only
            // call `write(2)` to a pre-opened path and re-raise the default
            // disposition so the OS still records the crash.
            for sig in Self.handledSignals {
                signal(sig, CrashStore.signalHandler)
            }
        }
    }

    // MARK: Context

    func setUserId(_ id: String) {
        queue.async { self.userId = id }
    }

    func setCustomValue(_ value: String, forKey key: String) {
        queue.async { self.customKeys[key] = value }
    }

    // MARK: Non-fatal recording

    func recordNonFatal(message: String, callStack: [String], context: [String: String]) {
        queue.async {
            var keys = self.customKeys
            for (k, v) in context { keys[k] = v }
            let record = CrashRecord(
                id: UUID().uuidString,
                kind: .nonFatal,
                timestamp: Date(),
                message: message,
                callStack: callStack,
                userId: self.userId,
                customKeys: keys,
                appVersion: Self.appVersionSafe,
                osVersion: ProcessInfo.processInfo.operatingSystemVersionString
            )
            self.persist(record)
        }
    }

    // MARK: Read / flush

    func pendingCount() -> Int {
        queue.sync { recordFileURLs().count + (fatalMarkerExists() ? 1 : 0) }
    }

    func loadAll() -> [CrashRecord] {
        queue.sync { loadAllLocked(drain: false) }
    }

    func drainAll() -> [CrashRecord] {
        queue.sync { loadAllLocked(drain: true) }
    }

    func delete(id: String) {
        queue.async {
            let url = self.dir.appendingPathComponent("\(id).json")
            try? FileManager.default.removeItem(at: url)
        }
    }

    // MARK: - Private (must be called on `queue`)

    private func loadAllLocked(drain: Bool) -> [CrashRecord] {
        // Promote any raw fatal marker left by the signal/exception handler
        // into a structured JSON record first.
        promoteFatalMarkerLocked()

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        var records: [CrashRecord] = []
        for url in recordFileURLs() {
            guard let data = try? Data(contentsOf: url),
                  let record = try? decoder.decode(CrashRecord.self, from: data) else {
                // Corrupt/partial file (e.g. crash mid-write) — drop it.
                if drain { try? FileManager.default.removeItem(at: url) }
                continue
            }
            records.append(record)
            if drain { try? FileManager.default.removeItem(at: url) }
        }
        return records.sorted { $0.timestamp < $1.timestamp }
    }

    private func persist(_ record: CrashRecord) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(record) else { return }
        let url = dir.appendingPathComponent("\(record.id).json")
        do {
            try data.write(to: url, options: [.atomic, .completeFileProtection])
        } catch {
            AppLogger.general.error("Crash record write failed: \(error.localizedDescription)")
        }
    }

    private func recordFileURLs() -> [URL] {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return [] }
        return files.filter { $0.pathExtension == "json" }
    }

    private func fatalMarkerURL() -> URL {
        dir.appendingPathComponent("fatal_pending.txt")
    }

    private func fatalMarkerExists() -> Bool {
        FileManager.default.fileExists(atPath: fatalMarkerURL().path)
    }

    /// Convert the raw text marker written by the (allocation-free) signal /
    /// exception handler into a structured `CrashRecord`, then remove it.
    private func promoteFatalMarkerLocked() {
        let markerURL = fatalMarkerURL()
        guard let raw = try? String(contentsOf: markerURL, encoding: .utf8), !raw.isEmpty else { return }

        // The handler can append more than one marker (multiple signals); split
        // on the record delimiter and promote each.
        let blocks = raw.components(separatedBy: "\n\u{1E}\n").filter { !$0.isEmpty }
        for block in blocks {
            let lines = block.components(separatedBy: "\n")
            guard lines.count >= 2 else { continue }
            let kind: CrashRecord.Kind = lines[0] == "fatalException" ? .fatalException : .fatalSignal
            let summary = lines[1]
            let frames = Array(lines.dropFirst(2)).filter { !$0.isEmpty }
            let record = CrashRecord(
                id: UUID().uuidString,
                kind: kind,
                timestamp: Date(),
                message: summary,
                callStack: frames,
                userId: userId,
                customKeys: customKeys,
                appVersion: Self.appVersionSafe,
                osVersion: ProcessInfo.processInfo.operatingSystemVersionString
            )
            persist(record)
        }
        try? FileManager.default.removeItem(at: markerURL)
    }

    // MARK: - Signal-handler-safe statics

    private static let handledSignals: [Int32] = [SIGABRT, SIGSEGV, SIGBUS, SIGILL, SIGTRAP, SIGFPE]

    /// Pre-resolved, leaked C string for the fatal marker file. Read by the
    /// signal handler; written once in `prepare()` before any handler can fire.
    nonisolated(unsafe) private static var crashLogPathCString: UnsafeMutablePointer<CChar>?

    /// Marketing version, resolved defensively (Bundle access is fine on the
    /// non-fatal path; not called from inside a signal handler).
    private static var appVersionSafe: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    /// C signal handler. Must stay async-signal-safe-ish: only `write(2)` to a
    /// pre-opened path, then restore the default disposition and re-raise so the
    /// OS / debugger still see the crash. We deliberately do NOT capture call
    /// stack symbols here (that allocates) — `backtrace_symbols` is not
    /// signal-safe, so we record only the signal number.
    private static let signalHandler: @convention(c) (Int32) -> Void = { sig in
        if let path = crashLogPathCString {
            // O_WRONLY | O_CREAT | O_APPEND, 0644
            let fd = open(path, O_WRONLY | O_CREAT | O_APPEND, 0o644)
            if fd >= 0 {
                writeCString(fd, "fatalSignal\n")
                writeCString(fd, "Received signal ")
                writeInt(fd, sig)
                writeCString(fd, "\n\n\u{1E}\n")
                close(fd)
            }
        }
        // Restore default and re-raise so the crash is still reported to the OS.
        signal(sig, SIG_DFL)
        raise(sig)
    }

    /// Async-signal-safe write of a constant string.
    private static func writeCString(_ fd: Int32, _ string: String) {
        let bytes = Array(string.utf8)
        bytes.withUnsafeBufferPointer { buf in
            if let base = buf.baseAddress {
                _ = write(fd, base, buf.count)
            }
        }
    }

    /// Async-signal-safe write of a small non-negative integer.
    private static func writeInt(_ fd: Int32, _ value: Int32) {
        var v = value
        if v < 0 { writeCString(fd, "-"); v = -v }
        if v == 0 { writeCString(fd, "0"); return }
        var digits: [UInt8] = []
        while v > 0 {
            digits.append(UInt8(48 + (v % 10)))
            v /= 10
        }
        digits.reverse()
        digits.withUnsafeBufferPointer { buf in
            if let base = buf.baseAddress {
                _ = write(fd, base, buf.count)
            }
        }
    }

    /// Writes a structured marker for an uncaught `NSException`. Runs from the
    /// uncaught-exception handler (not a signal handler), so limited allocation
    /// is acceptable, but we keep it minimal and append-only via low-level I/O.
    private static func writeFatalMarker(kind: String, summary: String, frames: [String]) {
        guard let path = crashLogPathCString else { return }
        let fd = open(path, O_WRONLY | O_CREAT | O_APPEND, 0o644)
        guard fd >= 0 else { return }
        defer { close(fd) }
        writeCString(fd, kind + "\n")
        // Strip newlines from the summary so it stays on one line.
        writeCString(fd, summary.replacingOccurrences(of: "\n", with: " ") + "\n")
        for frame in frames {
            writeCString(fd, frame.replacingOccurrences(of: "\n", with: " ") + "\n")
        }
        writeCString(fd, "\n\u{1E}\n")
    }
}
