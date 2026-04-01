import SwiftUI

/// Full-screen loading indicator.
struct LoadingView: View {
    var message: String = "Loading..."

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Inline loading indicator for lists.
struct InlineLoadingView: View {
    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
            Text("Loading more...")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
}

/// Skeleton placeholder for detail page hero sections.
struct DetailHeroSkeleton: View {
    var body: some View {
        VStack(spacing: 0) {
            // Hero image area
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: 0)
                    .fill(Color(.systemGray5))
                    .frame(height: 300)

                // Gradient overlay
                LinearGradient(
                    colors: [.clear, .clear, .black.opacity(0.3)],
                    startPoint: .top,
                    endPoint: .bottom
                )

                // Title/badge placeholders
                VStack(alignment: .leading, spacing: 8) {
                    // Category badge
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color(.systemGray4))
                        .frame(width: 80, height: 24)

                    // Title lines
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray4))
                        .frame(width: 240, height: 22)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray4))
                        .frame(width: 160, height: 22)
                }
                .padding()
            }
        }
        .redacted(reason: .placeholder)
        .shimmer()
    }
}

/// Full skeleton for EventDetailView (hero + info + action buttons).
struct EventDetailSkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                DetailHeroSkeleton()

                // Date/time section
                HStack(spacing: 12) {
                    skeletonRect(width: 20, height: 20)
                    skeletonRect(width: 180, height: 14)
                    Spacer()
                }
                .padding()

                // Info rows
                VStack(alignment: .leading, spacing: 16) {
                    infoRow(iconWidth: 16, textWidth: 140)
                    infoRow(iconWidth: 16, textWidth: 100)
                    infoRow(iconWidth: 16, textWidth: 60)

                    Divider()

                    // Description block
                    ForEach(0..<4, id: \.self) { i in
                        skeletonRect(width: i == 3 ? 200 : .infinity, height: 12)
                    }
                }
                .padding(.horizontal)

                // Action buttons
                HStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in
                        skeletonRect(width: .infinity, height: 44)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
                .padding()
            }
        }
        .redacted(reason: .placeholder)
        .shimmer()
    }

    private func infoRow(iconWidth: CGFloat, textWidth: CGFloat) -> some View {
        HStack(spacing: 10) {
            skeletonRect(width: iconWidth, height: iconWidth)
            skeletonRect(width: textWidth, height: 14)
            Spacer()
        }
    }

    private func skeletonRect(width: CGFloat, height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(Color(.systemGray5))
            .frame(maxWidth: width == .infinity ? .infinity : nil, minWidth: nil, idealWidth: nil)
            .frame(width: width == .infinity ? nil : width, height: height)
    }
}

/// Full skeleton for RestaurantDetailView (hero + info + action buttons).
struct RestaurantDetailSkeleton: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                DetailHeroSkeleton()

                VStack(alignment: .leading, spacing: 16) {
                    // Rating + price row
                    HStack(spacing: 12) {
                        HStack(spacing: 3) {
                            ForEach(0..<5, id: \.self) { _ in
                                skeletonRect(width: 14, height: 14)
                            }
                        }
                        skeletonRect(width: 40, height: 14)
                        Spacer()
                        skeletonRect(width: 70, height: 22)
                            .clipShape(Capsule())
                    }

                    // Info rows
                    infoRow(textWidth: 160)
                    infoRow(textWidth: 120)
                    infoRow(textWidth: 100)

                    Divider()

                    // Description
                    ForEach(0..<5, id: \.self) { i in
                        skeletonRect(width: i == 4 ? 180 : .infinity, height: 12)
                    }
                }
                .padding()

                // Action buttons
                HStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in
                        skeletonRect(width: .infinity, height: 44)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
                .padding(.horizontal)
            }
        }
        .redacted(reason: .placeholder)
        .shimmer()
    }

    private func infoRow(textWidth: CGFloat) -> some View {
        HStack(spacing: 10) {
            skeletonRect(width: 16, height: 16)
            skeletonRect(width: textWidth, height: 14)
            Spacer()
        }
    }

    private func skeletonRect(width: CGFloat, height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(Color(.systemGray5))
            .frame(maxWidth: width == .infinity ? .infinity : nil)
            .frame(width: width == .infinity ? nil : width, height: height)
    }
}

#Preview {
    LoadingView()
}
