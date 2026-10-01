import Foundation

/// App-wide toast for surfaces that have no toast of their own, e.g. a
/// ContentCard built without a toast binding (IOS-DD-SAVED-15). MainTabView
/// renders `message` with `.toastOverlay(message:)`.
@MainActor
@Observable
final class AppToastCenter {
    static let shared = AppToastCenter()

    var message: ToastMessage?

    private init() {}

    func show(_ message: ToastMessage) {
        self.message = message
    }
}
