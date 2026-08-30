import Foundation
import Network

/// Monitors network connectivity and publishes changes to SwiftUI views.
@MainActor
@Observable
final class NetworkMonitor {
    static let shared = NetworkMonitor()

    private(set) var isConnected = true

    /// Briefly true (5 seconds) after reconnecting from an offline state.
    private(set) var showReconnected = false

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "NetworkMonitor")

    /// Tracks whether the device was offline so we can show "Back online".
    private var wasOffline = false
    private var reconnectedTask: Task<Void, Never>?

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.handlePathUpdate(path)
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }

    private func handlePathUpdate(_ path: NWPath) {
        let connected = path.status == .satisfied

        if !connected {
            wasOffline = true
            showReconnected = false
            reconnectedTask?.cancel()
        }

        if connected && wasOffline {
            wasOffline = false
            showReconnected = true
            reconnectedTask?.cancel()
            reconnectedTask = Task {
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled else { return }
                showReconnected = false
            }
            // Flush any ad telemetry that queued while offline (IOS-ADS-014).
            Task { await AdTrackingService.shared.flushPendingEvents() }
        }

        isConnected = connected
    }
}
