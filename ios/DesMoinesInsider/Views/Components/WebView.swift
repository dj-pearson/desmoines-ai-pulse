import SwiftUI
import WebKit

/// Where a WebView load stands, for WebViewPage's spinner and error state.
enum WebLoadState: Equatable {
    case loading
    case loaded
    case failed
}

/// In-app web view for displaying Privacy Policy, Terms of Service, etc.
struct WebView: UIViewRepresentable {
    let url: URL
    @Binding var state: WebLoadState

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        // Transparent until the page paints, so the loading overlay shows
        // instead of a white flash in dark mode.
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.state = $state
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(initialHost: url.host, state: $state)
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        let initialHost: String?
        var state: Binding<WebLoadState>

        init(initialHost: String?, state: Binding<WebLoadState>) {
            self.initialHost = initialHost
            self.state = state
        }

        /// User-intent schemes handed to the system on a tap.
        static let externalSchemes: Set<String> = ["tel", "mailto", "sms", "facetime", "maps"]

        /// Divert untrusted navigations out of the in-app WKWebView based on the
        /// resolved target host/scheme — NOT only `navigationType == .linkActivated`
        /// (IOS-AUDIT-SEC-003). Server 302s, meta-refresh, form posts, and JS
        /// `window.location` cross-host hops never load another host inside the
        /// app's trust context.
        ///
        /// Only a tap may leave the app (IOS-DD-PLATFORM-11). Subframes (an
        /// embedded video) load normally, and a script redirect or a tel: the
        /// page fires on its own is cancelled rather than opened.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let requestURL = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            if navigationAction.targetFrame?.isMainFrame == false {
                decisionHandler(.allow)
                return
            }

            let scheme = requestURL.scheme?.lowercased()
            let tapped = navigationAction.navigationType == .linkActivated

            // Non-web schemes never load in the WebView.
            if scheme != "http" && scheme != "https" {
                if tapped, let scheme, Self.externalSchemes.contains(scheme) {
                    UIApplication.shared.open(requestURL)
                }
                decisionHandler(.cancel)
                return
            }

            // A main-frame hop to another site opens in Safari when tapped and
            // is dropped otherwise. The first load and same-site links stay.
            if let initialHost, let targetHost = requestURL.host,
               !Self.sameSite(targetHost, initialHost) {
                if tapped { UIApplication.shared.open(requestURL) }
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            state.wrappedValue = .loading
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            state.wrappedValue = .loaded
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            markFailed(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            markFailed(error)
        }

        /// A cancelled load (-999, e.g. a policy cancel or a new navigation
        /// replacing this one) is not a failure.
        private func markFailed(_ error: Error) {
            if (error as NSError).code == NSURLErrorCancelled { return }
            state.wrappedValue = .failed
        }

        /// Exact host match, ignoring case, or both hosts on
        /// desmoinesinsider.com. The old last-two-labels rule treated
        /// a.co.uk and b.co.uk, or two *.pages.dev sites, as one site
        /// (IOS-DD-PLATFORM-11).
        static func sameSite(_ a: String, _ b: String) -> Bool {
            let x = a.lowercased()
            let y = b.lowercased()
            if x == y { return true }
            func firstParty(_ host: String) -> Bool {
                host == "desmoinesinsider.com" || host.hasSuffix(".desmoinesinsider.com")
            }
            return firstParty(x) && firstParty(y)
        }
    }
}

/// Wraps WebView in a NavigationStack-ready page with title and dismiss, a
/// spinner while loading and a way out when the page fails.
struct WebViewPage: View {
    let title: String
    let url: URL

    @State private var state: WebLoadState = .loading
    /// A new WebView (and a fresh load) on Try Again.
    @State private var reloadToken = UUID()
    @Environment(\.openURL) private var openURL

    var body: some View {
        WebView(url: url, state: $state)
            .id(reloadToken)
            .overlay { loadOverlay }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private var loadOverlay: some View {
        switch state {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .loaded:
            EmptyView()
        case .failed:
            ContentUnavailableView {
                Label("Couldn't load this page", systemImage: "wifi.exclamationmark")
            } actions: {
                Button("Try Again") {
                    state = .loading
                    reloadToken = UUID()
                }
                .buttonStyle(.borderedProminent)
                Button("Open in Safari") { openURL(url) }
            }
            .background(Color(.systemBackground))
        }
    }
}
