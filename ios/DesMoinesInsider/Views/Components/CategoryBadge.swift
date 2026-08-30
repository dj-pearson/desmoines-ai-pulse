import SwiftUI

/// Pill-shaped category badge with icon and label.
struct CategoryBadge: View {
    let category: EventCategory
    var size: BadgeSize = .regular

    // Scaled against .caption2, which is the text style the regular badge used
    // to use directly - so the default rendering is unchanged and the
    // accessibility sizes now grow with it.
    @ScaledMetric(relativeTo: .caption2) private var labelScale: CGFloat = 1
    @ScaledMetric(relativeTo: .caption2) private var iconScale: CGFloat = 1

    enum BadgeSize {
        case small, regular

        /// Base point sizes. They are scaled by @ScaledMetric in the view rather
        /// than returned as a Font here (IOS-AUDIT-UX-052 AC1): a bare
        /// .system(size:) is frozen at 10pt whatever the user has chosen, so the
        /// badge stayed unreadable at the accessibility sizes while everything
        /// around it grew. An enum cannot hold @ScaledMetric, hence the split.
        var baseLabelSize: CGFloat {
            switch self {
            case .small: return 10
            case .regular: return 11
            }
        }

        var baseIconSize: CGFloat {
            switch self {
            case .small: return 8
            case .regular: return 10
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
                .font(.system(size: size.baseIconSize * iconScale))
            Text(category.displayName)
                .font(.system(size: size.baseLabelSize * labelScale, weight: .semibold))
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
        // The icon carries no information the label does not, so VoiceOver should
        // read one thing rather than an SF Symbol name followed by the text.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(category.displayName)
    }
}

#Preview {
    VStack(spacing: 10) {
        ForEach(EventCategory.allCases) { cat in
            CategoryBadge(category: cat)
        }
    }
}
