import SwiftUI

extension Color {
    // MARK: - Brand Colors

    static let brand = Color("BrandPrimary", bundle: nil)
    static let brandSecondary = Color("BrandSecondary", bundle: nil)

    // MARK: - Semantic Colors

    static let cardBackground = Color(.systemBackground)
    static let cardShadow = Color.black.opacity(0.08)
    static let divider = Color(.separator)

    // MARK: - Category Colors (matching web app's category color scheme)

    static let eventMusic = Color.purple
    static let eventFood = Color.orange
    static let eventArt = Color.pink
    static let eventOutdoor = Color.green
    static let eventFamily = Color.cyan
    static let eventSports = Color.mint
    static let eventNightlife = Color.indigo
    static let eventGeneral = Color.blue
}

// MARK: - Dynamic Colors

extension ShapeStyle where Self == Color {
    static var subtleBackground: Color {
        Color(.systemGray6)
    }
}
