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

#Preview {
    LoadingView()
}
