import Foundation

/// A Des Moines neighborhood / suburb for the Neighborhoods hub (IOS-PARITY-006).
/// Mirrors the curated list on the web /neighborhoods page, with optional
/// device-location "nearby" sorting.
///
/// Each entry names the `LocationArea` it is matched by, server-side, the same
/// way the Events and Dining area filters work (IOS-DD-BROWSE-17). It used to
/// substring-match the name over the first 60 rows of each table, so East
/// Village (whose addresses never say "East Village") was always empty and
/// "3500 Urbandale Ave, Des Moines" counted as Urbandale.
struct Neighborhood: Identifiable, Hashable {
    let slug: String
    let name: String
    let blurb: String
    let highlights: [String]
    let area: LocationArea

    var id: String { slug }

    static let all: [Neighborhood] = [
        Neighborhood(slug: "downtown", name: "Downtown / Court Ave",
            blurb: "The skyline blocks around Court Avenue, with the riverfront, the Sculpture Park and the Saturday market.",
            highlights: ["Court Avenue", "Pappajohn Sculpture Park", "Principal Riverwalk"],
            area: .downtown),
        Neighborhood(slug: "east-village", name: "East Village",
            blurb: "Walkable downtown district packed with independent shops, patios, and nightlife.",
            highlights: ["Independent boutiques", "Craft cocktail bars", "Farmers' Market"],
            area: .eastVillage),
        Neighborhood(slug: "ingersoll", name: "Ingersoll",
            blurb: "A long run of local restaurants, bakeries and shops just west of downtown.",
            highlights: ["Ingersoll Avenue", "Grand Avenue", "Local restaurants"],
            area: .ingersoll),
        Neighborhood(slug: "valley-junction", name: "Valley Junction",
            blurb: "Historic Fifth Street in West Des Moines, with antique shops, galleries and a summer farmers' market.",
            highlights: ["Fifth Street", "Antique shops", "Farmers' market"],
            area: .valleyJunction),
        Neighborhood(slug: "west-des-moines", name: "West Des Moines",
            blurb: "Historic Valley Junction plus modern shopping and dining at Jordan Creek.",
            highlights: ["Valley Junction", "Jordan Creek Town Center", "Raccoon River Park"],
            area: .westDesMoines),
        Neighborhood(slug: "ankeny", name: "Ankeny",
            blurb: "Fast-growing northern suburb with parks, trails, and a lively dining scene.",
            highlights: ["The District", "High Trestle Trail", "Prairie Ridge"],
            area: .ankeny),
        Neighborhood(slug: "urbandale", name: "Urbandale",
            blurb: "Family-friendly suburb home to Living History Farms and Walker Johnston Park.",
            highlights: ["Living History Farms", "Walker Johnston Park", "Olde Town"],
            area: .urbandale),
        Neighborhood(slug: "johnston", name: "Johnston",
            blurb: "Lakeside living near Saylorville with green spaces and growing eateries.",
            highlights: ["Saylorville Lake", "Terra Park", "Crown Point"],
            area: .johnston),
        Neighborhood(slug: "clive", name: "Clive",
            blurb: "Greenbelt trails and quiet recreation in the heart of the metro.",
            highlights: ["Greenbelt Trail", "Campbell Recreation Area", "Clive Aquatic Center"],
            area: .clive),
        Neighborhood(slug: "waukee", name: "Waukee",
            blurb: "A growing western suburb with new parks and dining.",
            highlights: ["Kettlestone", "Sugar Creek", "Triumph Park"],
            area: .waukee),
        Neighborhood(slug: "altoona", name: "Altoona",
            blurb: "Home to Adventureland and Prairie Meadows on the metro's east side.",
            highlights: ["Adventureland", "Prairie Meadows", "Lakewood"],
            area: .altoona),
    ]

    static func bySlug(_ slug: String) -> Neighborhood? {
        all.first { $0.slug == slug }
    }
}
