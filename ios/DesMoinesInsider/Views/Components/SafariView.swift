import SwiftUI
import SafariServices

/// Presents an `SFSafariViewController` as a SwiftUI sheet. Used for affiliate
/// booking clickouts (IOS-PARITY-003) where we want the real partner site, its
/// cookies/login, and Apple's trusted browser chrome — booking happens on the
/// partner, outside Apple IAP.
///
/// Present via `.sheet(item:)` with an `AdTarget` (the shared identifiable URL
/// wrapper), e.g.:
///
///     .sheet(item: $bookTarget) { target in
///         SafariView(url: target.url).ignoresSafeArea()
///     }
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        let controller = SFSafariViewController(url: url, configuration: config)
        controller.dismissButtonStyle = .done
        controller.preferredControlTintColor = UIColor(named: "AccentColor") ?? .systemBlue
        return controller
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}
