import SwiftUI

/// Lightweight native renderer for the GitHub-flavored markdown stored in
/// `articles.content` (the web renders the same source with ReactMarkdown +
/// remarkGfm). Parses the body into block elements and renders each natively so
/// long-form reading is Dynamic-Type and VoiceOver friendly — no WKWebView, no
/// fixed font sizes.
///
/// Inline syntax (bold / italic / inline-code / links) is handled by
/// `AttributedString(markdown:)`; links route through the ambient
/// `openURL` environment action so the reader can open them in its in-app
/// browser.
struct ArticleMarkdownView: View {
    let markdown: String

    /// Parsed ONCE in init (IOS-AUDIT-PERF-023).
    ///
    /// This was `private var blocks: [MarkdownBlock] { MarkdownBlock.parse(markdown) }`
    /// -- a computed property, so every body evaluation re-ran the whole block
    /// parser over the entire article. The inline pass was worse: `inline()` was
    /// called from inside view(for:), so AttributedString(markdown:) ran again for
    /// every heading, paragraph, list item and quote on every render too.
    ///
    /// RenderedBlock resolves both at construction. `markdown` is a `let`, so the
    /// work happens exactly once per article.
    private let blocks: [RenderedBlock]

    init(markdown: String) {
        self.markdown = markdown
        self.blocks = MarkdownBlock.parse(markdown).map(RenderedBlock.init)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Index-based identity: the source is immutable, so positional ids
            // are stable and avoid the cost/animation churn of recomputing
            // content-derived ids on every render.
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func view(for rendered: RenderedBlock) -> some View {
        switch rendered.block {
        case let .heading(level, _):
            Text(rendered.text ?? AttributedString())
                .font(headingFont(level))
                .fontWeight(.bold)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, level <= 2 ? 6 : 2)
                .accessibilityAddTraits(.isHeader)

        case .paragraph:
            Text(rendered.text ?? AttributedString())
                .font(.body)
                .lineSpacing(5)
                .frame(maxWidth: .infinity, alignment: .leading)

        case let .image(url, alt):
            CachedAsyncImage(url: url) {
                ZStack {
                    Rectangle().fill(Color.blue.opacity(0.1))
                    Image(systemName: "photo")
                        .font(.title)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 200)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityLabel(alt.isEmpty ? "Article image" : alt)

        case .bulletList:
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(rendered.items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("•")
                            .font(.body.weight(.bold))
                            .foregroundStyle(Color.accentColor)
                            .accessibilityHidden(true)
                        Text(item)
                            .font(.body)
                            .lineSpacing(4)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

        case .orderedList:
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(rendered.items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("\(index + 1).")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Color.accentColor)
                            .accessibilityHidden(true)
                        Text(item)
                            .font(.body)
                            .lineSpacing(4)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

        case .quote:
            HStack(spacing: 12) {
                Rectangle()
                    .fill(Color.accentColor.opacity(0.5))
                    .frame(width: 3)
                Text(rendered.text ?? AttributedString())
                    .font(.body.italic())
                    .foregroundStyle(.secondary)
                    .lineSpacing(4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

        case let .code(text):
            Text(text)
                .font(.system(.callout, design: .monospaced))
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))

        case .divider:
            Divider()
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .title
        case 2: return .title2
        case 3: return .title3
        default: return .headline
        }
    }

}

// MARK: - Pre-rendered block

/// A parsed block with its inline markdown already resolved (IOS-AUDIT-PERF-023).
///
/// The inline pass is the expensive half: AttributedString(markdown:) used to run
/// from inside the view body for every heading, paragraph, list item and quote on
/// every render. Doing it here means once per article, and the result cannot
/// differ -- it is the same function on the same input, and it depends on nothing
/// from the environment.
struct RenderedBlock {
    let block: MarkdownBlock
    /// Resolved text for the single-text cases. nil for image, code and divider,
    /// which render their raw value or nothing.
    let text: AttributedString?
    /// Resolved items for the two list cases. Empty otherwise.
    let items: [AttributedString]

    init(_ block: MarkdownBlock) {
        self.block = block
        switch block {
        case let .heading(_, text):
            self.text = Self.inline(text)
            self.items = []
        case let .paragraph(text):
            self.text = Self.inline(text)
            self.items = []
        case let .quote(text):
            self.text = Self.inline(text)
            self.items = []
        case let .bulletList(items):
            self.text = nil
            self.items = items.map(Self.inline)
        case let .orderedList(items):
            self.text = nil
            self.items = items.map(Self.inline)
        case .image, .code, .divider:
            self.text = nil
            self.items = []
        }
    }

    /// Inline markdown -> AttributedString. Falls back to plain text if parsing
    /// fails so content never disappears.
    static func inline(_ text: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace
        )
        if let attributed = try? AttributedString(markdown: text, options: options) {
            return attributed
        }
        return AttributedString(text)
    }
}

// MARK: - Block model + parser

enum MarkdownBlock {
    case heading(level: Int, text: String)
    case paragraph(String)
    case image(url: String, alt: String)
    case bulletList([String])
    case orderedList([String])
    case quote(String)
    case code(String)
    case divider

    // IOS-AUDIT-PERF-023 AC2: the `id` property was REMOVED rather than made
    // position-stable, because it was never used. ArticleMarkdownView identifies
    // blocks by their offset (the source is immutable, so position is the stable
    // identity), and no other file referenced MarkdownBlock.id.
    //
    // It could not have been made stable in place either: its divider case
    // returned "hr-\(UUID().uuidString)", a NEW id on every access, which defeats
    // diffing entirely -- while the obvious fix of a constant "hr" would collide
    // between two dividers in one article. Identity belongs to the position, not
    // to the block.

    /// Parses GitHub-flavored markdown into a flat list of blocks. Deliberately
    /// small — handles the structures our editor emits (headings, paragraphs,
    /// images, ordered/unordered lists, blockquotes, fenced code, rules).
    static func parse(_ markdown: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        let lines = markdown.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")

        var i = 0
        var paragraphBuffer: [String] = []

        func flushParagraph() {
            let joined = paragraphBuffer.joined(separator: " ").trimmingCharacters(in: .whitespaces)
            if !joined.isEmpty { blocks.append(.paragraph(joined)) }
            paragraphBuffer.removeAll()
        }

        while i < lines.count {
            let raw = lines[i]
            let line = raw.trimmingCharacters(in: .whitespaces)

            // Blank line → paragraph boundary.
            if line.isEmpty {
                flushParagraph()
                i += 1
                continue
            }

            // Fenced code block.
            if line.hasPrefix("```") {
                flushParagraph()
                var code: [String] = []
                i += 1
                while i < lines.count, !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    code.append(lines[i])
                    i += 1
                }
                i += 1 // closing fence
                blocks.append(.code(code.joined(separator: "\n")))
                continue
            }

            // Horizontal rule.
            if line == "---" || line == "***" || line == "___" {
                flushParagraph()
                blocks.append(.divider)
                i += 1
                continue
            }

            // Standalone image: ![alt](url)
            if let image = parseImage(line) {
                flushParagraph()
                blocks.append(image)
                i += 1
                continue
            }

            // Heading.
            if let heading = parseHeading(line) {
                flushParagraph()
                blocks.append(heading)
                i += 1
                continue
            }

            // Blockquote (consume consecutive `>` lines).
            if line.hasPrefix(">") {
                flushParagraph()
                var quoteLines: [String] = []
                while i < lines.count {
                    let q = lines[i].trimmingCharacters(in: .whitespaces)
                    guard q.hasPrefix(">") else { break }
                    quoteLines.append(String(q.dropFirst()).trimmingCharacters(in: .whitespaces))
                    i += 1
                }
                blocks.append(.quote(quoteLines.joined(separator: " ")))
                continue
            }

            // Unordered list (consume consecutive items).
            if isBullet(line) {
                flushParagraph()
                var items: [String] = []
                while i < lines.count, isBullet(lines[i].trimmingCharacters(in: .whitespaces)) {
                    items.append(bulletText(lines[i].trimmingCharacters(in: .whitespaces)))
                    i += 1
                }
                blocks.append(.bulletList(items))
                continue
            }

            // Ordered list.
            if isOrdered(line) {
                flushParagraph()
                var items: [String] = []
                while i < lines.count, isOrdered(lines[i].trimmingCharacters(in: .whitespaces)) {
                    items.append(orderedText(lines[i].trimmingCharacters(in: .whitespaces)))
                    i += 1
                }
                blocks.append(.orderedList(items))
                continue
            }

            // Otherwise accumulate paragraph text.
            paragraphBuffer.append(line)
            i += 1
        }
        flushParagraph()
        return blocks
    }

    // MARK: Line helpers

    private static func parseHeading(_ line: String) -> MarkdownBlock? {
        guard line.hasPrefix("#") else { return nil }
        var level = 0
        for ch in line { if ch == "#" { level += 1 } else { break } }
        guard level >= 1, level <= 6 else { return nil }
        let text = String(line.dropFirst(level)).trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return nil }
        return .heading(level: level, text: text)
    }

    private static func parseImage(_ line: String) -> MarkdownBlock? {
        // ![alt](url) — only treat as a block when the image is the whole line.
        guard line.hasPrefix("!["), let altEnd = line.range(of: "]("),
              line.hasSuffix(")") else { return nil }
        let alt = String(line[line.index(line.startIndex, offsetBy: 2)..<altEnd.lowerBound])
        let url = String(line[altEnd.upperBound..<line.index(before: line.endIndex)])
        guard !url.isEmpty else { return nil }
        return .image(url: url, alt: alt)
    }

    private static func isBullet(_ line: String) -> Bool {
        line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("+ ")
    }

    private static func bulletText(_ line: String) -> String {
        String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
    }

    private static func isOrdered(_ line: String) -> Bool {
        // "1. ", "23. " etc.
        guard let dot = line.firstIndex(of: ".") else { return false }
        let prefix = line[line.startIndex..<dot]
        guard !prefix.isEmpty, prefix.allSatisfy(\.isNumber) else { return false }
        let after = line.index(after: dot)
        return after < line.endIndex && line[after] == " "
    }

    private static func orderedText(_ line: String) -> String {
        guard let dot = line.firstIndex(of: ".") else { return line }
        return String(line[line.index(after: dot)...]).trimmingCharacters(in: .whitespaces)
    }
}

#Preview {
    ScrollView {
        ArticleMarkdownView(markdown: Article.preview.content)
            .padding()
    }
}
