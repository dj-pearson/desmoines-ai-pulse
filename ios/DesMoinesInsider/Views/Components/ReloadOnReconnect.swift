import SwiftUI

// MARK: - Reload when connectivity returns
//
// A screen that failed to load while offline showed "You're offline", then a
// green "Back online" banner a moment later — and then went on showing nothing.
// The data never came back until the user thought to pull to refresh, so the
// banner announced a recovery the app had not actually performed.
//
// This runs `action` on the false → true edge of `NetworkMonitor.isConnected`.
// `shouldReload` keeps it to screens that need it: every tab the user has
// visited stays alive in the hierarchy, so an unconditional reload would refetch
// all of them at once on the first bar of signal. Pass the screen's own
// emptiness (`viewModel.events.isEmpty`), which is exactly the state the user is
// looking at when the reconnect matters.
struct ReloadOnReconnect: ViewModifier {
    let shouldReload: Bool
    let action: () async -> Void

    @State private var network = NetworkMonitor.shared

    func body(content: Content) -> some View {
        content.onChange(of: network.isConnected) { wasConnected, isConnected in
            guard !wasConnected, isConnected, shouldReload else { return }
            Task { await action() }
        }
    }
}

extension View {
    /// Reloads when the device comes back online, if `shouldReload` is true at
    /// that moment. See `ReloadOnReconnect`.
    func reloadOnReconnect(if shouldReload: Bool, _ action: @escaping () async -> Void) -> some View {
        modifier(ReloadOnReconnect(shouldReload: shouldReload, action: action))
    }
}
