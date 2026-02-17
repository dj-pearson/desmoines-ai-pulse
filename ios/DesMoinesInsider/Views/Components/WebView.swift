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
        /// Open external links (different host) in Safari instead of the in-app browser.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let requestURL = navigationAction.request.url,
                  let initialHost = webView.url?.host,
                  let targetHost = requestURL.host,
                  navigationAction.navigationType == .linkActivated,
                  targetHost != initialHost else {
                decisionHandler(.allow)
                return
            }

            // External link — open in Safari
            UIApplication.shared.open(requestURL)
            decisionHandler(.cancel)
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
