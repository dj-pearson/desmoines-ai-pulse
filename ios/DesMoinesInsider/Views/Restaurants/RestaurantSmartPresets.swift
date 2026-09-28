import SwiftUI

// MARK: - Preset Definitions

/// One-tap filter scenarios. Date Night, Casual, Brunch and Healthy are the
/// web's RESTAURANT_PRESETS (src/lib/restaurantPresets.ts) with the same
/// filters; Open Now and New & coming soon are iOS additions
/// (IOS-DD-RESTAURANTS-07). Brunch used to filter nothing, Family and With
/// Kids were the same query, and Late Night / Happy Hour / Quick Lunch were
/// all just Open Now.
enum RestaurantPreset: String, CaseIterable, Identifiable {
    case openNow
    case dateNight
    case casual
    case brunch
    case healthy
    case newOpenings

    var id: String { rawValue }

    var label: String {
        switch self {
        case .openNow:     return "Open Now"
        case .dateNight:   return "Date Night"
        case .casual:      return "Casual ($-$$)"
        case .brunch:      return "Brunch"
        case .healthy:     return "Healthy"
        case .newOpenings: return "New & coming soon"
        }
    }

    var subtitle: String {
        switch self {
        case .openNow:     return "Eat right now"
        case .dateNight:   return "$$$ and up, 4+ stars"
        case .casual:      return "$ and $$"
        case .brunch:      return "Cafes and breakfast spots"
        case .healthy:     return "Vegetarian, vegan, salads"
        case .newOpenings: return "Just opened or on the way"
        }
    }

    var systemImage: String {
        switch self {
        case .openNow:     return "clock.fill"
        case .dateNight:   return "heart.fill"
        case .casual:      return "fork.knife"
        case .brunch:      return "cup.and.saucer.fill"
        case .healthy:     return "leaf.fill"
        case .newOpenings: return "sparkles"
        }
    }

    var gradient: [Color] {
        switch self {
        case .openNow:     return [Color(red: 0.06, green: 0.72, blue: 0.51), Color(red: 0.02, green: 0.55, blue: 0.42)]
        case .dateNight:   return [Color(red: 0.95, green: 0.27, blue: 0.45), Color(red: 0.86, green: 0.14, blue: 0.47)]
        case .casual:      return [Color(red: 1.00, green: 0.60, blue: 0.18), Color(red: 0.97, green: 0.38, blue: 0.11)]
        case .brunch:      return [Color(red: 0.98, green: 0.75, blue: 0.14), Color(red: 0.96, green: 0.55, blue: 0.11)]
        case .healthy:     return [Color(red: 0.06, green: 0.72, blue: 0.51), Color(red: 0.09, green: 0.64, blue: 0.29)]
        case .newOpenings: return [Color(red: 0.93, green: 0.35, blue: 0.20), Color(red: 0.80, green: 0.22, blue: 0.16)]
        }
    }

    // MARK: - Filter bundle

    var priceRanges: [String] {
        switch self {
        case .dateNight: return ["$$$", "$$$$"]
        case .casual:    return ["$", "$$"]
        case .openNow, .brunch, .healthy, .newOpenings: return []
        }
    }

    /// Cuisine facet values, matched case-sensitively as the web does.
    var cuisines: [String] {
        switch self {
        case .brunch:  return ["Cafe", "Brunch", "Breakfast"]
        case .healthy: return ["Vegetarian", "Vegan", "Health Food", "Salad"]
        case .openNow, .dateNight, .casual, .newOpenings: return []
        }
    }

    var minRating: Double {
        switch self {
        case .dateNight: return 4.0
        case .openNow, .casual, .brunch, .healthy, .newOpenings: return 0
        }
    }

    var openNow: Bool {
        self == .openNow
    }

    var newOpeningsOnly: Bool {
        self == .newOpenings
    }

    var dietary: [String] {
        []
    }

    var sortBy: RestaurantSortOption {
        switch self {
        case .dateNight, .brunch, .healthy: return .rating
        case .openNow, .casual, .newOpenings: return .popularity
        }
    }

    /// Presets that would change the result set given today's cuisine facet
    /// (availableRestaurantPresets on the web). A cuisine preset keeps only
    /// cuisines that exist and is dropped when none do, or while the facet is
    /// still loading, so a chip never returns nothing.
    static func available(cuisines present: [String]) -> [(preset: RestaurantPreset, cuisines: [String])] {
        let have = Set(present)
        var out: [(preset: RestaurantPreset, cuisines: [String])] = []
        for preset in allCases {
            if preset.cuisines.isEmpty {
                out.append((preset, []))
                continue
            }
            let kept = preset.cuisines.filter { have.contains($0) }
            if !kept.isEmpty { out.append((preset, kept)) }
        }
        return out
    }
}

// MARK: - Smart Presets Row

/// Horizontal scroll row of one-tap smart filter presets.
/// Tap a preset to apply it; tap again to clear.
struct RestaurantSmartPresets: View {
    @Bindable var viewModel: RestaurantsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.caption2)
                Text("Quick picks")
                    .font(.caption.weight(.semibold))
            }
            .foregroundStyle(.secondary)
            .padding(.horizontal, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(RestaurantPreset.available(cuisines: viewModel.availableCuisines).map { $0.preset }) { preset in
                        presetPill(preset)
                    }
                }
                .padding(.horizontal, 2)
                .padding(.vertical, 4)
            }
        }
    }

    private func presetPill(_ preset: RestaurantPreset) -> some View {
        let isActive = viewModel.activePreset == preset
        return Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            viewModel.applyPreset(preset)
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(
                            isActive
                                ? AnyShapeStyle(Color.white.opacity(0.22))
                                : AnyShapeStyle(LinearGradient(colors: preset.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                        )
                        .frame(width: 32, height: 32)
                    Image(systemName: preset.systemImage)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 1) {
                    Text(preset.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(isActive ? .white : .primary)
                    Text(preset.subtitle)
                        .font(.caption2)
                        .foregroundStyle(isActive ? .white.opacity(0.85) : .secondary)
                }
                .fixedSize()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                ZStack {
                    if isActive {
                        LinearGradient(colors: preset.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                    } else {
                        Color(.systemBackground)
                    }
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(isActive ? Color.clear : Color(.separator).opacity(0.5), lineWidth: 0.5)
            )
            .shadow(color: .black.opacity(isActive ? 0.15 : 0.05), radius: isActive ? 8 : 3, x: 0, y: 2)
            .scaleEffect(isActive ? 1.02 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isActive)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(preset.label), \(preset.subtitle)")
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }
}

#Preview {
    RestaurantSmartPresets(viewModel: RestaurantsViewModel())
        .padding()
}
