import SwiftUI

/// Full-screen reveal for the Surprise Me single recommendation. Calls
/// `get_surprise_pick`, tracks `shown`/`saved`/`tried_another` outcomes
/// for acceptance-rate analysis.
///
/// IOS-DISCOVER-2026-008.
struct SurpriseMeView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var service = SurpriseMeService.shared
    @State private var pick: SurpriseMeService.Pick?
    /// On every Nth roll a labeled sponsored result is shown instead (IOS-ADS-015).
    @State private var sponsoredPick: SponsoredPickService.SponsoredPick?
    @State private var rollCount = 0
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var saveErrorMessage: String?
    @State private var isSaving = false
    @State private var revealed = false

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [Color.purple.opacity(0.15), Color.accentColor.opacity(0.05)],
                    startPoint: .top,
                    endPoint: .bottom,
                )
                .ignoresSafeArea()

                if isLoading {
                    loadingState
                } else if let sponsoredPick {
                    sponsoredReveal(for: sponsoredPick)
                } else if let pick {
                    revealCard(for: pick)
                } else if let errorMessage {
                    errorState(errorMessage)
                }
            }
            .navigationTitle("Surprise Me")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await load() }
            .alert("Couldn't Save", isPresented: .init(
                get: { saveErrorMessage != nil },
                set: { if !$0 { saveErrorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveErrorMessage ?? "")
            }
        }
    }

    // MARK: - States

    private var loadingState: some View {
        VStack(spacing: 16) {
            Image(systemName: "die.face.5")
                .font(.system(size: 64))
                .foregroundStyle(Color.purple.gradient)
                .symbolEffect(.bounce, value: isLoading)
                .accessibilityHidden(true)
            Text("Rolling…")
                .font(.title3.weight(.semibold))
            ProgressView()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Choosing your surprise")
    }

    private func revealCard(for pick: SurpriseMeService.Pick) -> some View {
        VStack(spacing: 16) {
            heroImage(url: pick.imageUrl)
                .frame(maxWidth: .infinity)
                .frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal)

            VStack(alignment: .leading, spacing: 8) {
                Text(pick.itemType.capitalized)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                Text(pick.title ?? "Tonight's pick")
                    .font(.title2.bold())
                Text(pick.reason)
                    .font(.body)
                    .foregroundStyle(.primary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)

            Spacer()

            VStack(spacing: 10) {
                Button {
                    save(pick)
                } label: {
                    Label(isSaving ? "Saving…" : "Save it — let's go",
                          systemImage: isSaving ? "hourglass" : "checkmark.circle.fill")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(.white)
                        .font(.headline)
                }
                .disabled(isSaving)
                .accessibilityHint("Saves this pick to your favorites and closes the surprise screen")

                Button {
                    tryAnother(pick)
                } label: {
                    Label("Try another", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .foregroundStyle(.primary)
                        .font(.subheadline.weight(.semibold))
                }
                .accessibilityHint("Rolls a new surprise pick")
            }
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
        .scaleEffect(revealed ? 1.0 : 0.92)
        .opacity(revealed ? 1.0 : 0)
        // Drive the reveal from the pick id, not .onAppear, so tapping "Try
        // another" (which reuses this view with a new pick) re-triggers the
        // animation instead of leaving the card stuck at opacity 0
        // (IOS-AUDIT-UX-025).
        .task(id: pick.id) {
            revealed = false
            withAnimation(.spring(response: 0.55, dampingFraction: 0.75)) {
                revealed = true
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    /// Labeled sponsored reveal (IOS-ADS-015) — shown occasionally instead of an
    /// organic pick. "Try another" rolls a fresh (organic) surprise.
    private func sponsoredReveal(for sponsored: SponsoredPickService.SponsoredPick) -> some View {
        VStack(spacing: 16) {
            Spacer(minLength: 0)
            SponsoredPickCard(pick: sponsored, surface: .surpriseMe)
                .padding(.horizontal)

            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                Task {
                    sponsoredPick = nil
                    await load(forceOrganic: true)
                }
            } label: {
                Label("Try another", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .foregroundStyle(.primary)
                    .font(.subheadline.weight(.semibold))
            }
            .padding(.horizontal)
            .accessibilityHint("Rolls a new surprise pick")
            Spacer(minLength: 0)
        }
        .scaleEffect(revealed ? 1.0 : 0.92)
        .opacity(revealed ? 1.0 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.75)) {
                revealed = true
            }
        }
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text(message)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button("Try again") { Task { await load() } }
                .buttonStyle(.borderedProminent)
        }
    }

    @ViewBuilder
    private func heroImage(url: String?) -> some View {
        if let url, URL(string: url) != nil {
            CachedAsyncImage(url: url)
                .scaledToFill()
                .clipped()
        } else {
            ZStack {
                Color.secondary.opacity(0.15)
                Image(systemName: "sparkles")
                    .font(.system(size: 40))
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
            }
        }
    }

    // MARK: - Actions

    private func load(forceOrganic: Bool = false) async {
        isLoading = true
        errorMessage = nil
        revealed = false
        sponsoredPick = nil
        rollCount += 1

        // Every Nth roll, try a labeled sponsored result instead (capped, never
        // every roll, free-tier only — IOS-ADS-015). Falls through to organic if
        // nothing is eligible.
        if !forceOrganic, rollCount % AdConfig.surpriseMeSponsoredEveryNthRoll == 0 {
            if let sponsored = await SponsoredPickService.shared.pick(for: .surpriseMe) {
                sponsoredPick = sponsored
                isLoading = false
                return
            }
        }

        do {
            pick = try await service.surprise(at: LocationService.shared.userLocation)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func save(_ pick: SurpriseMeService.Pick) {
        guard !isSaving else { return }
        Task { await performSave(pick) }
    }

    /// Adds the pick to the user's favorites (matching its item type) and only
    /// then reports success and dismisses (IOS-AUDIT-FEAT-013). Guards against
    /// toggling an already-saved item back off. The free-tier favorites cap
    /// surfaces the app-level upsell paywall via a notification, so on that path
    /// we dismiss without an extra error alert.
    private func performSave(_ pick: SurpriseMeService.Pick) async {
        isSaving = true
        defer { isSaving = false }

        let favorites = FavoritesService.shared
        let id = pick.itemId.uuidString
        do {
            switch pick.itemType.lowercased() {
            case "event":
                if !favorites.isEventFavorited(id) {
                    _ = try await favorites.toggleFavorite(eventId: id)
                }
            case "restaurant":
                if !favorites.isRestaurantFavorited(id) {
                    _ = try await favorites.toggleRestaurantFavorite(restaurantId: id)
                }
            case "attraction":
                if !favorites.isAttractionFavorited(id) {
                    _ = try await favorites.toggleFavoriteAttraction(attractionId: id)
                }
            default:
                // Unknown content type — surface rather than claim a false save.
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                saveErrorMessage = "This pick can't be saved right now."
                return
            }

            UINotificationFeedbackGenerator().notificationOccurred(.success)
            try? await service.track(pick: pick, outcome: .saved)
            dismiss()
        } catch {
            if FavoritesService.isLimitReached(error) {
                // The app-level favorites paywall is already presenting.
                dismiss()
            } else {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                saveErrorMessage = error.localizedDescription
            }
        }
    }

    private func tryAnother(_ pick: SurpriseMeService.Pick) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        Task {
            try? await service.track(pick: pick, outcome: .tried_another)
            await load()
        }
    }
}

#Preview {
    SurpriseMeView()
}
