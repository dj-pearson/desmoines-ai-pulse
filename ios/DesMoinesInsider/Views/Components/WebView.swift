import SwiftUI
import WebKit

/// In-app web view for displaying Privacy Policy, Terms of Service, etc.
struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        /// Divert untrusted navigations out of the in-app WKWebView based on the
        /// resolved target host/scheme — NOT only `navigationType == .linkActivated`
        /// (IOS-AUDIT-SEC-003). Server 302s, meta-refresh, form posts, and JS
        /// `window.location` cross-host hops are all caught, so an untrusted page
        /// can't load another host inside the app's trust context.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let requestURL = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            let scheme = requestURL.scheme?.lowercased()

            // Non-web schemes never load in the WebView. Hand off the few
            // user-intent schemes to the system; drop anything else.
            if scheme != "http" && scheme != "https" {
                if let scheme, ["tel", "mailto", "sms", "facetime", "maps"].contains(scheme) {
                    UIApplication.shared.open(requestURL)
                }
                decisionHandler(.cancel)
                return
            }

            // Cross-registrable-domain navigation of any type → open externally.
            // First load (no committed URL yet) and same-domain stay in-app.
            if let initialHost = webView.url?.host,
               let targetHost = requestURL.host,
               !Self.sameRegistrableDomain(targetHost, initialHost) {
                UIApplication.shared.open(requestURL)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        /// Compares the registrable domain (eTLD+1 approximation: the last two
        /// dot-separated labels) so `www.example.com` and `m.example.com` match
        /// but `evil.com` does not. Avoids treating subdomain hops as external.
        static func sameRegistrableDomain(_ a: String, _ b: String) -> Bool {
            func registrable(_ host: String) -> String {
                let labels = host.lowercased().split(separator: ".")
                guard labels.count > 2 else { return host.lowercased() }
                return labels.suffix(2).joined(separator: ".")
            }
            return registrable(a) == registrable(b)
        }
    }
}

/// Wraps WebView in a NavigationStack-ready page with title and dismiss.
struct WebViewPage: View {
    let title: String
    let url: URL

    var body: some View {
        WebView(url: url)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
    }
}
