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

    nonisolated func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            let json = payload.jsonRepresentation()
            Task { @MainActor in
                AppLogger.general.warning("MetricKit diagnostic received (\(json.count) bytes)")
            }
        }
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
