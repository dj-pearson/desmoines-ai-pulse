import XCTest
@testable import DesMoinesInsider

/// Pure-logic coverage for IOS-PARITY-003. The networked fetch and SwiftUI
/// screens are exercised by the macOS build + UI tests in CI; these lock the
/// decode contract (shared with the web `hotels` table), the affiliate/booking
/// URL resolution, and the display heuristics.
final class HotelsTests: XCTestCase {

    // MARK: Decoding — hotels table row (mirrors useHotels.ts)

    func testHotelDecodesFullRow() throws {
        let json = """
        {
          "id": "h-1", "name": "Surety Hotel", "slug": "surety-hotel",
          "description": "Historic downtown landmark.",
          "short_description": "Downtown luxury.",
          "address": "206 6th Ave", "city": "Des Moines", "state": "IA", "zip": "50309",
          "latitude": 41.5871, "longitude": -93.6259,
          "area": "Downtown", "phone": "515-619-8403", "email": null,
          "website": "https://suretyhotel.com",
          "affiliate_url": "https://partner.example.com/surety?aff=dsm",
          "affiliate_provider": "Hilton",
          "image_url": "https://img/h.jpg",
          "gallery_urls": ["https://img/h.jpg", "https://img/2.jpg", "https://img/3.jpg"],
          "star_rating": 4.6, "price_range": "$$$", "avg_nightly_rate": 229,
          "amenities": ["Free WiFi", "Rooftop Bar"], "hotel_type": "Boutique",
          "chain_name": "Hilton Curio", "is_featured": true, "is_active": true,
          "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!

        let hotel = try JSONDecoder().decode(Hotel.self, from: json)
        XCTAssertEqual(hotel.id, "h-1")
        XCTAssertEqual(hotel.displayArea, "Downtown")
        XCTAssertEqual(hotel.priceText, "$$$")
        XCTAssertEqual(hotel.starText, "4.6")
        XCTAssertTrue(hotel.hasAffiliate)
        XCTAssertEqual(hotel.bookProviderName, "Hilton")
        XCTAssertNotNil(hotel.coordinate)
        XCTAssertEqual(hotel.webURL.absoluteString, "https://desmoinesinsider.com/stay/surety-hotel")
        // Hero first, deduped.
        XCTAssertEqual(hotel.galleryImageURLs, ["https://img/h.jpg", "https://img/2.jpg", "https://img/3.jpg"])
    }

    func testHotelDecodesMinimalRow() throws {
        let json = """
        {
          "id": "h-2", "name": "Budget Inn", "slug": "budget-inn",
          "city": "West Des Moines", "is_active": true
        }
        """.data(using: .utf8)!
        let hotel = try JSONDecoder().decode(Hotel.self, from: json)
        XCTAssertNil(hotel.affiliateUrl)
        XCTAssertFalse(hotel.hasAffiliate)
        // Falls back to city for area.
        XCTAssertEqual(hotel.displayArea, "West Des Moines")
        XCTAssertNil(hotel.bookURL) // no affiliate, no website
        XCTAssertNil(hotel.coordinate)
    }

    // MARK: Booking URL resolution (the revenue path)

    func testBookURLPrefersAffiliateOverWebsite() {
        let hotel = makeHotel(affiliate: "https://aff.example.com/go", website: "https://hotel.com")
        XCTAssertEqual(hotel.bookURL?.absoluteString, "https://aff.example.com/go")
        XCTAssertTrue(hotel.hasAffiliate)
    }

    func testBookURLFallsBackToWebsite() {
        let hotel = makeHotel(affiliate: nil, website: "hotel.com")
        // Bare domain gets https:// prepended.
        XCTAssertEqual(hotel.bookURL?.absoluteString, "https://hotel.com")
        XCTAssertFalse(hotel.hasAffiliate)
    }

    func testBookURLNilWhenNeither() {
        XCTAssertNil(makeHotel(affiliate: nil, website: nil).bookURL)
    }

    func testAffiliatePartnerKeyIsSlugified() {
        let hotel = makeHotel(affiliate: "https://x", website: nil, provider: "Hilton Honors")
        XCTAssertEqual(hotel.affiliatePartnerKey, "hilton_honors")
    }

    // MARK: Price + card adapter

    func testPriceTextFallsBackToNightlyRate() {
        var hotel = makeHotel(affiliate: nil, website: nil)
        hotel.priceRange = nil
        hotel.avgNightlyRate = 189
        XCTAssertEqual(hotel.priceText, "$189/night")
    }

    func testCardDataExposesStarPriceAndArea() {
        let data = Hotel.preview.cardData
        XCTAssertEqual(data.title, "Surety Hotel")
        XCTAssertEqual(data.metaSecondary?.text, "Downtown")
        XCTAssertTrue(data.pills.contains { $0.text == "4.6" })
        XCTAssertTrue(data.pills.contains { $0.text == "$$$" })
        XCTAssertTrue(data.isFeatured)
    }

    // MARK: Sort enum parity

    func testSortOptionsCoverWebCases() {
        let labels = HotelsService.Sort.allCases.map(\.rawValue)
        XCTAssertEqual(labels, ["Featured", "Price: Low", "Price: High", "Top rated", "Name"])
    }

    // MARK: - Helpers

    private func makeHotel(affiliate: String?, website: String?, provider: String? = nil) -> Hotel {
        Hotel(
            id: "t", name: "Test Hotel", slug: "test-hotel",
            description: nil, shortDescription: nil,
            address: nil, city: "Des Moines", state: "IA", area: nil,
            phone: nil, website: website,
            affiliateUrl: affiliate, affiliateProvider: provider,
            imageUrl: nil, galleryUrls: nil,
            starRating: 4.0, priceRange: "$$", avgNightlyRate: nil,
            amenities: nil, hotelType: "Hotel", chainName: nil,
            latitude: nil, longitude: nil, isFeatured: false, isActive: true
        )
    }
}
