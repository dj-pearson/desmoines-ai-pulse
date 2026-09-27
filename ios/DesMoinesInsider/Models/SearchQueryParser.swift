import Foundation

/// Structured filters a search carries alongside its keywords
/// (IOS-DD-SEARCH-05). Set from words in the query ("tonight", "free",
/// "East Village", "open now") by `SearchQueryParser`, or explicitly by a
/// chip, a category tile, a Siri intent or a saved search.
struct SearchFilters: Equatable {
    var datePreset: DateFilterPreset?
    var freeOnly = false
    var openNow = false
    var areas: [LocationArea] = []
    var category: EventCategory?
    /// The tab the words point at ("restaurants", "open now"). Not a filter:
    /// it only chooses which tab is shown first.
    var tabHint: SearchViewModel.SearchTab?

    /// True when nothing here narrows a query. `tabHint` does not count.
    var isEmpty: Bool {
        datePreset == nil && !freeOnly && !openNow && areas.isEmpty && category == nil
    }

    /// `self`, with every field `explicit` sets taking precedence.
    func merged(with explicit: SearchFilters) -> SearchFilters {
        var out = self
        if let preset = explicit.datePreset { out.datePreset = preset }
        if explicit.freeOnly { out.freeOnly = true }
        if explicit.openNow { out.openNow = true }
        if !explicit.areas.isEmpty { out.areas = explicit.areas }
        if let category = explicit.category { out.category = category }
        if let hint = explicit.tabHint { out.tabHint = hint }
        return out
    }
}

/// A query split into the words that go to text search and the filters the
/// rest of it asked for.
struct ParsedSearch: Equatable {
    var keywords: String
    var filters: SearchFilters
}

/// Turns "Italian restaurants in Downtown open now" into keywords "Italian"
/// plus openNow, the Downtown area and the Restaurants tab
/// (IOS-DD-SEARCH-05).
///
/// Before this, every word went to text search: events' websearch FTS ANDs
/// its terms, so "Live music tonight" needed an event whose text contained
/// "tonight", and the built-in suggestions and both Siri intents searched for
/// words no row has. Pure; no I/O.
///
/// Category words are deliberately NOT parsed from free text: `search_vector`
/// already contains the category, so "music" finds music events as a keyword.
/// A category is set only structurally (tiles, intents, saved searches).
enum SearchQueryParser {

    private enum Action {
        case preset(DateFilterPreset)
        case free
        case openNow
        case area(LocationArea)
        case tab(SearchViewModel.SearchTab)
        case noise
    }

    /// A token of the query: kept for the keywords, or consumed by a phrase.
    private enum Item {
        case keep(String)
        case removed
    }

    private static let stopWords: Set<String> = ["in", "at", "near", "on", "the"]

    /// Area names people type. Every LocationArea except Des Moines itself
    /// (the whole app is Des Moines, so it is noise) and the Downtown raw value
    /// ("Downtown / Court Ave"), which is covered by its two halves.
    private static let areaAliases: [(String, LocationArea)] = {
        var list: [(String, LocationArea)] = LocationArea.allCases
            .filter { $0 != .desMoines && $0 != .downtown }
            .map { ($0.rawValue.lowercased(), $0) }
        list += [
            ("downtown", .downtown), ("court ave", .downtown), ("court avenue", .downtown),
            ("east village", .eastVillage), ("valley junction", .valleyJunction),
            ("ingersoll", .ingersoll), ("wdm", .westDesMoines),
        ]
        return list
    }()

    /// Every phrase, as normalized words, longest first so "west des moines"
    /// wins over "des moines" and "this weekend" over "weekend".
    private static let phrases: [(words: [String], action: Action)] = {
        var raw: [(String, Action)] = [
            ("this weekend", .preset(.thisWeekend)), ("weekend", .preset(.thisWeekend)),
            ("tonight", .preset(.tonight)), ("today", .preset(.today)),
            ("tomorrow", .preset(.tomorrow)),
            ("free", .free),
            ("open now", .openNow),
            ("restaurants", .tab(.restaurants)), ("restaurant", .tab(.restaurants)),
            ("places to eat", .tab(.restaurants)),
            ("events", .tab(.events)), ("event", .tab(.events)),
            ("attractions", .tab(.attractions)), ("things to do", .tab(.attractions)),
            ("des moines", .noise),
        ]
        raw += SearchQueryParser.areaAliases.map { ($0.0, Action.area($0.1)) }
        return raw
            .map { entry -> (words: [String], action: Action) in
                (words: entry.0.split(separator: " ").map { SearchQueryParser.normalize(String($0)) },
                 action: entry.1)
            }
            .sorted { $0.words.count > $1.words.count }
    }()

    /// Lowercased, with surrounding punctuation removed ("downtown," ->
    /// "downtown").
    private static func normalize(_ token: String) -> String {
        token.lowercased().trimmingCharacters(in: .punctuationCharacters)
    }

    static func parse(_ text: String) -> ParsedSearch {
        let tokens = text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        let normalized = tokens.map(normalize)

        var items: [Item] = []
        var filters = SearchFilters()

        var i = 0
        while i < tokens.count {
            let match = phrases.first { phrase in
                let n = phrase.words.count
                return i + n <= tokens.count && Array(normalized[i..<(i + n)]) == phrase.words
            }
            guard let match else {
                items.append(.keep(tokens[i]))
                i += 1
                continue
            }
            apply(match.action, to: &filters)
            items.append(.removed)
            i += match.words.count
        }

        // Drop stop words left dangling by a removed phrase ("in" before
        // "Downtown") or at either end of what is left.
        var kept: [String] = []
        for (index, item) in items.enumerated() {
            guard case .keep(let token) = item else { continue }
            if stopWords.contains(normalize(token)) {
                if kept.isEmpty || nextIsRemovedOrEnd(items, after: index) { continue }
            }
            kept.append(token)
        }

        return ParsedSearch(keywords: kept.joined(separator: " "), filters: filters)
    }

    /// True when the next token that is not itself a stop word was consumed
    /// by a phrase, or there is none.
    private static func nextIsRemovedOrEnd(_ items: [Item], after index: Int) -> Bool {
        var j = index + 1
        while j < items.count {
            switch items[j] {
            case .removed:
                return true
            case .keep(let token):
                if stopWords.contains(normalize(token)) {
                    j += 1
                } else {
                    return false
                }
            }
        }
        return true
    }

    private static func apply(_ action: Action, to filters: inout SearchFilters) {
        switch action {
        case .preset(let preset):
            filters.datePreset = preset
        case .free:
            filters.freeOnly = true
        case .openNow:
            filters.openNow = true
            if filters.tabHint == nil { filters.tabHint = .restaurants }
        case .area(let area):
            if !filters.areas.contains(area) { filters.areas.append(area) }
        case .tab(let tab):
            if filters.tabHint == nil { filters.tabHint = tab }
        case .noise:
            break
        }
    }

    // MARK: - Saved-search slugs (supabase/functions/_shared/savedSearchMatch.ts)

    /// The `preset` value the web and the alert job understand. Tonight has no
    /// preset of its own there, so it saves as today.
    static let presetSlug: [DateFilterPreset: String] = [
        .tonight: "today", .today: "today", .tomorrow: "tomorrow", .thisWeekend: "this-weekend",
    ]

    /// The inverse of `presetSlug`, for a row the web wrote.
    static func preset(slug: String) -> DateFilterPreset? {
        switch slug.lowercased() {
        case "today": return .today
        case "tomorrow": return .tomorrow
        case "this-weekend": return .thisWeekend
        default: return nil
        }
    }

    /// The 13 EVENT_AREAS slugs of src/lib/eventAreas.ts.
    static let areaSlugs: [LocationArea: String] = [
        .desMoines: "des-moines", .westDesMoines: "west-des-moines", .ankeny: "ankeny",
        .urbandale: "urbandale", .clive: "clive", .johnston: "johnston", .altoona: "altoona",
        .windsorHeights: "windsor-heights", .waukee: "waukee", .downtown: "downtown",
        .eastVillage: "east-village", .valleyJunction: "valley-junction", .ingersoll: "ingersoll",
    ]

    static func area(slug: String) -> LocationArea? {
        let wanted = slug.lowercased()
        return areaSlugs.first { $0.value == wanted }?.key
    }
}

// MARK: - Filter chips (IOS-DD-SEARCH-05)

/// One removable filter, as the chip row under the tab picker shows it.
enum SearchFilterChip: Hashable, Identifiable {
    case date(DateFilterPreset)
    case free
    case openNow
    case area(LocationArea)
    case category(EventCategory)

    var id: String {
        switch self {
        case .date(let preset): return "date-\(preset.rawValue)"
        case .free: return "free"
        case .openNow: return "open-now"
        case .area(let area): return "area-\(area.rawValue)"
        case .category(let category): return "category-\(category.rawValue)"
        }
    }

    var label: String {
        switch self {
        case .date(let preset): return preset.rawValue
        case .free: return "Free"
        case .openNow: return "Open now"
        case .area(let area): return area.displayName
        case .category(let category): return category.displayName
        }
    }
}

extension SearchFilters {
    /// The chips for these filters, in a stable order.
    var chips: [SearchFilterChip] {
        var out: [SearchFilterChip] = []
        if let datePreset { out.append(.date(datePreset)) }
        if freeOnly { out.append(.free) }
        if openNow { out.append(.openNow) }
        out += areas.map { .area($0) }
        if let category { out.append(.category(category)) }
        return out
    }

    func contains(_ chip: SearchFilterChip) -> Bool {
        chips.contains(chip)
    }

    /// These filters without `chip`.
    func removing(_ chip: SearchFilterChip) -> SearchFilters {
        var out = self
        switch chip {
        case .date: out.datePreset = nil
        case .free: out.freeOnly = false
        case .openNow: out.openNow = false
        case .area(let area): out.areas.removeAll { $0 == area }
        case .category: out.category = nil
        }
        return out
    }
}

extension SearchQueryParser {
    /// `text` without the words that produced `chip` ("Free events tonight"
    /// minus Tonight is "Free events"). Everything else, including the other
    /// filter words, is kept as typed.
    static func removing(_ chip: SearchFilterChip, from text: String) -> String {
        let tokens = text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        let normalized = tokens.map(normalize)
        var items: [Item] = []
        var i = 0
        while i < tokens.count {
            let match = phrases.first { phrase in
                let n = phrase.words.count
                return i + n <= tokens.count && Array(normalized[i..<(i + n)]) == phrase.words
            }
            guard let match else {
                items.append(.keep(tokens[i]))
                i += 1
                continue
            }
            let n = match.words.count
            if produces(match.action, chip) {
                items.append(.removed)
            } else {
                items += tokens[i..<(i + n)].map { Item.keep($0) }
            }
            i += n
        }
        var kept: [String] = []
        for (index, item) in items.enumerated() {
            guard case .keep(let token) = item else { continue }
            if stopWords.contains(normalize(token)), nextIsRemovedOrEnd(items, after: index),
               index + 1 < items.count {
                continue
            }
            kept.append(token)
        }
        return kept.joined(separator: " ")
    }

    private static func produces(_ action: Action, _ chip: SearchFilterChip) -> Bool {
        switch (action, chip) {
        case (.preset(let a), .date(let b)): return a == b
        case (.free, .free): return true
        case (.openNow, .openNow): return true
        case (.area(let a), .area(let b)): return a == b
        default: return false
        }
    }
}
