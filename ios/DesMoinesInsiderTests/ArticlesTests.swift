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

    // MARK: - IOS-AUDIT-BUG-005: one bad row must not take the screen down

    /// Decodable stops at the first bad element, so a single article with a null
    /// body used to fail the decode of the ENTIRE array -- the Articles screen
    /// went blank rather than hiding one card.
    ///
    /// The column is NOT NULL today and 0 of 18 published rows are empty, so this
    /// is hardening against a schema the database presently forbids. What is NOT
    /// hypothetical is the empty string, which NOT NULL permits and which the
    /// third case here covers.
    func testArticleDecodesWithNullContent() throws {
        let json = """
        {
          "id": "a-null",
          "title": "Body missing",
          "slug": "body-missing",
          "content": null,
          "published_at": "2026-05-20T14:00:00Z"
        }
        """.data(using: .utf8)!

        let article = try JSONDecoder().decode(Article.self, from: json)
        XCTAssertEqual(article.content, "")
        XCTAssertFalse(article.hasContent)
        XCTAssertEqual(article.title, "Body missing")
    }

    func testArticleDecodesWithMissingContentKey() throws {
        let json = """
        {"id": "a-absent", "title": "No key", "slug": "no-key"}
        """.data(using: .utf8)!

        let article = try JSONDecoder().decode(Article.self, from: json)
        XCTAssertEqual(article.content, "")
        XCTAssertFalse(article.hasContent)
    }

    func testWhitespaceOnlyContentCountsAsNoBody() throws {
        // NOT NULL permits this today, so it is the case that can actually occur.
        let json = """
        {"id": "a-blank", "title": "Blank", "slug": "blank", "content": "    "}
        """.data(using: .utf8)!

        let article = try JSONDecoder().decode(Article.self, from: json)
        XCTAssertFalse(article.hasContent, "whitespace is not a body")

        // Newlines and tabs too. Built from scalars rather than escapes: a real
        // newline inside the JSON literal above breaks the multi-line string,
        // which is how the first version of this test failed to compile.
        let mixedWhitespace = [" ", String(UnicodeScalar(10)), String(UnicodeScalar(9))].joined()
        XCTAssertFalse(Article(id: "n", title: "T", slug: "s", content: mixedWhitespace).hasContent)
    }

    /// The whole point: an array containing one bad row still decodes the rest.
    func testArrayWithOneNullContentRowStillDecodesEveryArticle() throws {
        let json = """
        [
          {"id": "a-1", "title": "Fine", "slug": "fine", "content": "# Body"},
          {"id": "a-2", "title": "Broken", "slug": "broken", "content": null},
          {"id": "a-3", "title": "Also fine", "slug": "also-fine", "content": "# Body"}
        ]
        """.data(using: .utf8)!

        let articles = try JSONDecoder().decode([Article].self, from: json)
        XCTAssertEqual(articles.count, 3, "one null body must not drop the other two")
        XCTAssertTrue(articles[0].hasContent)
        XCTAssertFalse(articles[1].hasContent)
        XCTAssertTrue(articles[2].hasContent)
    }

    func testDisplaySummaryIsEmptyRatherThanCrashingWithNoBody() throws {
        let json = """
        {"id": "a-x", "title": "T", "slug": "s", "content": null}
        """.data(using: .utf8)!
        let article = try JSONDecoder().decode(Article.self, from: json)
        XCTAssertEqual(article.displaySummary, "")
    }

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
