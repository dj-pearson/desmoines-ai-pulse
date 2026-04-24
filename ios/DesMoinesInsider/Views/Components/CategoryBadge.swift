import SwiftUI

/// Pill-shaped category badge with icon and label.
struct CategoryBadge: View {
    let category: EventCategory
    var size: BadgeSize = .regular

    enum BadgeSize {
        case small, regular

        var font: Font {
            switch self {
            case .small: return .system(size: 10, weight: .semibold)
            case .regular: return .caption2.weight(.semibold)
            }
        }

        var iconFont: Font {
            switch self {
            case .small: return .system(size: 8)
            case .regular: return .system(size: 10)
            }
        }

        var hPadding: CGFloat {
            switch self {
            case .small: return 6
            case .regular: return 8
            }
        }

        var vPadding: CGFloat {
            switch self {
            case .small: return 3
            case .regular: return 4
            }
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: category.icon)
                .font(size.iconFont)
            Text(category.displayName)
                .font(size.font)
        }
        .padding(.horizontal, size.hPadding + 2)
        .padding(.vertical, size.vPadding + 1)
        .foregroundStyle(.white)
        .background {
            Capsule(style: .continuous).fill(.ultraThinMaterial)
            Capsule(style: .continuous).fill(
                LinearGradient(
                    colors: [category.color.opacity(0.92), category.color.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        }
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(Color.white.opacity(0.25), lineWidth: 0.5)
        )
        .clipShape(Capsule(style: .continuous))
        .shadow(color: category.color.opacity(0.35), radius: 4, x: 0, y: 2)
    }
}

#Preview {
    VStack(spacing: 10) {
        ForEach(EventCategory.allCases) { cat in
            CategoryBadge(category: cat)
        }
    }
}
