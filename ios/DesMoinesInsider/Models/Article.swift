import Foundation
import SwiftUI

/// A published guide / blog article. Decodes the same `articles` table the web
/// `/articles` surface reads (see src/hooks/useArticles.ts), so web + iOS render
/// identical content. Content is GitHub-flavored markdown (web renders it with
/// ReactMarkdown + remarkGfm); the native reader parses the same source.
struct Article: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let slug: String
    /// The markdown body.
    ///
    /// Backed by an optional so a null or missing `content` cannot fail the
    /// decode of the WHOLE array (IOS-AUDIT-BUG-005). Decodable stops at the
    /// first bad element, so one malformed row took the entire Articles screen
    /// down rather than hiding one card.
    ///
    /// The column is currently NOT NULL and 0 of 18 published rows are empty, so
    /// this is hardening against a schema the database presently forbids -- but
    /// an empty STRING is already permitted, is indistinguishable here, and is
    /// what the empty-body fallback in ArticleDetailView handles.
    ///
    /// Exposed as a non-optional `String` so no call site changes.
    private let rawContent: String?

    var content: String { rawContent ?? "" }

    /// True when there is no body to render.
    var hasContent: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    var excerpt: String?
    var featuredImageUrl: String?
    var category: String?
    var tags: [String]?
    var seoTitle: String?
    var seoDescription: String?
    var viewCount: Int?
    var publishedAt: String?
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title, slug, excerpt, category, tags
        case rawContent = "content"
        case featuredImageUrl = "featured_image_url"
        case seoTitle = "seo_title"
        case seoDescription = "seo_description"
        case viewCount = "view_count"
        case publishedAt = "published_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    // MARK: - Computed Properties

    /// Best display category (falls back to the web default of "General").
    var displayCategory: String {
        let trimmed = (category ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "General" : trimmed
    }

    /// Short summary for cards/share — the excerpt, or a trimmed lead from the
    /// body when no excerpt was authored.
    var displaySummary: String {
        if let excerpt, !excerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return excerpt
        }
        // Derive a lead paragraph from the markdown body: first non-empty,
        // non-heading, non-image line, stripped of inline markdown syntax.
        let lead = content
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first { line in
                !line.isEmpty &&
                !line.hasPrefix("#") &&
                !line.hasPrefix("![") &&
                !line.hasPrefix(">")
            } ?? ""
        let stripped = lead
            .replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: "*", with: "")
            .replacingOccurrences(of: "`", with: "")
        return String(stripped.prefix(180))
    }

    /// Parsed publish (or fallback created) date.
    var date: Date? {
        Article.parseTimestamp(publishedAt) ?? Article.parseTimestamp(createdAt)
    }

    var formattedDate: String? {
        guard let date else { return nil }
        return date.formatted(.dateTime.month(.abbreviated).day().year())
    }

    /// Estimated reading time, mirroring the web's 200 wpm heuristic
    /// (src/pages/ArticleDetails.tsx `formatReadTime`).
    var readingMinutes: Int {
        let words = content.split { $0 == " " || $0 == "\n" || $0 == "\t" }.count
        return max(1, Int((Double(words) / 200.0).rounded(.up)))
    }

    var readingTimeText: String { "\(readingMinutes) min read" }

    /// Canonical web URL for sharing / universal-link parity.
    var webURL: URL {
        Config.siteURL.appendingPathComponent("articles").appendingPathComponent(slug)
    }

    /// VoiceOver label for a card (title, category, date, reading time).
    var cardAccessibilityLabel: String {
        var parts: [String] = [title, "\(displayCategory) guide"]
        if let formattedDate { parts.append(formattedDate) }
        parts.append(readingTimeText)
        return parts.joined(separator: ". ")
    }

    // MARK: - Hashable / Equatable (id-based, like the other content models)

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: Article, rhs: Article) -> Bool { lhs.id == rhs.id }

    // MARK: - Date parsing

    /// Tolerant parse delegating to the single app-wide `DateParser`, which
    /// handles Postgres microsecond fractional seconds, the `+00:00` / `Z`
    /// variants, and the space-separated / date-only fallbacks. Previously this
    /// had its own two-formatter parser that silently returned nil on
    /// microsecond timestamps and lacked the non-ISO fallbacks (IOS-AUDIT-DATA-001).
    static func parseTimestamp(_ string: String?) -> Date? {
        DateParser.parse(string)
    }
}

// MARK: - Unified content-card adapter (IOS-IA-003)

extension Article {
    /// Renders through the shared `ContentCard`. The favorite affordance is
    /// supplied by the hosting screen (`.external`) since the Articles screen
    /// owns favorite state + its own toast, exactly like the Attractions list.
    var cardData: ContentCardData {
        var pills: [CardPill] = []
        pills.append(CardPill(icon: "book", text: readingTimeText, tint: .blue, filled: false))

        var data = ContentCardData(
            id: id,
            title: title,
            imageUrl: featuredImageUrl,
            placeholderIcon: "doc.richtext",
            placeholderTint: .blue,
            pills: pills,
            accessibilityLabel: cardAccessibilityLabel
        )
        data.metaPrimary = CardMetaLine(icon: "tag", text: displayCategory)
        if let formattedDate {
            data.metaSecondary = CardMetaLine(icon: "calendar", text: formattedDate)
        }
        return data
    }
}

// MARK: - Construction

extension Article {
    /// Memberwise init taking `content:` rather than the private `rawContent:`.
    ///
    /// Declared in an extension so the synthesized memberwise init survives, and
    /// so the two existing call sites -- the preview fixture and the test helper --
    /// are unchanged by IOS-AUDIT-BUG-005 making the storage optional.
    init(
        id: String,
        title: String,
        slug: String,
        content: String?,
        excerpt: String? = nil,
        featuredImageUrl: String? = nil,
        category: String? = nil,
        tags: [String]? = nil,
        seoTitle: String? = nil,
        seoDescription: String? = nil,
        viewCount: Int? = nil,
        publishedAt: String? = nil,
        createdAt: String? = nil,
        updatedAt: String? = nil
    ) {
        self.init(
            id: id,
            title: title,
            slug: slug,
            rawContent: content,
            excerpt: excerpt,
            featuredImageUrl: featuredImageUrl,
            category: category,
            tags: tags,
            seoTitle: seoTitle,
            seoDescription: seoDescription,
            viewCount: viewCount,
            publishedAt: publishedAt,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }
}

// MARK: - Preview fixture

extension Article {
    static let preview = Article(
        id: "preview-article-1",
        title: "A Local's Guide to Des Moines' East Village",
        slug: "locals-guide-east-village",
        content: """
        # The East Village

        The East Village is one of Des Moines' most walkable neighborhoods, packed
        with **independent shops**, coffee roasters, and some of the best patios in
        the city.

        ![East Village street](https://example.com/east-village.jpg)

        ## Where to Eat

        - Grab brunch at a sidewalk cafe
        - Try a wood-fired pizza for dinner

        Read more on the [neighborhoods guide](https://desmoinesinsider.com/neighborhoods).
        """,
        excerpt: "Walkable streets, independent shops, and the best patios in the city.",
        featuredImageUrl: nil,
        category: "Neighborhoods",
        tags: ["east village", "guide"],
        viewCount: 128,
        publishedAt: "2026-05-20T14:00:00Z",
        createdAt: "2026-05-19T10:00:00Z",
        updatedAt: "2026-05-20T14:00:00Z"
    )
}
