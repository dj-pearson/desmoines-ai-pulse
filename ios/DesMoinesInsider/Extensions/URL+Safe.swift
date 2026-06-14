import Foundation

extension URL {
    /// True only for `http`/`https` links. Use to gate any URL that originates
    /// from server/content (event source URLs, restaurant/attraction/hotel
    /// websites, article/sponsored targets) before opening it in a browser or
    /// WebView, so a compromised content row can't smuggle a `file:`, `tel:`,
    /// `javascript:`, or other non-web scheme into the app (IOS-AUDIT-SEC-002).
    var isSafeWebLink: Bool {
        guard let scheme = scheme?.lowercased() else { return false }
        return scheme == "http" || scheme == "https"
    }
}
