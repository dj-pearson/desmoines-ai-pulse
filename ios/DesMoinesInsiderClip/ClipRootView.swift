import SwiftUI

/// The single-screen UI for the Des Moines Insider App Clip.
///
/// Shows upcoming featured events and a prominent "Get the full app" CTA.
struct ClipRootView: View {
    let invocationURL: URL?

    @State private var viewModel = ClipEventsViewModel()

    private let appStoreURL = URL(string: "https://apps.apple.com/app/id/com.desmoines.aipulse")!
    private let fullAppURL  = URL(string: "https://desmoinesinsider.com")!

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground)
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        // ── Hero ──────────────────────────────────────────
                        heroSection

                        // ── Events list ───────────────────────────────────
                        eventsSection
                            .padding(.top, 8)

                        // ── CTA ───────────────────────────────────────────
                        ctaSection
                            .padding(.top, 24)
                            .padding(.bottom, 40)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Des Moines Insider")
                        .font(.headline)
                        .foregroundStyle(.primary)
                }
            }
        }
        .task {
            await viewModel.loadEvents(invocationURL: invocationURL)
        }
    }

    // MARK: - Sections

    private var heroSection: some View {
        VStack(spacing: 6) {
            Image(systemName: "mappin.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.blue)
                .padding(.top, 28)

            Text("What's Happening in Des Moines")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Text("Today's featured events — no sign-in required")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 16)
        }
    }

    @ViewBuilder
    private var eventsSection: some View {
        if viewModel.isLoading {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
        } else if let error = viewModel.errorMessage {
            Text(error)
                .foregroundStyle(.secondary)
                .padding(.top, 40)
        } else if viewModel.events.isEmpty {
            Text("No featured events today.")
                .foregroundStyle(.secondary)
                .padding(.top, 40)
        } else {
            VStack(spacing: 12) {
                ForEach(viewModel.events) { event in
                    Link(destination: event.appURL) {
                        ClipEventCard(event: event)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private var ctaSection: some View {
        VStack(spacing: 12) {
            Text("Want events, restaurants & more?")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // Opens App Store page; falls back to website if app not yet published
            Link(destination: appStoreURL) {
                Label("Get Des Moines Insider — Free", systemImage: "arrow.down.app.fill")
                    .font(.body.bold())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.blue)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }

            Link("Browse the website instead", destination: fullAppURL)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 24)
    }
}

// MARK: - Preview

#Preview {
    ClipRootView(invocationURL: nil)
}
