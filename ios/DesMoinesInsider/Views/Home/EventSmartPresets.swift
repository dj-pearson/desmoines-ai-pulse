import SwiftUI

// MARK: - Preset Definitions

/// One-tap event discovery scenarios that bundle multiple filters together.
enum EventPreset: String, CaseIterable, Identifiable {
    case freeWeekend
    case liveMusic
    case foodAndDrink
    case familyFun
    case artCulture
    case outdoors
    case tonight
    case thisWeek
    case featured

    var id: String { rawValue }

    var label: String {
        switch self {
        case .freeWeekend:  return "Free Weekend"
        case .liveMusic:    return "Live Music"
        case .foodAndDrink: return "Food & Drink"
        case .familyFun:    return "Family Fun"
        case .artCulture:   return "Art & Culture"
        case .outdoors:     return "Outdoors"
        case .tonight:      return "Tonight"
        case .thisWeek:     return "This Week"
        case .featured:     return "Featured"
        }
    }

    var subtitle: String {
        switch self {
        case .freeWeekend:  return "No cover charge"
        case .liveMusic:    return "Concerts & shows"
        case .foodAndDrink: return "Festivals & tastings"
        case .familyFun:    return "All ages welcome"
        case .artCulture:   return "Museums & galleries"
        case .outdoors:     return "Parks & nature"
        case .tonight:      return "Happening today"
        case .thisWeek:     return "Coming up soon"
        case .featured:     return "Editor's picks"
        }
    }

    var systemImage: String {
        switch self {
        case .freeWeekend:  return "ticket.fill"
        case .liveMusic:    return "music.note"
        case .foodAndDrink: return "fork.knife"
        case .familyFun:    return "figure.2.and.child.holdinghands"
        case .artCulture:   return "paintbrush.fill"
        case .outdoors:     return "leaf.fill"
        case .tonight:      return "sparkles"
        case .thisWeek:     return "calendar"
        case .featured:     return "star.fill"
        }
    }

    var gradient: [Color] {
        switch self {
        case .freeWeekend:  return [Color(red: 0.06, green: 0.72, blue: 0.51), Color(red: 0.08, green: 0.57, blue: 0.47)]
        case .liveMusic:    return [Color(red: 0.55, green: 0.36, blue: 0.96), Color(red: 0.66, green: 0.33, blue: 0.97)]
        case .foodAndDrink: return [Color(red: 1.00, green: 0.60, blue: 0.18), Color(red: 0.94, green: 0.27, blue: 0.27)]
        case .familyFun:    return [Color(red: 0.24, green: 0.51, blue: 0.96), Color(red: 0.02, green: 0.71, blue: 0.83)]
        case .artCulture:   return [Color(red: 0.95, green: 0.27, blue: 0.45), Color(red: 0.86, green: 0.14, blue: 0.47)]
        case .outdoors:     return [Color(red: 0.13, green: 0.77, blue: 0.37), Color(red: 0.09, green: 0.64, blue: 0.29)]
        case .tonight:      return [Color(red: 0.98, green: 0.75, blue: 0.14), Color(red: 0.96, green: 0.55, blue: 0.11)]
        case .thisWeek:     return [Color(red: 0.31, green: 0.27, blue: 0.90), Color(red: 0.23, green: 0.51, blue: 0.96)]
        case .featured:     return [Color(red: 0.98, green: 0.75, blue: 0.14), Color(red: 0.94, green: 0.27, blue: 0.27)]
        }
    }

    // MARK: - Filter bundle

    var category: EventCategory? {
        switch self {
        case .liveMusic:    return .music
        case .foodAndDrink: return .food
        case .familyFun:    return .family
        case .artCulture:   return .art
        case .outdoors:     return .outdoor
        default:            return nil
        }
    }

    var datePreset: DateFilterPreset? {
        switch self {
        case .freeWeekend: return .thisWeekend
        case .tonight:     return .today
        case .thisWeek:    return .thisWeek
        default:           return nil
        }
    }

    var free: Bool {
        self == .freeWeekend
    }

    var featured: Bool {
        self == .featured
    }
}

// MARK: - Smart Presets Row

/// Horizontal scroll row of one-tap event presets for the Home tab.
struct EventSmartPresets: View {
    @Bindable var viewModel: EventsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles").font(.caption2)
                Text("Quick picks").font(.caption.weight(.semibold))
            }
            .foregroundStyle(.secondary)
            .padding(.horizontal, 18)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(EventPreset.allCases) { preset in
                        presetPill(preset)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }
        }
    }

    private func presetPill(_ preset: EventPreset) -> some View {
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
    EventSmartPresets(viewModel: EventsViewModel())
}
