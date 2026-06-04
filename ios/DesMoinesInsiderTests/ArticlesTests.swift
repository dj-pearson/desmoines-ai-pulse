import XCTest
@testable import DesMoinesInsider

/// Pure-logic coverage for IOS-PARITY-002. The networked fetch flow and SwiftUI
/// screens are exercised by the macOS build + UI tests in CI; these lock the
/// decode contract (shared with the web `articles` table), the reading-time and
/// summary heuristics, the card adapter, and the native markdown parser.
final class ArticlesTests: XCTestCase {

    // MARK: Decoding — articles table row (mirrors useArticles.ts)

    func testArticleDecodesPublishedRow() throws {
        let json = """
        {
          "id": "a-1",
          "title": "Best Patios in Des Moines",
          "slug": "best-patios",
          "content": "# Patios\\n\\nGreat outdoor seating.",
          "excerpt": "Where to sit outside.",
          "featured_image_url": "https://example.com/p.jpg",
          "author_id": "u-1",
          "status": "published",
          "category": "Dining",
          "tags": ["patios", "summer"],
          "seo_title": "Best Patios",
          "seo_description": "Patio guide",
          "seo_keywords": ["patio"],
          "view_count": 42,
          "published_at": "2026-05-20T14:00:00Z",
          "created_at": "2026-05-19T10:00:00Z",
          "updated_at": "2026-05-20T14:00:00Z"
        }
        """.data(using: .utf8)!

        let article = try JSONDecoder().decode(Article.self, from: json)
        XCTAssertEqual(article.id, "a-1")
        XCTAssertEqual(article.slug, "best-patios")
        XCTAssertEqual(article.displayCategory, "Dining")
        XCTAssertEqual(article.tags, ["patios", "summer"])
        XCTAssertEqual(article.viewCount, 42)
        XCTAssertNotNil(article.date)
        XCTAssertEqual(article.webURL.absoluteString, "https://desmoinesinsider.com/articles/best-patios")
    }

    func testArticleDecodesMinimalRow() throws {
        // Rows can be missing optional fields (no excerpt/image/category/tags).
        let json = """
        {
          "id": "a-2", "title": "Untitled Guide", "slug": "untitled",
          "content": "Some words here.", "status": "published",
          "created_at": "2026-06-01T10:00:00Z", "updated_at": "2026-06-01T10:00:00Z"
        }
        """.data(using: .utf8)!
        let article = try JSONDecoder().decode(Article.self, from: json)
        XCTAssertNil(article.excerpt)
        XCTAssertNil(article.publishedAt)
        // Falls back to created_at for date and "General" for category.
        XCTAssertNotNil(article.date)
        XCTAssertEqual(article.displayCategory, "General")
    }

    // MARK: Reading time + summary heuristics

    func testReadingMinutesMatchesWordHeuristic() {
        let words = Array(repeating: "word", count: 400).joined(separator: " ")
        let article = makeArticle(content: words)
        // 400 words / 200 wpm = 2 minutes.
        XCTAssertEqual(article.readingMinutes, 2)
        XCTAssertEqual(article.readingTimeText, "2 min read")
    }

    func testReadingMinutesIsAtLeastOne() {
        XCTAssertEqual(makeArticle(content: "Just a few words.").readingMinutes, 1)
    }

    func testDisplaySummaryDerivesLeadWhenNoExcerpt() {
        let content = "# Heading\n\n![img](https://x/y.jpg)\n\nThis **is** the lead paragraph."
        let article = makeArticle(content: content, excerpt: nil)
        XCTAssertEqual(article.displaySummary, "This is the lead paragraph.")
    }

    func testDisplaySummaryPrefersExcerpt() {
        let article = makeArticle(content: "# H\n\nBody.", excerpt: "Hand-written excerpt.")
        XCTAssertEqual(article.displaySummary, "Hand-written excerpt.")
    }

    // MARK: Card adapter (IOS-IA-003)

    func testCardDataExposesCategoryAndReadingTime() {
        let article = makeArticle(content: Array(repeating: "w", count: 600).joined(separator: " "))
        let data = article.cardData
        XCTAssertEqual(data.title, article.title)
        XCTAssertEqual(data.metaPrimary?.text, "General")
        XCTAssertTrue(data.pills.contains { $0.text == "3 min read" })
    }

    // MARK: Markdown parser

    func testMarkdownParsesHeadingsParagraphsAndImages() {
        let md = """
        # Title

        A paragraph of text.

        ![alt text](https://example.com/i.jpg)

        ## Subhead
        """
        let blocks = MarkdownBlock.parse(md)
        guard case let .heading(level1, text1) = blocks[0] else {
            return XCTFail("expected heading first, got \(blocks[0])")
        }
        XCTAssertEqual(level1, 1)
        XCTAssertEqual(text1, "Title")

        guard case let .paragraph(p) = blocks[1] else {
            return XCTFail("expected paragraph, got \(blocks[1])")
        }
        XCTAssertEqual(p, "A paragraph of text.")

        guard case let .image(url, alt) = blocks[2] else {
            return XCTFail("expected image, got \(blocks[2])")
        }
        XCTAssertEqual(url, "https://example.com/i.jpg")
        XCTAssertEqual(alt, "alt text")

        guard case let .heading(level2, _) = blocks[3] else {
            return XCTFail("expected subhead, got \(blocks[3])")
        }
        XCTAssertEqual(level2, 2)
    }

    func testMarkdownParsesBulletAndOrderedLists() {
        let md = """
        - first
        - second

        1. one
        2. two
        """
        let blocks = MarkdownBlock.parse(md)
        guard case let .bulletList(bullets) = blocks[0] else {
            return XCTFail("expected bullet list, got \(blocks[0])")
        }
        XCTAssertEqual(bullets, ["first", "second"])

        guard case let .orderedList(ordered) = blocks[1] else {
            return XCTFail("expected ordered list, got \(blocks[1])")
        }
        XCTAssertEqual(ordered, ["one", "two"])
    }

    func testMarkdownParsesBlockquoteAndRule() {
        let md = """
        > a wise quote

        ---
        """
        let blocks = MarkdownBlock.parse(md)
        guard case let .quote(q) = blocks[0] else {
            return XCTFail("expected quote, got \(blocks[0])")
        }
        XCTAssertEqual(q, "a wise quote")

        guard case .divider = blocks[1] else {
            return XCTFail("expected divider, got \(blocks[1])")
        }
    }

    // MARK: - Helpers

    private func makeArticle(content: String, excerpt: String? = nil) -> Article {
        Article(
            id: "t", title: "Test Article", slug: "test", content: content,
            excerpt: excerpt, featuredImageUrl: nil, category: nil, tags: nil,
            seoTitle: nil, seoDescription: nil, viewCount: nil,
            publishedAt: "2026-05-20T14:00:00Z",
            createdAt: "2026-05-19T10:00:00Z", updatedAt: "2026-05-20T14:00:00Z"
        )
    }
}
