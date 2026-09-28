import SwiftUI
import StoreKit

/// The single-screen UI for the Des Moines Insider App Clip.
///
/// Shows upcoming featured events and a prominent "Get the full app" CTA.
struct ClipRootView: View {
    let invocationURL: URL?

    @State private var viewModel = ClipEventsViewModel()
    /// The system App Store overlay for the parent app (IOS-DD-PLATFORM-04).
    /// It needs no App Store id: an App Clip's overlay always offers its
    /// parent. The numeric id (TODO(REL), still the 0000000000 sentinel) is
    /// Config.appStoreId in the app target, which the Clip cannot see.
    @State private var showAppOverlay = false
    @State private var didOfferOverlay = false

    private let fullAppURL = URL(string: "https://desmoinesinsider.com")!

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
        // Keyed on the URL: the Clip app sets invocationURL after the first
        // frame, and a plain .task never saw it (IOS-DD-PLATFORM-04).
        .task(id: invocationURL) {
            await viewModel.loadEvents(invocationURL: invocationURL)
        }
        .onChange(of: viewModel.hasLoadedOnce) { _, loaded in
            // Offer the full app once, after something is on screen.
            guard loaded, !didOfferOverlay else { return }
            didOfferOverlay = true
            showAppOverlay = true
        }
        .appStoreOverlay(isPresented: $showAppOverlay) {
            SKOverlay.AppClipConfiguration(position: .bottom)
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

            Text("Coming up in Des Moines - no sign-in required")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 16)
        }
    }

    @ViewBuilder
    private var eventsSection: some View {
        if viewModel.isLoading && viewModel.events.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
        } else if let error = viewModel.errorMessage, viewModel.events.isEmpty {
            errorState(error)
        } else if viewModel.events.isEmpty {
            emptyState
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

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Text(message)
                .foregroundStyle(.secondary)
            Button("Try again") {
                Task { await viewModel.loadEvents(invocationURL: invocationURL, force: true) }
            }
            .buttonStyle(.bordered)
        }
        .padding(.top, 40)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Text("Nothing listed right now")
                .foregroundStyle(.secondary)
            Link("Browse the website", destination: fullAppURL)
                .font(.subheadline.weight(.semibold))
        }
        .padding(.top, 40)
    }

    private var ctaSection: some View {
        VStack(spacing: 12) {
            Text("Want events, restaurants & more?")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // The system overlay for the parent app (IOS-DD-PLATFORM-04); the
            // website link below stays as the way out before the app is live.
            Button {
                showAppOverlay = true
            } label: {
                Label("Get the full app - Free", systemImage: "arrow.down.app.fill")
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
