import Foundation

/// One annual event series, as the web's EVENT_SERIES (src/lib/eventSeries.ts)
/// defines it. The web page /events/series/<slug> lists the current or next
/// edition and the past ones by year, matching `events` rows by normalised
/// title (IOS-AUDIT-FEAT-046).
struct EventSeriesDef: Equatable, Sendable {
    /// URL segment under /events/series/. A public URL: never rename.
    let slug: String
    /// Display name, without a year.
    let name: String
    /// Normalised titles (see `EventSeries.normaliseTitle`) that belong to
    /// the series: a title matches when it equals an alias or starts with
    /// alias + " ".
    let aliases: [String]
    /// Lowercase fragments, one of which must appear in the venue or
    /// location. Only for names other events also use ("Pumpkin Fest").
    let venueIncludes: [String]?
    /// The organiser's host. The official link is a stored source_url on
    /// this host, never a URL typed here.
    let officialHost: String?
    /// One evergreen sentence. No dates.
    let about: String

    init(
        slug: String,
        name: String,
        aliases: [String],
        venueIncludes: [String]? = nil,
        officialHost: String? = nil,
        about: String
    ) {
        self.slug = slug
        self.name = name
        self.aliases = aliases
        self.venueIncludes = venueIncludes
        self.officialHost = officialHost
        self.about = about
    }
}

/// The web's annual event series, ported so iOS can open /events/series/<slug>
/// natively. The list is an editorial pick that lives in code on the web, so
/// it is copied here; src/lib/__tests__/iosEventSeriesParity.test.ts reads
/// this file and fails when the two lists differ, and runs the normaliser
/// cases in EventSeriesTests through the web's normaliseEventTitle.
///
/// Membership is decided at read time from the title, as on the web, so next
/// year's row joins its series without an edit here. No dates in this file.
enum EventSeries {
    static let pathPrefix = "/events/series/"

    static let all: [EventSeriesDef] = [
        EventSeriesDef(
            slug: "panda-fest",
            name: "Panda Fest",
            aliases: ["panda fest", "pandafest"],
            officialHost: "pandafests.com",
            about: "A national Asian street food festival that stops in Des Moines, with more than 70 food vendors."
        ),
        EventSeriesDef(
            slug: "cloris-awards",
            name: "Cloris Awards",
            aliases: ["cloris awards"],
            officialHost: "clorisawards.com",
            about: "The annual Cloris Awards ceremony, held at Drake University."
        ),
        EventSeriesDef(
            slug: "farmstasia",
            name: "Farmstasia",
            aliases: ["farmstasia"],
            officialHost: "lhf.org",
            about: "Living History Farms' annual fundraiser, with food, drinks, live music and a silent auction."
        ),
        EventSeriesDef(
            slug: "jazz-in-july",
            name: "Jazz in July",
            aliases: ["jazz in july"],
            venueIncludes: ["hoyt sherman"],
            officialHost: "hoytsherman.org",
            about: "A run of jazz nights at Hoyt Sherman Place, one each week in July."
        ),
        EventSeriesDef(
            slug: "cityview-martini-fest",
            name: "CITYVIEW Martini Fest",
            aliases: ["cityview martini fest"],
            about: "CITYVIEW's evening martini festival at West Glen Town Center."
        ),
        EventSeriesDef(
            slug: "rainbow-safari",
            name: "Rainbow Safari",
            aliases: ["rainbow safari"],
            venueIncludes: ["blank park zoo"],
            officialHost: "capitalcitypride.org",
            about: "Capital City Pride's annual evening of family activities at Blank Park Zoo."
        ),
        EventSeriesDef(
            slug: "femcity-beyond-business-conference",
            name: "FemCity Des Moines Beyond Business Conference",
            aliases: ["femcity des moines beyond business conference"],
            about: "FemCity Des Moines' yearly Beyond Business Conference."
        ),
        EventSeriesDef(
            slug: "hinterland-music-festival",
            name: "Hinterland Music Festival",
            aliases: ["hinterland music festival"],
            officialHost: "hinterlandiowa.com",
            about: "A multi-day outdoor music festival at the Avenue of the Saints Amphitheater in St. Charles, Iowa."
        ),
        EventSeriesDef(
            slug: "living-history-farms-race",
            name: "Living History Farms Race",
            aliases: ["living history farms race"],
            officialHost: "lhf.org",
            about: "A five-mile run across the grounds of Living History Farms."
        ),
        EventSeriesDef(
            slug: "living-history-farms-family-halloween",
            name: "Family Halloween at Living History Farms",
            aliases: ["family halloween"],
            venueIncludes: ["living history farms"],
            officialHost: "lhf.org",
            about: "One weekend of trick-or-treating through the historic town at Living History Farms."
        ),
        EventSeriesDef(
            slug: "head-of-the-des-moines-regatta",
            name: "Head of the Des Moines Regatta",
            aliases: ["head of the des moines regatta"],
            officialHost: "desmoinesrowing.org",
            about: "A rowing regatta run by Des Moines Rowing, sponsored by Above & Beyond Cancer."
        ),
        EventSeriesDef(
            slug: "forever-in-love-bridal-show",
            name: "Forever in Love Bridal Show",
            aliases: ["forever in love bridal show"],
            about: "A free-admission bridal show with wedding vendors and giveaways."
        ),
        EventSeriesDef(
            slug: "center-grove-orchard-pumpkin-fest",
            name: "Pumpkin Fest at Center Grove Orchard",
            aliases: ["pumpkin fest"],
            venueIncludes: ["center grove"],
            officialHost: "centergroveorchard.com",
            about: "Center Grove Orchard's autumn season of pumpkins and farm activities, its biggest event of the year."
        ),
        EventSeriesDef(
            slug: "beaverdale-fall-festival",
            name: "Beaverdale Fall Festival",
            aliases: ["beaverdale fall festival"],
            officialHost: "fallfestival.org",
            about: "The annual fall festival in Downtown Beaverdale."
        ),
        EventSeriesDef(
            slug: "national-balloon-classic",
            name: "National Balloon Classic",
            aliases: ["national balloon classic"],
            officialHost: "nationalballoonclassic.com",
            about: "A nine-day hot air balloon event held each summer in Indianola."
        ),
        EventSeriesDef(
            slug: "eerie-evenings",
            name: "Eerie Evenings at the Botanical Garden",
            aliases: ["eerie evenings"],
            venueIncludes: ["botanical garden"],
            officialHost: "dmbotanicalgarden.com",
            about: "Each October the Greater Des Moines Botanical Garden turns its dome into a Halloween walk-through."
        ),
        EventSeriesDef(
            slug: "des-moines-holiday-boutique",
            name: "Des Moines Holiday Boutique",
            aliases: ["des moines holiday boutique"],
            officialHost: "desmoinesholidayboutique.com",
            about: "A holiday shopping show of jewelry, gourmet food and decor vendors."
        ),
        EventSeriesDef(
            slug: "des-moines-original-oktoberfest",
            name: "Des Moines' Original Oktoberfest",
            aliases: ["des moines original oktoberfest"],
            officialHost: "oktoberfestdsm.com",
            about: "An annual Oktoberfest celebration at The District at Prairie Trail in Ankeny."
        ),
        EventSeriesDef(
            slug: "taste-of-the-junction",
            name: "Taste of the Junction",
            aliases: ["taste of the junction"],
            officialHost: "tasteofthejunction.org",
            about: "A multicultural street festival in Valley Junction, West Des Moines."
        ),
        EventSeriesDef(
            slug: "des-moines-concours",
            name: "Des Moines Concours",
            aliases: ["des moines concours"],
            officialHost: "desmoinesconcours.com",
            about: "A classic car show at Pappajohn Sculpture Park, with a gala at the Krause Gateway Center."
        ),
    ]

    /// The series with this slug, or nil (the web's getEventSeries).
    static func series(slug: String?) -> EventSeriesDef? {
        guard let slug, !slug.isEmpty else { return nil }
        return all.first { $0.slug == slug }
    }

    static func path(_ def: EventSeriesDef) -> String {
        pathPrefix + def.slug
    }

    private static let monthWord = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?"

    /// A title with the parts that change every year taken out, so editions
    /// compare equal. A port of the web's normaliseEventTitle, step for step:
    ///
    ///     "11th Annual Cloris Awards"      -> "cloris awards"
    ///     "Jazz in July 2026: Night 3"     -> "jazz in july night 3"
    ///
    /// Strips four-digit years and season ranges, numeric dates, a month
    /// name followed by a day number, a leading ordinal or one before
    /// "annual"/"edition", and those two words. A month name on its own
    /// stays: "Jazz in July" is a name, not a date.
    static func normaliseTitle(_ title: String?) -> String {
        var t = (title ?? "").lowercased()
        t = t.replacingOccurrences(of: "&amp;", with: "&")
        t = replace(t, "&#\\d+;", " ")
        // Apostrophes join rather than split: "Moines'" is "moines".
        // The escapes are U+2018/U+2019, written as escapes to keep the source ASCII.
        t = replace(t, "['\u{2018}\u{2019}`]", "")
        t = replace(t, "\\b(?:19|20)\\d{2}(?:\\s*[-/]\\s*(?:(?:19|20)\\d{2}|\\d{2}))?\\b", " ")
        t = replace(t, "\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b", " ")
        t = replace(t, "\\b\(monthWord)\\s+\\d{1,2}(?:st|nd|rd|th)?\\b", " ")
        t = replace(t, "\\b\\d+(?:st|nd|rd|th)\\s+(?=(?:annual|edition)\\b)", " ")
        t = replace(t, "^\\s*\\d+(?:st|nd|rd|th)\\s+", " ")
        t = replace(t, "\\b(?:annual|edition)\\b", " ")
        t = replace(t, "[^a-z0-9]+", " ")
        return t.trimmingCharacters(in: .whitespaces)
    }

    private static func replace(_ text: String, _ pattern: String, _ replacement: String) -> String {
        text.replacingOccurrences(of: pattern, with: replacement, options: .regularExpression)
    }

    /// The series a row belongs to, or nil (the web's seriesForEvent). A
    /// venue-qualified series needs one of its fragments in the venue or
    /// location, because "Pumpkin Fest" alone could be any farm's.
    static func series(title: String?, venue: String? = nil, location: String? = nil) -> EventSeriesDef? {
        let normalised = normaliseTitle(title)
        guard !normalised.isEmpty else { return nil }
        let place = "\(venue ?? "") \(location ?? "")".lowercased()
        return all.first { def in
            guard def.aliases.contains(where: { normalised == $0 || normalised.hasPrefix($0 + " ") }) else {
                return false
            }
            guard let venues = def.venueIncludes else { return true }
            return venues.contains { place.contains($0) }
        }
    }

    /// ilike patterns for a PostgREST or() filter, as the web builds them:
    /// each alias with its words joined by `*`, so "panda fest" also finds
    /// "PandaFest". The query narrows; `series(title:venue:location:)`
    /// decides. Aliases are [a-z0-9 ] only (EventSeriesTests checks), so
    /// nothing here can break out of the filter.
    static func titlePatterns(_ def: EventSeriesDef) -> [String] {
        def.aliases.map { "title.ilike.*\($0.split(separator: " ").joined(separator: "*"))*" }
    }
}
