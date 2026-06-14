import SwiftUI
import WebKit

/// In-app web view for displaying Privacy Policy, Terms of Service, etc.
struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        // Only load http/https; never a content-supplied file:/javascript:/etc.
        // scheme (IOS-AUDIT-SEC-002).
        if url.isSafeWebLink {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        /// Divert any cross-host top-level navigation (not just user taps) to
        /// Safari, so server redirects / JS `window.location` changes can't load
        /// another host inside the app's trust context (IOS-AUDIT-SEC-003). Also
        /// block non-http(s) schemes outright (IOS-AUDIT-SEC-002).
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let requestURL = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            // Reject non-web schemes (file:, javascript:, etc.).
            guard requestURL.isSafeWebLink else {
                decisionHandler(.cancel)
                return
            }

            // Same-host (or first navigation) loads in-app; a different host on a
            // top-level navigation of any type goes to Safari.
            let isTopLevel = navigationAction.targetFrame?.isMainFrame ?? true
            if let initialHost = webView.url?.host,
               let targetHost = requestURL.host,
               isTopLevel,
               targetHost != initialHost {
                UIApplication.shared.open(requestURL)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }
    }
}

/// Wraps WebView in a NavigationStack-ready page with title and dismiss.
struct WebViewPage: View {
    let title: String
    let url: URL

    var body: some View {
        Group {
            if url.isSafeWebLink {
                WebView(url: url)
            } else {
                // Content-supplied URL with an unexpected scheme — don't load it
                // (IOS-AUDIT-SEC-002); show a neutral message instead of a blank
                // web view.
                ContentUnavailableView(
                    "Can't open link",
                    systemImage: "exclamationmark.triangle",
                    description: Text("This link can't be opened safely.")
                )
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
