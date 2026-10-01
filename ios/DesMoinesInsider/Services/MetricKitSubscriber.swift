import Foundation
import os
import MetricKit

/// Collects and logs MetricKit performance payloads from production devices.
///
/// MetricKit is free, built into iOS, and provides automatic insights into
/// app launch time, hang rate, memory usage, and battery impact.
/// Payloads are delivered approximately every 24 hours.
@MainActor
final class MetricKitSubscriber: NSObject, MXMetricManagerSubscriber {
    static let shared = MetricKitSubscriber()

    private override init() {
        super.init()
        MXMetricManager.shared.add(self)
    }

    // No deinit: this is a process-lifetime singleton (DesMoinesInsiderApp holds
    // it) so it's never deallocated. A deinit calling the main-actor
    // MXMetricManager.shared from a nonisolated context was both dead code and
    // unsafe under strict concurrency (IOS-AUDIT-PERF-007).

    // MARK: - MXMetricManagerSubscriber

    nonisolated func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            let json = payload.jsonRepresentation()
            Task { @MainActor in
                Self.logMetricSummary(json)
            }
        }
    }

    /// Most crash reports a phone sends per payload. A crash loop should not
    /// turn into a flood of log-error calls.
    nonisolated static let maxCrashReportsPerPayload = 5

    /// Forwards MetricKit crash diagnostics to log-error (IOS-DD-PLATFORM-17).
    /// A Swift trap (SIGTRAP) leaves the in-process handler nothing but a
    /// signal number, so MetricKit's call-stack tree is the only record of
    /// where it happened.
    nonisolated func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            let json = payload.jsonRepresentation()
            Task { @MainActor in
                AppLogger.general.warning("MetricKit diagnostic received (\(json.count) bytes)")
            }
            for crash in (payload.crashDiagnostics ?? []).prefix(Self.maxCrashReportsPerPayload) {
                let summary = Self.summary(
                    exceptionType: crash.exceptionType?.intValue,
                    signal: crash.signal?.intValue,
                    terminationReason: crash.terminationReason,
                    callStackJSON: crash.callStackTree.jsonRepresentation()
                )
                let build = crash.metaData.applicationBuildVersion
                Task.detached(priority: .utility) {
                    _ = await ErrorSink.send(
                        message: summary,
                        component: "ios-crash",
                        action: "metrickit",
                        route: "app/\(build)",
                        severity: "critical"
                    )
                }
            }
        }
    }

    /// One line for a MetricKit crash: exception type, signal, the start of
    /// the termination reason, and the first frame in the app binary as
    /// DesMoinesInsider+0x<offset> (symbolicate with the dSYM). Pure, so the
    /// JSON walk is testable with a fixture.
    nonisolated static func summary(
        exceptionType: Int?,
        signal: Int?,
        terminationReason: String?,
        callStackJSON: Data
    ) -> String {
        var parts: [String] = []
        parts.append("exc=\(exceptionType.map(String.init) ?? "?")")
        parts.append("sig=\(signal.map(String.init) ?? "?")")
        if let reason = terminationReason, !reason.isEmpty {
            parts.append(String(reason.prefix(200)))
        }
        if let frame = firstAppFrame(in: callStackJSON) {
            parts.append(frame)
        }
        return parts.joined(separator: " ")
    }

    /// Walks callStacks[].callStackRootFrames[] and their subFrames, depth
    /// first, for the first frame whose binaryName is the app.
    nonisolated private static func firstAppFrame(in json: Data) -> String? {
        guard let root = try? JSONSerialization.jsonObject(with: json) as? [String: Any],
              let stacks = root["callStacks"] as? [[String: Any]] else { return nil }
        func search(_ frames: [[String: Any]]) -> String? {
            for frame in frames {
                if frame["binaryName"] as? String == "DesMoinesInsider",
                   let offset = (frame["offsetIntoBinaryTextSegment"] as? NSNumber)?.intValue {
                    return "DesMoinesInsider+0x" + String(offset, radix: 16)
                }
                if let sub = frame["subFrames"] as? [[String: Any]], let found = search(sub) {
                    return found
                }
            }
            return nil
        }
        for stack in stacks {
            if let frames = stack["callStackRootFrames"] as? [[String: Any]], let found = search(frames) {
                return found
            }
        }
        return nil
    }

    // MARK: - Summary Logging

    private static func logMetricSummary(_ json: Data) {
        guard let dict = try? JSONSerialization.jsonObject(with: json) as? [String: Any] else { return }

        var summary: [String] = []

        if let launch = dict["applicationLaunchMetrics"] as? [String: Any],
           let resumeTime = (launch["histogrammedResumeTime"] as? [String: Any])?["averageValue"] as? Double {
            summary.append("resume: \(String(format: "%.0f", resumeTime))ms")
        }

        if let hang = dict["applicationResponsivenessMetrics"] as? [String: Any],
           let hangTime = hang["histogrammedApplicationHangTime"] as? [String: Any],
           let avgHang = hangTime["averageValue"] as? Double {
            summary.append("hang: \(String(format: "%.0f", avgHang))ms")
        }

        if let memory = dict["memoryMetrics"] as? [String: Any],
           let peak = memory["peakMemoryUsage"] as? [String: Any],
           let avgPeak = peak["averageValue"] as? Double {
            summary.append("peakMem: \(String(format: "%.0f", avgPeak / 1_000_000))MB")
        }

        AppLogger.general.info("MetricKit summary: \(summary.joined(separator: ", "))")
    }
}
