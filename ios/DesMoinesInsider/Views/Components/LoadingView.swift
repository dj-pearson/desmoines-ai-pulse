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

#Preview {
    LoadingView()
}
