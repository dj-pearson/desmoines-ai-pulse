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
    /// The pick resolved to its model, for the when/where line and the
    /// detail push (IOS-DD-DISCOVER-17).
    @State private var resolved: SurpriseResolved?
    /// Items shown recently, sent as p_exclude_ids so a re-roll does not hand
    /// back the same thing.
    @State private var recentIds: [UUID] = []
    @State private var path = NavigationPath()
    @State private var toast: ToastMessage?
    @State private var showSignIn = false
    @State private var pendingSave: SurpriseMeService.Pick?
    @State private var auth = AuthService.shared
    @State private var hasRolled = false

    var body: some View {
        NavigationStack(path: $path) {
            stage
                .navigationTitle("Surprise Me")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Close") { dismiss() }
                    }
                }
                // Once per presentation. The root reappears when a pushed
                // detail pops, and a bare .task re-rolled the pick then.
                .task {
                    guard !hasRolled else { return }
                    hasRolled = true
                    await load()
                }
                .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
                .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
                .toastOverlay(message: $toast)
                // Favorites need an account. The alert used to be a dead end with
                // only OK; MainTabView's sign-in sheet cannot present over this
                // full-screen cover, so this one is local (IOS-DD-DISCOVER-08).
                .sheet(isPresented: $showSignIn, onDismiss: resumeSaveAfterSignIn) {
                    NavigationStack { AuthView(isModal: true) }
                }
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

    /// The background and whichever state is current.
    private var stage: some View {
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
            } else {
                // IOS-AUDIT-UX-051 AC1. Reachable whenever service.surprise
                // RETURNS nil rather than throwing - a successful call that
                // simply found nothing. Without this branch the ZStack renders
                // only its gradient, so the screen looks like a failed load the
                // user cannot retry, on a feature whose entire purpose is to
                // hand them something.
                noResultState
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
            Button {
                openDetails(pick)
            } label: {
                revealSummary(for: pick)
            }
            .buttonStyle(.plain)
            // Not .disabled: that dims the whole reveal while offline.
            .allowsHitTesting(resolved != nil)
            .accessibilityHint(resolved == nil ? "" : "Opens details")

            Spacer()

            revealActions(for: pick)
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

    /// Image, type, title, when/where, and the reason. The reveal used to
    /// show only the type, a title and the reason, with no way in
    /// (IOS-DD-DISCOVER-17).
    private func revealSummary(for pick: SurpriseMeService.Pick) -> some View {
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
                Text(displayTitle(pick))
                    .font(.title2.bold())
                    .foregroundStyle(.primary)
                if let meta = resolved?.metaLine, !meta.isEmpty {
                    Text(meta)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                Text(pick.reason)
                    .font(.body)
                    .foregroundStyle(.primary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .multilineTextAlignment(.leading)
            .padding(.horizontal)
        }
        .contentShape(Rectangle())
    }

    private func revealActions(for pick: SurpriseMeService.Pick) -> some View {
        VStack(spacing: 10) {
            Button {
                save(pick)
            } label: {
                Label(isSaving ? "Saving..." : "Save it",
                      systemImage: isSaving ? "hourglass" : "heart.fill")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(.white)
                    .font(.headline)
            }
            .disabled(isSaving)
            .accessibilityHint("Saves this pick to your favorites")

            HStack(spacing: 10) {
                if resolved != nil {
                    Button {
                        openDetails(pick)
                    } label: {
                        Label("See details", systemImage: "info.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
                if let url = SurpriseResolved.shareURL(for: pick) {
                    ShareLink(
                        item: url,
                        subject: Text(displayTitle(pick)),
                        message: Text("Des Moines Insider picked \(displayTitle(pick)) for me")
                    ) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
            .font(.subheadline.weight(.semibold))

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
    }

    private func displayTitle(_ pick: SurpriseMeService.Pick) -> String {
        resolved?.title ?? pick.title ?? "Your pick"
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
        // IOS-AUDIT-BUG-010 AC2: keyed on the pick id, not .onAppear, exactly as
        // the organic reveal above already is. onAppear fires once per view
        // identity, and SwiftUI reuses this view across rolls -- so a second
        // sponsored pick in a row never re-ran the animation and, because
        // `revealed` is reset to false when a new pick loads, the card stayed at
        // opacity 0. An invisible ad that still counts as served (AC3).
        .task(id: sponsored.id) {
            revealed = false
            withAnimation(.spring(response: 0.55, dampingFraction: 0.75)) {
                revealed = true
            }
        }
    }

    /// Shown when the roll succeeded and found nothing.
    ///
    /// Deliberately worded as "nothing right now" rather than as a failure: the
    /// call worked, and telling the user something broke would be wrong. The
    /// button matches the error state so a retry is in the same place either way.
    private var noResultState: some View {
        VStack(spacing: 12) {
            Image(systemName: "sparkles")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("Nothing new to surprise you with right now.")
                .font(.headline)
                .multilineTextAlignment(.center)
            // There is no radius setting; the copy sent people looking for one
            // (IOS-DD-DISCOVER-17).
            Text("Try again later.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button("Try again") { Task { await load() } }
                .buttonStyle(.borderedProminent)
        }
        .padding()
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

    private func load(forceOrganic: Bool = false, isRetry: Bool = false) async {
        isLoading = true
        errorMessage = nil
        revealed = false
        sponsoredPick = nil
        // A failed re-roll used to leave the previous pick on screen, because
        // the body checks `pick` before `errorMessage` (IOS-DD-DISCOVER-17).
        pick = nil
        resolved = nil
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
            guard let next = try await service.surprise(
                at: LocationService.shared.userLocation,
                excluding: recentIds
            ) else {
                isLoading = false
                return
            }
            remember(next.itemId)
            switch await resolve(next) {
            case .found(let model):
                pick = next
                resolved = model
            case .unreachable:
                // Offline or similar: still show the pick, without the extras.
                pick = next
            case .gone:
                // Hidden, merged or closed since the RPC chose it. One silent
                // re-roll; after that, the no-result state.
                if !isRetry {
                    await load(forceOrganic: true, isRetry: true)
                    return
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func remember(_ id: UUID) {
        recentIds.removeAll { $0 == id }
        recentIds.append(id)
        if recentIds.count > 10 { recentIds.removeFirst(recentIds.count - 10) }
    }

    private enum Resolution {
        case found(SurpriseResolved)
        case gone
        case unreachable
    }

    private func resolve(_ pick: SurpriseMeService.Pick) async -> Resolution {
        let id = pick.itemId.uuidString
        do {
            switch pick.itemType.lowercased() {
            case "event":
                return .found(.event(try await EventsService.shared.fetchEvent(id: id)))
            case "restaurant":
                let restaurant = try await RestaurantsService.shared.fetchRestaurant(id: id)
                if restaurant.isMerged == true
                    || restaurant.lifecycle == .closedPermanently
                    || restaurant.lifecycle == .closedTemporarily {
                    return .gone
                }
                return .found(.restaurant(restaurant))
            default:
                return .unreachable
            }
        } catch {
            // fetchEvent answers PGRST116 for a merged, hidden or archived row.
            return FavoritesService.errorCode(error) == "PGRST116" ? .gone : .unreachable
        }
    }

    private func openDetails(_ pick: SurpriseMeService.Pick) {
        guard let resolved else { return }
        Task { try? await service.track(pick: pick, outcome: .opened) }
        switch resolved {
        case .event(let event): path.append(event)
        case .restaurant(let restaurant): path.append(restaurant)
        }
    }

    private func save(_ pick: SurpriseMeService.Pick) {
        guard !isSaving else { return }
        Task { await performSave(pick) }
    }

    /// Adds the pick to the user's favorites (matching its item type) and
    /// reports success with a toast, keeping the pick on screen so See details
    /// is the next step (IOS-DD-DISCOVER-17). It used to dismiss. Guards against
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
            toast = .success("Saved to your favorites")
            try? await service.track(pick: pick, outcome: .saved)
        } catch {
            if FavoritesService.isLimitReached(error) {
                // The app-level favorites paywall presents from the tab shell,
                // which it cannot do over this cover.
                dismiss()
            } else if case FavoritesService.FavoritesError.notAuthenticated = error {
                pendingSave = pick
                showSignIn = true
            } else {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                saveErrorMessage = error.localizedDescription
            }
        }
    }

    /// Finishes the save that asked for sign-in, if the user did sign in.
    private func resumeSaveAfterSignIn() {
        guard let pick = pendingSave else { return }
        pendingSave = nil
        guard auth.isAuthenticated else { return }
        Task { await performSave(pick) }
    }

    private func tryAnother(_ pick: SurpriseMeService.Pick) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        Task {
            try? await service.track(pick: pick, outcome: .tried_another)
            await load()
        }
    }
}

/// A Surprise Me pick resolved to its model (IOS-DD-DISCOVER-17).
enum SurpriseResolved {
    case event(Event)
    case restaurant(Restaurant)

    var title: String {
        switch self {
        case .event(let e): return e.title
        case .restaurant(let r): return r.name
        }
    }

    /// When and where for an event (Des Moines day and time, venue, Free);
    /// open status, price and cuisine for a restaurant.
    var metaLine: String {
        var parts: [String] = []
        switch self {
        case .event(let e):
            if let date = e.parsedDate { parts.append(e.cardDateText(date)) }
            parts.append(e.displayLocation)
            if e.isFree { parts.append("Free") }
        case .restaurant(let r):
            if let line = r.openStatus().line { parts.append(line) }
            if let price = r.priceRange, !price.isEmpty { parts.append(price) }
            if let cuisine = r.cuisine, !cuisine.isEmpty { parts.append(cuisine) }
        }
        return parts.joined(separator: " - ")
    }

    static func shareURL(for pick: SurpriseMeService.Pick) -> URL? {
        let section: String
        switch pick.itemType.lowercased() {
        case "event": section = "events"
        case "restaurant": section = "restaurants"
        case "attraction": section = "attractions"
        default: return nil
        }
        return Config.siteURL.appendingPathComponent(section).appendingPathComponent(pick.itemId.uuidString.lowercased())
    }
}

#Preview {
    SurpriseMeView()
}
