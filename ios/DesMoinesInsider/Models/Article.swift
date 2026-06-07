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
    let content: String
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
        case id, title, slug, content, excerpt, category, tags
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

    // Cached parsers — `parseTimestamp` runs during decode of every article.
    private static let isoWithFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Tolerant ISO-8601 parse: handles fractional seconds and the
    /// Postgres `+00:00` / `Z` variants Supabase returns.
    static func parseTimestamp(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }
        if let date = isoWithFraction.date(from: string) { return date }
        return isoPlain.date(from: string)
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
