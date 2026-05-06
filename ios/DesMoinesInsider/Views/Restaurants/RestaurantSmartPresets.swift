import SwiftUI

// MARK: - Preset Definitions

/// One-tap filter scenarios. Mirrors the web app's RestaurantSmartPresets.
enum RestaurantPreset: String, CaseIterable, Identifiable {
    case openNow
    case dateNight
    case quickLunch
    case familyFriendly
    case lateNight
    case brunch
    case happyHour
    case healthy
    case withKids

    var id: String { rawValue }

    var label: String {
        switch self {
        case .openNow:        return "Open Now"
        case .dateNight:      return "Date Night"
        case .quickLunch:     return "Quick Lunch"
        case .familyFriendly: return "Family"
        case .lateNight:      return "Late Night"
        case .brunch:         return "Brunch"
        case .happyHour:      return "Happy Hour"
        case .healthy:        return "Healthy"
        case .withKids:       return "With Kids"
        }
    }

    var subtitle: String {
        switch self {
        case .openNow:        return "Eat right now"
        case .dateNight:      return "Upscale & romantic"
        case .quickLunch:     return "Fast & affordable"
        case .familyFriendly: return "Great for kids"
        case .lateNight:      return "Open late"
        case .brunch:         return "Weekend vibes"
        case .happyHour:      return "Drinks & deals"
        case .healthy:        return "Vegan & fresh"
        case .withKids:       return "Kid approved"
        }
    }

    var systemImage: String {
        switch self {
        case .openNow:        return "clock.fill"
        case .dateNight:      return "heart.fill"
        case .quickLunch:     return "bolt.fill"
        case .familyFriendly: return "person.2.fill"
        case .lateNight:      return "moon.fill"
        case .brunch:         return "cup.and.saucer.fill"
        case .happyHour:      return "wineglass.fill"
        case .healthy:        return "leaf.fill"
        case .withKids:       return "figure.2.and.child.holdinghands"
        }
    }

    var gradient: [Color] {
        switch self {
        case .openNow:        return [Color(red: 0.06, green: 0.72, blue: 0.51), Color(red: 0.02, green: 0.55, blue: 0.42)]
        case .dateNight:      return [Color(red: 0.95, green: 0.27, blue: 0.45), Color(red: 0.86, green: 0.14, blue: 0.47)]
        case .quickLunch:     return [Color(red: 1.00, green: 0.60, blue: 0.18), Color(red: 0.97, green: 0.38, blue: 0.11)]
        case .familyFriendly: return [Color(red: 0.24, green: 0.51, blue: 0.96), Color(red: 0.02, green: 0.71, blue: 0.83)]
        case .lateNight:      return [Color(red: 0.31, green: 0.27, blue: 0.90), Color(red: 0.55, green: 0.21, blue: 0.93)]
        case .brunch:         return [Color(red: 0.98, green: 0.75, blue: 0.14), Color(red: 0.96, green: 0.55, blue: 0.11)]
        case .happyHour:      return [Color(red: 0.55, green: 0.36, blue: 0.96), Color(red: 0.66, green: 0.33, blue: 0.97)]
        case .healthy:        return [Color(red: 0.06, green: 0.72, blue: 0.51), Color(red: 0.09, green: 0.64, blue: 0.29)]
        case .withKids:       return [Color(red: 0.02, green: 0.65, blue: 0.95), Color(red: 0.24, green: 0.51, blue: 0.96)]
        }
    }

    // MARK: - Filter bundle

    var priceRanges: [String] {
        switch self {
        case .dateNight:      return ["$$$", "$$$$"]
        case .quickLunch:     return ["$", "$$"]
        case .familyFriendly, .withKids: return ["$", "$$"]
        default:              return []
        }
    }

    var minRating: Double {
        switch self {
        case .dateNight: return 4.0
        default: return 0
        }
    }

    var openNow: Bool {
        switch self {
        case .openNow, .quickLunch, .lateNight, .happyHour: return true
        default: return false
        }
    }

    var dietary: [String] {
        switch self {
        case .healthy: return ["vegan", "vegetarian"]
        default: return []
        }
    }

    var sortBy: RestaurantSortOption {
        switch self {
        case .dateNight, .brunch, .healthy: return .rating
        default: return .popularity
        }
    }
}

// MARK: - Smart Presets Row

/// Horizontal scroll row of one-tap smart filter presets.
/// Tap a preset to apply it; tap again to clear. Mirrors the web experience.
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
                    ForEach(RestaurantPreset.allCases) { preset in
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
