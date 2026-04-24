import SwiftUI

/// Peek-height map preview sheet shown when a marker is tapped.
/// Mirrors Android `MapPreviewSheet.kt`.
struct MapPreviewSheet: View {
    let name: String
    let category: String
    let imageURL: URL?
    let ratingText: String?
    let distanceText: String?
    let onDirections: () -> Void
    let onDetails: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Drag handle
            Capsule()
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 40, height: 4)
                .padding(.top, 8)

            HStack(spacing: 12) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        Color(.secondarySystemBackground)
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: PremiumTokens.cornerMd))

                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(.headline)
                        .lineLimit(1)
                    Text(category)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 4) {
                        if let ratingText {
                            Image(systemName: "star.fill")
                                .font(.caption2)
                                .foregroundStyle(.orange)
                            Text(ratingText)
                                .font(.caption)
                        }
                        if let distanceText {
                            if ratingText != nil {
                                Text("·")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Text(distanceText)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.top, 2)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)

            HStack(spacing: 10) {
                Button(action: onDirections) {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.circle")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .overlay(
                            RoundedRectangle(cornerRadius: PremiumTokens.cornerMd)
                                .stroke(Color.accentColor, lineWidth: 1.2)
                        )
                        .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)

                Button(action: onDetails) {
                    Text("Details")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(Color.accentColor)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: PremiumTokens.cornerMd))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 20)
        }
        .background(Color(.systemBackground))
        .clipShape(
            .rect(
                topLeadingRadius: 24,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 24
            )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(category)")
    }
}

/// Branded map annotation view with category color background and white icon.
/// Use as the content view of a SwiftUI Map Annotation.
struct CategoryMapMarker: View {
    let backgroundColor: Color
    var systemImage: String = "mappin"

    var body: some View {
        ZStack {
            Circle()
                .fill(backgroundColor)
                .frame(width: 36, height: 36)
                .shadow(color: .black.opacity(0.2), radius: 3, x: 0, y: 2)
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
        }
    }
}

#Preview {
    VStack {
        Spacer()
        CategoryMapMarker(backgroundColor: .purple)
        MapPreviewSheet(
            name: "Fong's Pizza",
            category: "Pizza · Downtown",
            imageURL: nil,
            ratingText: "4.6",
            distanceText: "0.3 mi",
            onDirections: {},
            onDetails: {}
        )
    }
}
