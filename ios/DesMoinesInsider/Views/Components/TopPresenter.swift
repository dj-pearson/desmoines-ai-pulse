import UIKit

/// UIKit glue for presenting a deep link over whatever is on screen
/// (IOS-DD-PLATFORM-07).
///
/// SwiftUI refuses a second sheet while one is up, and child tabs present
/// their own sheets that MainTabView cannot clear through state. This
/// dismisses everything the key window's root controller has presented, then
/// runs `then`. No unit test: verify by hand (open an event detail sheet, tap
/// a reminder notification for another event, the new event opens).
enum TopPresenter {
    @MainActor
    private static var keyRoot: UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
    }

    /// Closes every sheet and cover without animation. Used when the
    /// biometric lock engages: the lock is an overlay on the root content
    /// (IOS-DD-PLATFORM-05), and a sheet presented above the root would
    /// otherwise stay readable over it.
    @MainActor
    static func dismissPresented() {
        guard let root = keyRoot, root.presentedViewController != nil else { return }
        root.dismiss(animated: false)
    }

    @MainActor
    static func dismissAll(then action: @escaping () -> Void) {
        guard let root = keyRoot, let presented = root.presentedViewController else {
            Task { @MainActor in
                await Task.yield()
                action()
            }
            return
        }

        // Already on its way out (SwiftUI started the dismissal): wait for
        // that transition rather than issuing a second dismiss, whose
        // completion UIKit may never call.
        if presented.isBeingDismissed {
            if let coordinator = presented.transitionCoordinator {
                coordinator.animate(alongsideTransition: nil) { _ in action() }
            } else {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(400))
                    action()
                }
            }
            return
        }

        root.dismiss(animated: true) { action() }
    }
}
