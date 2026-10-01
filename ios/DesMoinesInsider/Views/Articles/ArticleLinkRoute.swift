import Foundation

/// Where a link inside an article body goes (IOS-DD-GUIDES-21). A port of the
/// web's classifyArticleHref (src/lib/articleHubs.ts):
///
/// - a site path ("/restaurants/zombie-burger") or an absolute URL on the
///   site's own host is `.site`, which the reader opens natively when
///   DeepLinkHandler knows the route;
/// - another http(s) host is `.external`, opened in the in-app browser;
/// - anything else (mailto:, tel:, javascript:, a bare fragment) is `.drop`.
///
/// The reader used to drop every site path, because a scheme-less URL fails
/// isSafeWebLink, and sent full site URLs to a web page instead of the
/// native listing.
enum ArticleLinkRoute: Equatable {
    case site(URL)
    case external(URL)
    case drop

    static func classify(_ url: URL, site: URL = Config.siteURL) -> ArticleLinkRoute {
        let raw = url.relativeString.trimmingCharacters(in: .whitespacesAndNewlines)

        // Protocol-relative: give it https and classify again.
        if raw.hasPrefix("//") {
            guard let absolute = URL(string: "https:" + raw) else { return .drop }
            return classify(absolute, site: site)
        }

        // A site path.
        if raw.hasPrefix("/") {
            guard let resolved = URL(string: raw, relativeTo: site)?.absoluteURL else { return .drop }
            return .site(resolved)
        }

        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = url.host?.lowercased(), !host.isEmpty else {
            return .drop
        }
        if bareHost(host) == bareHost(site.host?.lowercased() ?? "") {
            return .site(url)
        }
        return .external(url)
    }

    private static func bareHost(_ host: String) -> String {
        host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}
