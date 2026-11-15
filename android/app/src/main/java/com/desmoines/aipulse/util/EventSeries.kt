package com.desmoines.aipulse.util

/**
 * One annual event series, as the web's EVENT_SERIES (src/lib/eventSeries.ts)
 * defines it and iOS ports it (ios/DesMoinesInsider/Models/EventSeries.swift).
 * The web page /events/series/<slug> lists the current or next edition and the
 * past ones by year, matching `events` rows by normalised title.
 *
 * AND-AUDIT-042, slice 1: the catalogue and the title rules. The schedule and
 * the native screen come in later slices; until then /events/series/<slug>
 * still opens in the web view.
 */
data class EventSeriesDef(
    /** URL segment under /events/series/. A public URL: never rename. */
    val slug: String,
    /** Display name, without a year. */
    val name: String,
    /**
     * Normalised titles (see [EventSeries.normaliseTitle]) that belong to the
     * series: a title matches when it equals an alias or starts with alias + " ".
     */
    val aliases: List<String>,
    /**
     * Lowercase fragments, one of which must appear in the venue or location.
     * Only for names other events also use ("Pumpkin Fest").
     */
    val venueIncludes: List<String>? = null,
    /** The organiser's host. The official link is a stored source_url on this host. */
    val officialHost: String? = null,
    /** One evergreen sentence. No dates. */
    val about: String,
)

/**
 * The web's annual event series, copied so Android can open
 * /events/series/<slug> natively. The list is an editorial pick that lives in
 * code on the web; src/lib/__tests__/androidEventSeriesParity.test.ts reads
 * this file and fails when the two lists differ, and runs every case in
 * EventSeriesTest's NORMALISE_CASES through the web's normaliseEventTitle.
 * Keep each entry in the shape below (named arguments, one per line).
 *
 * Membership is decided at read time from the title, as on the web, so next
 * year's row joins its series without an edit here. No dates in this file.
 */
object EventSeries {
    const val PATH_PREFIX = "/events/series/"

    val ALL: List<EventSeriesDef> = listOf(
        EventSeriesDef(
            slug = "panda-fest",
            name = "Panda Fest",
            aliases = listOf("panda fest", "pandafest"),
            officialHost = "pandafests.com",
            about = "A national Asian street food festival that stops in Des Moines, with more than 70 food vendors.",
        ),
        EventSeriesDef(
            slug = "cloris-awards",
            name = "Cloris Awards",
            aliases = listOf("cloris awards"),
            officialHost = "clorisawards.com",
            about = "The annual Cloris Awards ceremony, held at Drake University.",
        ),
        EventSeriesDef(
            slug = "farmstasia",
            name = "Farmstasia",
            aliases = listOf("farmstasia"),
            officialHost = "lhf.org",
            about = "Living History Farms' annual fundraiser, with food, drinks, live music and a silent auction.",
        ),
        EventSeriesDef(
            slug = "jazz-in-july",
            name = "Jazz in July",
            aliases = listOf("jazz in july"),
            venueIncludes = listOf("hoyt sherman"),
            officialHost = "hoytsherman.org",
            about = "A run of jazz nights at Hoyt Sherman Place, one each week in July.",
        ),
        EventSeriesDef(
            slug = "cityview-martini-fest",
            name = "CITYVIEW Martini Fest",
            aliases = listOf("cityview martini fest"),
            about = "CITYVIEW's evening martini festival at West Glen Town Center.",
        ),
        EventSeriesDef(
            slug = "rainbow-safari",
            name = "Rainbow Safari",
            aliases = listOf("rainbow safari"),
            venueIncludes = listOf("blank park zoo"),
            officialHost = "capitalcitypride.org",
            about = "Capital City Pride's annual evening of family activities at Blank Park Zoo.",
        ),
        EventSeriesDef(
            slug = "femcity-beyond-business-conference",
            name = "FemCity Des Moines Beyond Business Conference",
            aliases = listOf("femcity des moines beyond business conference"),
            about = "FemCity Des Moines' yearly Beyond Business Conference.",
        ),
        EventSeriesDef(
            slug = "hinterland-music-festival",
            name = "Hinterland Music Festival",
            aliases = listOf("hinterland music festival"),
            officialHost = "hinterlandiowa.com",
            about = "A multi-day outdoor music festival at the Avenue of the Saints Amphitheater in St. Charles, Iowa.",
        ),
        EventSeriesDef(
            slug = "living-history-farms-race",
            name = "Living History Farms Race",
            aliases = listOf("living history farms race"),
            officialHost = "lhf.org",
            about = "A five-mile run across the grounds of Living History Farms.",
        ),
        EventSeriesDef(
            slug = "living-history-farms-family-halloween",
            name = "Family Halloween at Living History Farms",
            aliases = listOf("family halloween"),
            venueIncludes = listOf("living history farms"),
            officialHost = "lhf.org",
            about = "One weekend of trick-or-treating through the historic town at Living History Farms.",
        ),
        EventSeriesDef(
            slug = "head-of-the-des-moines-regatta",
            name = "Head of the Des Moines Regatta",
            aliases = listOf("head of the des moines regatta"),
            officialHost = "desmoinesrowing.org",
            about = "A rowing regatta run by Des Moines Rowing, sponsored by Above & Beyond Cancer.",
        ),
        EventSeriesDef(
            slug = "forever-in-love-bridal-show",
            name = "Forever in Love Bridal Show",
            aliases = listOf("forever in love bridal show"),
            about = "A free-admission bridal show with wedding vendors and giveaways.",
        ),
        EventSeriesDef(
            slug = "center-grove-orchard-pumpkin-fest",
            name = "Pumpkin Fest at Center Grove Orchard",
            aliases = listOf("pumpkin fest"),
            venueIncludes = listOf("center grove"),
            officialHost = "centergroveorchard.com",
            about = "Center Grove Orchard's autumn season of pumpkins and farm activities, its biggest event of the year.",
        ),
        EventSeriesDef(
            slug = "beaverdale-fall-festival",
            name = "Beaverdale Fall Festival",
            aliases = listOf("beaverdale fall festival"),
            officialHost = "fallfestival.org",
            about = "The annual fall festival in Downtown Beaverdale.",
        ),
        EventSeriesDef(
            slug = "national-balloon-classic",
            name = "National Balloon Classic",
            aliases = listOf("national balloon classic"),
            officialHost = "nationalballoonclassic.com",
            about = "A nine-day hot air balloon event held each summer in Indianola.",
        ),
        EventSeriesDef(
            slug = "eerie-evenings",
            name = "Eerie Evenings at the Botanical Garden",
            aliases = listOf("eerie evenings"),
            venueIncludes = listOf("botanical garden"),
            officialHost = "dmbotanicalgarden.com",
            about = "Each October the Greater Des Moines Botanical Garden turns its dome into a Halloween walk-through.",
        ),
        EventSeriesDef(
            slug = "des-moines-holiday-boutique",
            name = "Des Moines Holiday Boutique",
            aliases = listOf("des moines holiday boutique"),
            officialHost = "desmoinesholidayboutique.com",
            about = "A holiday shopping show of jewelry, gourmet food and decor vendors.",
        ),
        EventSeriesDef(
            slug = "des-moines-original-oktoberfest",
            name = "Des Moines' Original Oktoberfest",
            aliases = listOf("des moines original oktoberfest"),
            officialHost = "oktoberfestdsm.com",
            about = "An annual Oktoberfest celebration at The District at Prairie Trail in Ankeny.",
        ),
        EventSeriesDef(
            slug = "taste-of-the-junction",
            name = "Taste of the Junction",
            aliases = listOf("taste of the junction"),
            officialHost = "tasteofthejunction.org",
            about = "A multicultural street festival in Valley Junction, West Des Moines.",
        ),
        EventSeriesDef(
            slug = "des-moines-concours",
            name = "Des Moines Concours",
            aliases = listOf("des moines concours"),
            officialHost = "desmoinesconcours.com",
            about = "A classic car show at Pappajohn Sculpture Park, with a gala at the Krause Gateway Center.",
        ),
    )

    /** The series with this slug, or null (the web's getEventSeries). */
    fun forSlug(slug: String?): EventSeriesDef? {
        if (slug.isNullOrEmpty()) return null
        return ALL.firstOrNull { it.slug == slug }
    }

    /** The site path of a series page, e.g. /events/series/cloris-awards. */
    fun path(def: EventSeriesDef): String = PATH_PREFIX + def.slug

    private const val MONTH_WORD = """(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"""

    // The web's normaliseEventTitle, one regex per step and in its order.
    // Raw strings, so each pattern reads as it does in eventSeries.ts; the
    // ‘/’ escapes are read by the regex engine, keeping this ASCII.
    private val HTML_AMP = Regex("""&amp;""")
    private val HTML_ENTITY = Regex("""&#\d+;""")
    private val APOSTROPHE = Regex("""['‘’`]""")
    private val YEAR = Regex("""\b(?:19|20)\d{2}(?:\s*[-/]\s*(?:(?:19|20)\d{2}|\d{2}))?\b""")
    private val NUMERIC_DATE = Regex("""\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b""")
    private val MONTH_DAY = Regex("""\b$MONTH_WORD\s+\d{1,2}(?:st|nd|rd|th)?\b""")
    private val ORDINAL_BEFORE_ANNUAL = Regex("""\b\d+(?:st|nd|rd|th)\s+(?=(?:annual|edition)\b)""")
    private val LEADING_ORDINAL = Regex("""^\s*\d+(?:st|nd|rd|th)\s+""")
    private val ANNUAL_WORD = Regex("""\b(?:annual|edition)\b""")
    private val NON_ALNUM = Regex("""[^a-z0-9]+""")
    private val SPACES = Regex("""\s+""")

    /**
     * A title with the parts that change every year taken out, so editions
     * compare equal:
     *
     *     "11th Annual Cloris Awards"   -> "cloris awards"
     *     "Jazz in July 2026: Night 3"  -> "jazz in july night 3"
     *
     * Strips four-digit years and season ranges, numeric dates, a month name
     * followed by a day number, a leading ordinal or one before
     * "annual"/"edition", and those two words. A month name on its own stays:
     * "Jazz in July" is a name, not a date. Ordinals elsewhere stay too:
     * "25th Anniversary Tour" names that tour.
     */
    fun normaliseTitle(title: String?): String {
        var t = (title ?: "").lowercase()
        t = HTML_AMP.replace(t, "&")
        t = HTML_ENTITY.replace(t, " ")
        // Apostrophes join rather than split: "Moines'" is "moines".
        t = APOSTROPHE.replace(t, "")
        t = YEAR.replace(t, " ")
        t = NUMERIC_DATE.replace(t, " ")
        t = MONTH_DAY.replace(t, " ")
        t = ORDINAL_BEFORE_ANNUAL.replace(t, " ")
        t = LEADING_ORDINAL.replaceFirst(t, " ")
        t = ANNUAL_WORD.replace(t, " ")
        return SPACES.replace(NON_ALNUM.replace(t, " ").trim(), " ")
    }

    /**
     * The series a row belongs to, or null (the web's seriesForEvent). A
     * venue-qualified series needs one of its fragments in the venue or
     * location, because "Pumpkin Fest" alone could be any farm's.
     */
    fun forEvent(title: String?, venue: String? = null, location: String? = null): EventSeriesDef? {
        val normalised = normaliseTitle(title)
        if (normalised.isEmpty()) return null
        val place = "${venue ?: ""} ${location ?: ""}".lowercase()
        return ALL.firstOrNull { def ->
            def.aliases.any { normalised == it || normalised.startsWith("$it ") } &&
                (def.venueIncludes?.any { place.contains(it) } ?: true)
        }
    }

    /**
     * ilike patterns for a PostgREST or() filter, as the web builds them
     * (seriesTitlePatterns): each alias with its words joined by `*`, so
     * "panda fest" also finds "PandaFest". The query narrows; [forEvent]
     * decides. Aliases are [a-z0-9 ] only (EventSeriesTest checks), so nothing
     * here can break out of the filter.
     */
    fun titlePatterns(def: EventSeriesDef): List<String> =
        def.aliases.map { "title.ilike.*${it.split(" ").joinToString("*")}*" }

    /**
     * The same patterns as [titlePatterns], in the form supabase-kt's
     * `or { ilike("title", ...) }` takes: `%` for PostgREST's `*`, without the
     * `title.ilike.` prefix. "panda fest" gives "%panda%fest%".
     */
    fun titleLikePatterns(def: EventSeriesDef): List<String> =
        def.aliases.map { "%${it.split(" ").joinToString("%")}%" }
}
