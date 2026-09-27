import SwiftUI

/// The Saved tab: a plan for the week (Happening now, Today, This weekend,
/// Next 7 days, Later, then collapsed past events), plus saved restaurants,
/// places and guides, filtered by a segment (IOS-DD-SAVED-18/19).
@MainActor
struct FavoritesView: View {
    @State private var viewModel = FavoritesViewModel()
    @State private var favorites = FavoritesService.shared
    @State private var router = SavedTabRouter.shared
    @State private var navigationPath = NavigationPath()
    @State private var showScrollToTop = false
    @State private var undoState: UndoRemoval?
    @State private var toast: ToastMessage?
    @State private var showPast = false
    @State private var showClearPastConfirm = false
    @Environment(\.horizontalSizeClass) private var sizeClass

    // body is split into three parts because as one expression it exceeded
    // the type checker's time limit in Xcode 26 (iOS CI, FavoritesView:19).
    var body: some View {
        NavigationStack(path: $navigationPath) {
            lifecycle(navigationChrome(stateContent))
        }
    }

    /// Which screen the tab is showing: sign-in, loading, offline, error,
    /// empty, or the saved plan.
    @ViewBuilder
    private var stateContent: some View {
        if !viewModel.isAuthenticated {
            signInPrompt
        } else if viewModel.isInitialLoading {
            loadingView
        } else if !viewModel.hasAnyFavorites && !NetworkMonitor.shared.isConnected {
            ScrollView {
                EmptyStateView(
                    icon: "wifi.slash",
                    title: "You're Offline",
                    message: "Your saved items couldn't be loaded. Check your internet connection and try again.",
                    actionTitle: "Retry",
                    action: { Task { await viewModel.refresh() } }
                )
                .padding(.top, 60)
            }
        } else if !viewModel.hasAnyFavorites && viewModel.loadError != nil {
            // A failed load used to fall through to "No Saved Items",
            // telling people their saves were gone (IOS-DD-SAVED-12).
            ScrollView {
                EmptyStateView(
                    icon: "exclamationmark.triangle",
                    title: "Couldn't load your saved items",
                    message: "Your saves are safe. Check your connection and try again.",
                    actionTitle: "Try Again",
                    action: { Task { await viewModel.refresh() } }
                )
                .padding(.top, 60)
            }
        } else if !viewModel.hasAnyFavorites {
            ScrollView {
                VStack(spacing: 24) {
                    EmptyStateView(
                        icon: "heart",
                        title: "No Saved Items",
                        message: "Events, restaurants, places and guides you save will appear here.",
                        actionTitle: "Find something this weekend",
                        action: { DeepLinkHandler.shared.open(.tab(.home)) }
                    )

                    SubscriptionBanner(style: .compact)
                        .padding(.horizontal, 24)
                }
                .padding(.top, 40)
            }
        } else {
            savedContent
        }
    }

    private func navigationChrome<Content: View>(_ content: Content) -> some View {
        content
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Saved")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if viewModel.isAuthenticated && viewModel.hasAnyFavorites {
                        ShareLink(item: planShareText, subject: Text("My Des Moines plans"))
                            .accessibilityLabel("Share my saved plans")
                    }
                }
            }
            .refreshable {
                await viewModel.refresh()
                if viewModel.loadError != nil && viewModel.hasAnyFavorites {
                    toast = .error("Couldn't refresh your saved items")
                } else {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
            }
            .navigationDestination(for: Event.self) { event in
                EventDetailView(event: event)
            }
            .navigationDestination(for: Restaurant.self) { restaurant in
                RestaurantDetailView(restaurant: restaurant)
            }
            .navigationDestination(for: Attraction.self) { attraction in
                AttractionDetailView(attraction: attraction)
            }
            .navigationDestination(for: Article.self) { article in
                ArticleDetailView(article: article)
            }
    }

    private func lifecycle<Content: View>(_ content: Content) -> some View {
        content
            // Load once; after that only reconcile, so a pop or a tab switch no
            // longer swaps the list for a full-screen spinner (IOS-DD-SAVED-13).
            .task {
                if !viewModel.hasLoadedOnce {
                    await viewModel.load()
                } else {
                    await viewModel.reconcile()
                }
            }
            .onChange(of: viewModel.isAuthenticated) { _, signedIn in
                if signedIn {
                    Task { await viewModel.load() }
                } else {
                    undoState?.commitTask?.cancel()
                    undoState = nil
                    showPast = false
                    viewModel.clear()
                }
            }
            .onChange(of: favorites.favoriteEventIds) { _, _ in Task { await viewModel.reconcile() } }
            .onChange(of: favorites.favoriteRestaurantIds) { _, _ in Task { await viewModel.reconcile() } }
            .onChange(of: favorites.favoriteAttractionIds) { _, _ in Task { await viewModel.reconcile() } }
            .onChange(of: favorites.favoriteArticleIds) { _, _ in Task { await viewModel.reconcile() } }
            .onChange(of: viewModel.transientError) { _, message in
                guard let message else { return }
                toast = .error(message)
                viewModel.transientError = nil
            }
            .confirmationDialog(
                "Remove \(pastCount) past event\(pastCount == 1 ? "" : "s") from Saved?",
                isPresented: $showClearPastConfirm,
                titleVisibility: .visible
            ) {
                Button("Clear past events", role: .destructive) {
                    Task { await viewModel.clearPastEvents() }
                }
            }
            .toastOverlay(message: $toast)
            .overlay(alignment: .bottom) {
                if let undo = undoState {
                    UndoToast(itemName: undo.name, onUndo: performUndo)
                        .padding(.bottom, 24)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .zIndex(100)
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: undoState != nil)
    }

    private var pastCount: Int {
        viewModel.eventGroups().first { $0.bucket == .past }?.events.count ?? 0
    }

    private var planShareText: String {
        SavedPlan.shareText(
            groups: viewModel.eventGroups(),
            restaurants: viewModel.favoriteRestaurants,
            attractions: viewModel.favoriteAttractions,
            title: "My Des Moines plans"
        )
    }

    // MARK: - Undo Support (IOS-DD-SAVED-08)
    //
    // A removal marks the item pending in FavoritesService, so hearts and
    // counts everywhere update at once, and commits after the undo window with
    // an idempotent delete. The old commit called the toggle, which re-saved an
    // item un-hearted elsewhere during the window.

    /// Commits the currently-pending removal now instead of letting its delayed
    /// task do it. Called when a new removal starts so the prior one is
    /// persisted rather than dropped with its cancelled timer
    /// (IOS-AUDIT-FEAT-017).
    private func flushPendingRemoval() {
        guard let pending = undoState else { return }
        pending.commitTask?.cancel()
        undoState = nil
        Task { await commit(pending.kind) }
    }

    private func startRemoval(_ kind: UndoRemoval.Kind) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        flushPendingRemoval()

        favorites.markPendingRemoval(kind: kind.favoriteKind, id: kind.id)
        switch kind {
        case .event(let event): viewModel.hide(event: event)
        case .restaurant(let restaurant): viewModel.hide(restaurant: restaurant)
        case .attraction(let attraction): viewModel.hide(attraction: attraction)
        case .article(let article): viewModel.hide(article: article)
        }

        let voiceOver = UIAccessibility.isVoiceOverRunning
        let announcement: String = "Removed \(kind.name). Undo available."
        AccessibilityNotification.Announcement(announcement).post()
        undoState = UndoRemoval(
            kind: kind,
            name: kind.name,
            commitTask: Task {
                try? await Task.sleep(for: .seconds(voiceOver ? 10 : 5))
                guard !Task.isCancelled else { return }
                await commit(kind)
            }
        )
    }

    /// Clears the toast BEFORE the network call, so Undo cannot be tapped
    /// while the delete is in flight and then silently lost.
    private func commit(_ kind: UndoRemoval.Kind) async {
        if undoState?.kind.key == kind.key { undoState = nil }
        // A re-save elsewhere cleared the mark during the window: nothing to
        // delete, and the hidden row comes back. (Undo cancels this task, so
        // it never gets here.) Without this the toast stayed up for good and
        // the row stayed hidden until the next full load.
        guard favorites.isPendingRemoval(kind: kind.favoriteKind, id: kind.id) else {
            restoreRow(kind)
            return
        }
        switch kind {
        case .event(let event): await viewModel.removeEventFavorite(event)
        case .restaurant(let restaurant): await viewModel.removeRestaurantFavorite(restaurant)
        case .attraction(let attraction): await viewModel.removeAttractionFavorite(attraction)
        case .article(let article): await viewModel.removeArticleFavorite(article)
        }
    }

    private func performUndo() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        guard let undo = undoState else { return }
        undo.commitTask?.cancel()
        favorites.clearPendingRemoval(kind: undo.kind.favoriteKind, id: undo.kind.id)
        restoreRow(undo.kind)
        undoState = nil
    }

    private func restoreRow(_ kind: UndoRemoval.Kind) {
        switch kind {
        case .event(let event): viewModel.restore(event: event)
        case .restaurant(let restaurant): viewModel.restore(restaurant: restaurant)
        case .attraction(let attraction): viewModel.restore(attraction: attraction)
        case .article(let article): viewModel.restore(article: article)
        }
    }

    // MARK: - Saved Content (Sections)

    private var savedContent: some View {
        let now = Date()
        let groups = viewModel.eventGroups(now: now)
        let segment = router.segment
        return ScrollViewReader { proxy in
        ScrollView {
            VStack(spacing: 20) {
                Color.clear.frame(height: 0).id("top")

                Picker("Show", selection: $router.segment) {
                    ForEach(SavedSegment.allCases) { segment in
                        Text(segment.title).tag(segment)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                // Favorites limit indicator for free users
                FavoritesLimitBanner(currentCount: viewModel.cappedFavoriteCount)
                    .padding(.horizontal)

                header(groups: groups)

                if viewModel.unavailableCount > 0 {
                    unavailableRow
                }

                if SavedSegment.showsEvents(segment) {
                    ForEach(groups.filter { $0.bucket != .past }) { group in
                        eventSection(group, now: now)
                    }
                    if let past = groups.first(where: { $0.bucket == .past }) {
                        pastSection(past, now: now)
                    }
                }

                if SavedSegment.showsDining(segment), !viewModel.favoriteRestaurants.isEmpty {
                    savedSection(title: "Restaurants", icon: "fork.knife", count: viewModel.favoriteRestaurants.count) {
                        ForEach(viewModel.favoriteRestaurants) { restaurant in
                            FavoriteRestaurantRow(
                                restaurant: restaurant,
                                onOpen: { navigationPath.append(restaurant) },
                                onRemove: { startRemoval(.restaurant(restaurant)) }
                            )
                        }
                    }
                }

                if SavedSegment.showsPlaces(segment), !viewModel.favoriteAttractions.isEmpty {
                    savedSection(title: "Places", icon: "star.fill", count: viewModel.favoriteAttractions.count) {
                        ForEach(viewModel.favoriteAttractions) { attraction in
                            FavoriteAttractionRow(
                                attraction: attraction,
                                onOpen: { navigationPath.append(attraction) },
                                onRemove: { startRemoval(.attraction(attraction)) }
                            )
                        }
                    }
                }

                if SavedSegment.showsGuides(segment), !viewModel.favoriteArticles.isEmpty {
                    savedSection(title: "Guides", icon: "doc.richtext", count: viewModel.favoriteArticles.count) {
                        ForEach(viewModel.favoriteArticles) { article in
                            FavoriteArticleRow(
                                article: article,
                                onOpen: { navigationPath.append(article) },
                                onRemove: { startRemoval(.article(article)) }
                            )
                        }
                    }
                }

                if !segmentHasContent(segment, groups: groups) {
                    Text("Nothing saved here yet. Tap the heart on any listing to save it.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.top, 24)
                }
            }
            .padding(.vertical)
            .trackScrollOffset(showScrollToTop: $showScrollToTop)
        }
        .scrollOffsetCoordinateSpace()
        .overlay(alignment: .bottomTrailing) {
            ScrollToTopButton(isVisible: showScrollToTop) {
                withAnimation { proxy.scrollTo("top") }
            }
        }
        } // ScrollViewReader
    }

    private func segmentHasContent(_ segment: SavedSegment, groups: [SavedEventGroup]) -> Bool {
        switch segment {
        case .all: return viewModel.hasAnyFavorites
        case .events: return !groups.isEmpty
        case .dining: return !viewModel.favoriteRestaurants.isEmpty
        case .places: return !viewModel.favoriteAttractions.isEmpty
        case .guides: return !viewModel.favoriteArticles.isEmpty
        }
    }

    private func header(groups: [SavedEventGroup]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let headline = SavedPlan.weekendHeadline(groups) {
                Text(headline)
                    .font(.title3.bold())
                    .accessibilityAddTraits(.isHeader)
            }
            Text("\(viewModel.totalFavoriteCount) saved item\(viewModel.totalFavoriteCount == 1 ? "" : "s")")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
    }

    /// Saves the server no longer returns still hold cap slots
    /// (IOS-DD-SAVED-22).
    private var unavailableRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.circle")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("\(viewModel.unavailableCount) saved item\(viewModel.unavailableCount == 1 ? " is" : "s are") no longer available")
                .font(.subheadline)
            Spacer(minLength: 8)
            Button("Remove") {
                Task { await viewModel.removeUnavailable() }
            }
            .font(.subheadline.weight(.semibold))
            .minHitTarget()
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
    }

    // MARK: - Event sections

    private func eventSection(_ group: SavedEventGroup, now: Date) -> some View {
        savedSection(title: group.bucket.title, icon: group.bucket.icon, count: group.events.count) {
            if group.bucket == .thisWeekend {
                weekendActions(group)
            }
        } content: {
            ForEach(group.events) { event in
                eventRow(event, isPast: false, now: now)
            }
        }
    }

    private func eventRow(_ event: Event, isPast: Bool, now: Date) -> some View {
        FavoriteEventRow(
            event: event,
            isPast: isPast,
            now: now,
            onOpen: { navigationPath.append(event) },
            onRemove: { startRemoval(.event(event)) },
            onToast: { toast = $0 }
        )
    }

    /// "Remind me for all" and share, on the This weekend header
    /// (IOS-DD-SAVED-24/25).
    private func weekendActions(_ group: SavedEventGroup) -> some View {
        HStack(spacing: 4) {
            Button {
                Task { await remindAll(group.events) }
            } label: {
                Image(systemName: "bell.badge")
            }
            .minHitTarget()
            .accessibilityLabel("Remind me for all this weekend's plans")

            ShareLink(
                item: SavedPlan.shareText(groups: [group], restaurants: [], attractions: [], title: "My Des Moines weekend"),
                subject: Text("My Des Moines weekend")
            ) {
                Image(systemName: "square.and.arrow.up")
            }
            .minHitTarget()
            .accessibilityLabel("Share this weekend's plans")
        }
        .font(.subheadline.weight(.semibold))
    }

    private func remindAll(_ events: [Event]) async {
        let notifications = LocalNotificationService.shared
        var scheduled = 0
        var firstOther: LocalNotificationService.ReminderResult?
        for event in events where !notifications.isReminderSet(for: event.id) {
            guard let result = await notifications.toggleReminder(for: event) else { continue }
            if case .scheduled = result {
                scheduled += 1
            } else if firstOther == nil {
                firstOther = result
            }
        }
        if scheduled > 0 {
            toast = .success("Reminders set for \(scheduled) event\(scheduled == 1 ? "" : "s")", icon: "bell.fill")
        } else if let firstOther {
            toast = reminderToast(firstOther)
        } else {
            toast = .info("Reminders are already set", icon: "bell.fill")
        }
    }

    /// Past events, collapsed, with a bulk clear (IOS-DD-SAVED-17/18).
    private func pastSection(_ group: SavedEventGroup, now: Date) -> some View {
        DisclosureGroup(isExpanded: $showPast) {
            VStack(spacing: 10) {
                Button(role: .destructive) {
                    showClearPastConfirm = true
                } label: {
                    Label("Clear past events", systemImage: "trash")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .minHitTarget()

                rowStack {
                    ForEach(group.events) { event in
                        eventRow(event, isPast: true, now: now)
                    }
                }
            }
            .padding(.top, 8)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: group.bucket.icon)
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
                Text("\(group.bucket.title) (\(group.events.count))")
                    .foregroundStyle(.primary)
            }
            .font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal)
    }

    // MARK: - Section Builder

    private func savedSection<Accessory: View, Content: View>(
        title: String,
        icon: String,
        count: Int,
        @ViewBuilder accessory: () -> Accessory,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .accessibilityAddTraits(.isHeader)
                Text("(\(count))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                accessory()
            }
            .padding(.horizontal)

            rowStack(content: content)
                .padding(.horizontal)
        }
    }

    private func savedSection<Content: View>(
        title: String,
        icon: String,
        count: Int,
        @ViewBuilder content: () -> Content
    ) -> some View {
        savedSection(title: title, icon: icon, count: count, accessory: { EmptyView() }, content: content)
    }

    /// One column on iPhone; an adaptive grid in the iPad detail pane, where a
    /// single stretched column wasted most of the width (IOS-DD-SAVED-28).
    @ViewBuilder
    private func rowStack<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if sizeClass == .regular {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 12)], spacing: 10) {
                content()
            }
        } else {
            LazyVStack(spacing: 10) {
                content()
            }
        }
    }

    // MARK: - Sign In Prompt

    private var signInPrompt: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "heart.circle")
                .font(.system(size: 64))
                .foregroundStyle(Color.accentColor.opacity(0.6))
                .accessibilityHidden(true)

            Text("Sign In to Save Items")
                .font(.title3.bold())

            Text("Create an account to save your favorite events and restaurants, and access them from any device.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            NavigationLink {
                AuthView()
            } label: {
                Text("Sign In")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 40)
            }

            Spacer()
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Loading saved items...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Reminder wording

/// The toast for a reminder outcome, worded as EventDetailView words it.
private func reminderToast(_ result: LocalNotificationService.ReminderResult?) -> ToastMessage {
    guard let result else { return .info("Reminder removed", icon: "bell.slash") }
    switch result {
    case .scheduled(let fireDate):
        let time = fireDate.formatted(DesMoinesTime.style(.dateTime.weekday(.abbreviated).hour().minute()))
        return .success("We'll remind you \(time)\(DesMoinesTime.zoneSuffix(at: fireDate))", icon: "bell.fill")
    case .tooSoon:
        return .info("It starts too soon for a reminder", icon: "clock")
    case .alreadyStarted:
        return .info("This event has already started", icon: "clock")
    case .denied:
        return .error("Turn on notifications in Settings", icon: "bell.slash")
    case .disabled:
        return .info("Event reminders are off in Settings", icon: "bell.slash")
    case .noDate:
        return .info("This event has no date yet", icon: "calendar")
    case .failed:
        return .error("Couldn't set the reminder", icon: "exclamationmark.triangle")
    }
}

// MARK: - Row shell (IOS-DD-SAVED-23/27)
//
// The navigation Button wraps only the image and text; the heart (and the
// bell for events) are siblings, so VoiceOver no longer finds a button inside
// a button. Remove is also an accessibility action and a context-menu item.
// Grouped backgrounds keep rows visible in dark mode.

@MainActor
private struct SavedRowShell<Content: View, Accessory: View>: View {
    let name: String
    let onOpen: () -> Void
    let onRemove: () -> Void
    @ViewBuilder let content: () -> Content
    @ViewBuilder let accessory: () -> Accessory
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(alignment: .top, spacing: 4) {
            Button(action: onOpen) {
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAction(named: "Remove from saved") { remove() }

            VStack(spacing: 0) {
                Button(action: remove) {
                    Image(systemName: "heart.fill")
                        .foregroundStyle(.red)
                        .font(.title3)
                }
                .buttonStyle(.plain)
                .minHitTarget()
                .accessibilityLabel("Remove \(name) from saved")

                accessory()
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    private func remove() {
        if reduceMotion { onRemove() } else { withAnimation { onRemove() } }
    }
}

/// Image beside text, or stacked at accessibility text sizes.
@MainActor
private struct SavedRowLayout<Thumbnail: View, Details: View>: View {
    @ViewBuilder let thumbnail: () -> Thumbnail
    @ViewBuilder let details: () -> Details
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 14))
        layout {
            thumbnail()
            VStack(alignment: .leading, spacing: 4) {
                details()
            }
        }
    }
}

private func savedThumbnail(url: String?, icon: String, tint: Color, dimmed: Bool = false) -> some View {
    CachedAsyncImage(url: url) {
        ZStack {
            Rectangle().fill(tint.opacity(0.15))
            Image(systemName: icon)
                .foregroundStyle(tint.opacity(0.5))
        }
    }
    .frame(width: 80, height: 80)
    .clipShape(RoundedRectangle(cornerRadius: 10))
    .opacity(dimmed ? 0.6 : 1.0)
    .accessibilityHidden(true)
}

// MARK: - Favorite Event Row

@MainActor
private struct FavoriteEventRow: View {
    let event: Event
    let isPast: Bool
    let now: Date
    let onOpen: () -> Void
    let onRemove: () -> Void
    let onToast: (ToastMessage) -> Void
    @State private var notifications = LocalNotificationService.shared
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var reminderSet: Bool { notifications.isReminderSet(for: event.id) }
    private var showsReminder: Bool { !isPast && !event.isOver(at: now) }

    var body: some View {
        SavedRowShell(name: event.title, onOpen: onOpen, onRemove: onRemove) {
            SavedRowLayout {
                savedThumbnail(url: event.imageUrl, icon: event.eventCategory.icon, tint: event.eventCategory.color, dimmed: isPast)
            } details: {
                Text(event.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                    .foregroundStyle(isPast ? .secondary : .primary)

                // Des Moines time, "Time TBA" for untimed rows, weekday
                // included (IOS-DD-SAVED-11).
                if let date = event.parsedDate {
                    Label(event.cardDateText(date), systemImage: "calendar")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Label(event.displayLocation, systemImage: "mappin")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                if !isPast, let urgency = event.urgency(at: now) {
                    Text(urgency)
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(PremiumTokens.urgencyFill, in: Capsule())
                }
            }
        } accessory: {
            if showsReminder {
                Button {
                    Task { onToast(reminderToast(await notifications.toggleReminder(for: event))) }
                } label: {
                    Image(systemName: reminderSet ? "bell.fill" : "bell")
                        .foregroundStyle(Color.accentColor)
                        .font(.body)
                }
                .buttonStyle(.plain)
                .minHitTarget()
                .accessibilityLabel(reminderSet ? "Reminder set" : "Remind me")
                .accessibilityHint(reminderSet ? "Removes the reminder for \(event.title)" : "Reminds you before \(event.title)")
            }
        }
        .contextMenu {
            Button(role: .destructive, action: onRemove) {
                Label("Remove from saved", systemImage: "heart.slash")
            }
            if showsReminder {
                Button {
                    Task { onToast(reminderToast(await notifications.toggleReminder(for: event))) }
                } label: {
                    Label(reminderSet ? "Remove reminder" : "Remind me", systemImage: reminderSet ? "bell.slash" : "bell")
                }
            }
            ShareLink(item: Config.siteURL.appendingPathComponent("events").appendingPathComponent(event.id)) {
                Label("Share", systemImage: "square.and.arrow.up")
            }
        }
    }
}

// MARK: - Favorite Restaurant Row

@MainActor
private struct FavoriteRestaurantRow: View {
    let restaurant: Restaurant
    let onOpen: () -> Void
    let onRemove: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        SavedRowShell(name: restaurant.name, onOpen: onOpen, onRemove: onRemove) {
            SavedRowLayout {
                savedThumbnail(url: restaurant.imageUrl, icon: "fork.knife", tint: .orange)
            } details: {
                Text(restaurant.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)

                if let cuisine = restaurant.cuisine {
                    HStack(spacing: 6) {
                        Text(cuisine)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let price = restaurant.priceRange {
                            Text(price)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                statusLine

                if let rating = restaurant.rating {
                    HStack(spacing: 3) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(.yellow)
                            .accessibilityHidden(true)
                        Text(String(format: "%.1f", rating))
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Rated \(String(format: "%.1f", rating))")
                }

                if !restaurant.displayLocation.isEmpty {
                    Label(restaurant.displayLocation, systemImage: "mappin")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        } accessory: {
            EmptyView()
        }
        .contextMenu {
            Button(role: .destructive, action: onRemove) {
                Label("Remove from saved", systemImage: "heart.slash")
            }
        }
    }

    /// Open / closing soon / closed, or a lifecycle note, as the Dining cards
    /// show it (IOS-DD-SAVED-27).
    @ViewBuilder
    private var statusLine: some View {
        if restaurant.lifecycle == .closedPermanently {
            Label("Closed permanently", systemImage: "xmark.octagon")
                .font(.caption.weight(.medium))
                .foregroundStyle(Color(.systemRed))
        } else if let pill = restaurant.statusPill {
            Label {
                Text(pill.text).foregroundStyle(.primary)
            } icon: {
                Image(systemName: pill.icon ?? "clock")
                    .foregroundStyle(pill.iconTint ?? pill.tint)
            }
            .font(.caption)
        }
    }
}

// MARK: - Favorite Attraction Row

@MainActor
private struct FavoriteAttractionRow: View {
    let attraction: Attraction
    let onOpen: () -> Void
    let onRemove: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        SavedRowShell(name: attraction.name, onOpen: onOpen, onRemove: onRemove) {
            SavedRowLayout {
                savedThumbnail(url: attraction.imageUrl, icon: attraction.attractionType.icon, tint: .purple)
            } details: {
                Text(attraction.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)

                Text(attraction.attractionType.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let rating = attraction.rating {
                    HStack(spacing: 3) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(.yellow)
                            .accessibilityHidden(true)
                        Text(String(format: "%.1f", rating))
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Rated \(String(format: "%.1f", rating))")
                }

                if let location = attraction.location, !location.isEmpty {
                    Label(location, systemImage: "mappin")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        } accessory: {
            EmptyView()
        }
        .contextMenu {
            Button(role: .destructive, action: onRemove) {
                Label("Remove from saved", systemImage: "heart.slash")
            }
        }
    }
}

// MARK: - Favorite Article Row (IOS-DD-SAVED-19)

@MainActor
private struct FavoriteArticleRow: View {
    let article: Article
    let onOpen: () -> Void
    let onRemove: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        SavedRowShell(name: article.title, onOpen: onOpen, onRemove: onRemove) {
            SavedRowLayout {
                savedThumbnail(url: article.featuredImageUrl, icon: "doc.richtext", tint: .blue)
            } details: {
                Text(article.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)

                Label(article.displayCategory, systemImage: "tag")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let date = article.formattedDate {
                    Label(date, systemImage: "calendar")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } accessory: {
            EmptyView()
        }
        .contextMenu {
            Button(role: .destructive, action: onRemove) {
                Label("Remove from saved", systemImage: "heart.slash")
            }
        }
    }
}

// MARK: - Undo Removal State

private struct UndoRemoval {
    enum Kind {
        case event(Event)
        case restaurant(Restaurant)
        case attraction(Attraction)
        case article(Article)

        var favoriteKind: FavoriteKind {
            switch self {
            case .event: return .event
            case .restaurant: return .restaurant
            case .attraction: return .attraction
            case .article: return .article
            }
        }

        var id: String {
            switch self {
            case .event(let e): return e.id
            case .restaurant(let r): return r.id
            case .attraction(let a): return a.id
            case .article(let a): return a.id
            }
        }

        var name: String {
            switch self {
            case .event(let e): return e.title
            case .restaurant(let r): return r.name
            case .attraction(let a): return a.name
            case .article(let a): return a.title
            }
        }

        var key: String { FavoritesService.key(favoriteKind, id) }
    }

    let kind: Kind
    let name: String
    var commitTask: Task<Void, Never>?
}

// MARK: - Undo Toast

private struct UndoToast: View {
    let itemName: String
    let onUndo: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "trash")
                .font(.body.weight(.semibold))
                .foregroundStyle(.red)

            Text("\"\(itemName)\" removed")
                .font(.subheadline.weight(.medium))
                .lineLimit(1)

            Spacer()

            Button {
                onUndo()
            } label: {
                Text("Undo")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.accentColor)
            }
            .minHitTarget()
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(.ultraThickMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 4)
        .padding(.horizontal)
        // One element with an Undo action; the old `.contain` container
        // hid its own label (IOS-DD-SAVED-23).
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Removed \(itemName)")
        .accessibilityAction(named: "Undo") { onUndo() }
    }
}

#Preview {
    FavoritesView()
}
