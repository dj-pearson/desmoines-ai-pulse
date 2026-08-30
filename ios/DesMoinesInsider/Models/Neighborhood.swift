import Foundation

/// A Des Moines neighborhood / suburb for the Neighborhoods hub (IOS-PARITY-006).
/// Mirrors the curated list on the web /neighborhoods page. Content (dining,
/// attractions, events) is matched at runtime by area name, with optional
/// device-location "nearby" sorting.
struct Neighborhood: Identifiable, Hashable {
    let slug: String
    let name: String
    let blurb: String
    let highlights: [String]

    var id: String { slug }

    /// Names/tokens used to match a listing's city/location/venue to this area.
    /// Includes the display name plus any aliases.
    var matchTerms: [String] { [name] }

    /// Whether a free-text location string belongs to this neighborhood.
    func matches(_ location: String?) -> Bool {
        guard let location, !location.isEmpty else { return false }
        let lower = location.lowercased()
        return matchTerms.contains { lower.contains($0.lowercased()) }
    }

    static let all: [Neighborhood] = [
        Neighborhood(slug: "east-village", name: "East Village",
            blurb: "Walkable downtown district packed with independent shops, patios, and nightlife.",
            highlights: ["Independent boutiques", "Craft cocktail bars", "Farmers' Market"]),
        Neighborhood(slug: "west-des-moines", name: "West Des Moines",
            blurb: "Historic Valley Junction plus modern shopping and dining at Jordan Creek.",
            highlights: ["Valley Junction", "Jordan Creek Town Center", "Raccoon River Park"]),
        Neighborhood(slug: "ankeny", name: "Ankeny",
            blurb: "Fast-growing northern suburb with parks, trails, and a lively dining scene.",
            highlights: ["The District", "High Trestle Trail", "Prairie Ridge"]),
        Neighborhood(slug: "urbandale", name: "Urbandale",
            blurb: "Family-friendly suburb home to Living History Farms and Walker Johnston Park.",
            highlights: ["Living History Farms", "Walker Johnston Park", "Olde Town"]),
        Neighborhood(slug: "johnston", name: "Johnston",
            blurb: "Lakeside living near Saylorville with green spaces and growing eateries.",
            highlights: ["Saylorville Lake", "Terra Park", "Crown Point"]),
        Neighborhood(slug: "clive", name: "Clive",
            blurb: "Greenbelt trails and quiet recreation in the heart of the metro.",
            highlights: ["Greenbelt Trail", "Campbell Recreation Area", "Clive Aquatic Center"]),
        Neighborhood(slug: "waukee", name: "Waukee",
            blurb: "One of Iowa's fastest-growing cities with new parks and dining.",
            highlights: ["Kettlestone", "Sugar Creek", "Triumph Park"]),
        Neighborhood(slug: "altoona", name: "Altoona",
            blurb: "Home to Adventureland and Prairie Meadows on the metro's east side.",
            highlights: ["Adventureland", "Prairie Meadows", "Lakewood"]),
    ]

    static func bySlug(_ slug: String) -> Neighborhood? {
        all.first { $0.slug == slug }
    }
}
