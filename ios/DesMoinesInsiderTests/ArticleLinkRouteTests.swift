import XCTest
@testable import DesMoinesInsider

/// Article body link routing (IOS-DD-GUIDES-21), ported from the web's
/// classifyArticleHref (src/lib/articleHubs.ts).
final class ArticleLinkRouteTests: XCTestCase {

    private let site = URL(string: "https://desmoinesinsider.com")!

    private func siteURLString(_ route: ArticleLinkRoute) -> String? {
        if case .site(let url) = route { return url.absoluteString }
        return nil
    }

    func testSitePathResolvesAgainstTheSite() {
        let route = ArticleLinkRoute.classify(URL(string: "/restaurants/zombie-burger")!, site: site)
        XCTAssertEqual(siteURLString(route), "https://desmoinesinsider.com/restaurants/zombie-burger")
    }

    func testWwwSiteURLIsSite() {
        let raw = "https://www.desmoinesinsider.com/events/550e8400-e29b-41d4-a716-446655440000"
        let route = ArticleLinkRoute.classify(URL(string: raw)!, site: site)
        XCTAssertEqual(siteURLString(route), raw)
    }

    func testProtocolRelativeOtherHostIsExternal() {
        let route = ArticleLinkRoute.classify(URL(string: "//cdn.example.com/x")!, site: site)
        XCTAssertEqual(route, .external(URL(string: "https://cdn.example.com/x")!))
    }

    func testMailtoIsDropped() {
        XCTAssertEqual(ArticleLinkRoute.classify(URL(string: "mailto:a@b.c")!, site: site), .drop)
        XCTAssertEqual(ArticleLinkRoute.classify(URL(string: "javascript:alert(1)")!, site: site), .drop)
    }

    func testLookalikeHostIsExternal() {
        let url = URL(string: "https://evil-desmoinesinsider.com/x")!
        XCTAssertEqual(ArticleLinkRoute.classify(url, site: site), .external(url))
    }

    func testSiteLinkMapsToNativePresentation() {
        let presentation = ArticleDetailView.nativePresentation(for: .restaurant(id: "zombie-burger"))
        XCTAssertEqual(presentation?.id, "restaurant-zombie-burger")
        XCTAssertNil(ArticleDetailView.nativePresentation(for: .tab(.home)))
        XCTAssertNil(ArticleDetailView.nativePresentation(for: nil))
    }

    func testNeighborhoodLinkOpensTheNativeGuide() {
        // IOS-AUDIT-FEAT-038: a guide that links /neighborhoods/<slug>.
        let presentation = ArticleDetailView.nativePresentation(for: .neighborhood(slug: "ankeny"))
        XCTAssertEqual(presentation?.id, "neighborhood-ankeny")
        XCTAssertNil(ArticleDetailView.nativePresentation(for: .neighborhood(slug: "not-a-place")))
    }

    func testBestOfCategoryLinkOpensNatively() {
        // IOS-AUDIT-FEAT-040: a guide that links /best-of/<slug>.
        let presentation = ArticleDetailView.nativePresentation(for: .bestOfCategory(slug: "best-pizza"))
        XCTAssertEqual(presentation?.id, "best-of-best-pizza")
    }

    func testEventSeriesLinkOpensNatively() {
        // IOS-AUDIT-FEAT-046: a guide that links /events/series/<slug>.
        let presentation = ArticleDetailView.nativePresentation(for: .eventSeries(slug: "panda-fest"))
        XCTAssertEqual(presentation?.id, "event-series-panda-fest")
        XCTAssertNil(ArticleDetailView.nativePresentation(for: .eventSeries(slug: "not-a-series")))
    }
}
