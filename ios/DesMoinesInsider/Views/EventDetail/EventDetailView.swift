import SwiftUI

/// Full event detail view with hero image, description, actions, and related events.
struct EventDetailView: View {
    let event: Event

    @State private var viewModel = EventDetailViewModel()
    @State private var showShareSheet = false
    @State private var showImageViewer = false
    @State private var notifications = LocalNotificationService.shared
    @State private var auth = AuthService.shared
    @State private var toast: ToastMessage?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The event actually rendered.
    ///
    /// Every subview below used to read the passed-in `event` directly, so the
    /// view model's own `event` - which loadEvent has always set - was written
    /// and never read by anything on screen. Refreshing it changed nothing.
    /// Reading through the view model here is what makes the background refresh
    /// visible; the passed-in row is the value until that returns
    /// (IOS-AUDIT-UX-058).
    private var displayEvent: Event { viewModel.event ?? event }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                EventDetailHeader(event: displayEvent, onImageTap: { showImageViewer = true })

                if viewModel.isUnavailable {
                    unavailableBanner
                }

                EventDetailInfo(event: displayEvent)

                // Insider take, key facts and FAQ the row already carries
                // (IOS-DD-EVENTS-21). Renders nothing when all are empty.
                EventDetailGoodToKnow(event: displayEvent)

                EventDetailActions(
                    event: displayEvent,
                    calendarAdded: viewModel.calendarAdded,
                    isReminderSet: notifications.isReminderSet(for: event.id),
                    onAddToCalendar: { Task { await viewModel.addToCalendar() } },
                    onToggleReminder: { Task { await toggleReminder() } }
                )

                // The "Insider Tips" paywall block was a client-side switch on
                // category sold as local secrets; EventDetailGoodToKnow above
                // shows the real content free (IOS-DD-MONETIZATION-12).

                // "Promote this listing" advertiser funnel (IOS-ADS-016) — shown
                // to admins/owners who manage listings. Opens the web campaign
                // checkout in Safari, NOT StoreKit (see PromoteListing.swift).
                if auth.isAdmin {
                    PromoteListingButton(
                        listing: .event(id: event.id, name: displayEvent.title),
                        style: .inline
                    )
                    .padding(.horizontal)
                    .padding(.top, 4)
                }

                ReviewsSection(contentType: "event", contentId: event.id)

                EventDetailRelated(relatedEvents: viewModel.relatedEvents)
            }
            .frame(maxWidth: .infinity)
        }
        .ignoresSafeArea(edges: .top)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 12) {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        showShareSheet = true
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Share event")

                    Button {
                        Task { await toggleFavorite() }
                    } label: {
                        Image(systemName: viewModel.isFavorited ? "heart.fill" : "heart")
                            .foregroundStyle(viewModel.isFavorited ? .red : .primary)
                    }
                    .accessibilityLabel(viewModel.isFavorited ? "Remove from saved" : "Save event")
                    .accessibilityValue(viewModel.isFavorited ? "Saved" : "Not saved")
                    .accessibilityAddTraits(viewModel.isFavorited ? .isSelected : [])
                }
            }
        }
        .sheet(isPresented: $showShareSheet) {
            // Text plus the link as its own item, so Messages builds a rich
            // preview from the page (IOS-DD-EVENTS-15).
            ShareSheet(items: shareItems)
        }
        .alert("Calendar", isPresented: .init(
            get: { viewModel.calendarError != nil },
            set: { if !$0 { viewModel.resetCalendarState() } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.calendarError ?? "")
        }
        .fullScreenCover(isPresented: $showImageViewer) {
            FullScreenImageViewer(
                imageUrl: displayEvent.imageUrl,
                isPresented: $showImageViewer,
                accessibilityDescription: "Photo of \(displayEvent.title)",
            )
        }
        .toastOverlay(message: $toast)
        .task {
            // Count the view for trending (IOS-DD-EVENTS-22). Same consent
            // posture as HomeRailOrdering: only an explicit decline stops it.
            let consent = ConsentService.shared
            if consent.analyticsConsent || !consent.hasCompletedConsent {
                let id = event.id
                Task.detached(priority: .background) {
                    await EventsService.shared.recordView(eventId: id)
                }
            }
            await viewModel.loadEvent(event)
            // A reminder for an event that no longer exists would fire for
            // nothing (IOS-DD-EVENTS-02).
            if viewModel.isUnavailable {
                notifications.cancelReminder(for: event.id)
            }
            // IOS-PARITY-007 — feed the Dashboard "Jump back in" rail.
            RecentlyViewedService.shared.record(
                type: "event", id: event.id, title: displayEvent.title, imageUrl: displayEvent.imageUrl
            )
        }
    }

    /// The share text, then the page link when there is one.
    private var shareItems: [Any] {
        var items: [Any] = [viewModel.shareText]
        if let url = viewModel.shareURL { items.append(url) }
        return items
    }

    // MARK: - Unavailable (IOS-DD-EVENTS-02)

    private var unavailableBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "calendar.badge.exclamationmark")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("This event is no longer available")
                .font(.subheadline.weight(.semibold))
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
        .padding(.top, 12)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Actions (IOS-DD-EVENTS-14)

    /// Save or unsave, with the same feedback as a card's heart
    /// (CardFavoriteButton): a toast either way, and a reason when it fails.
    private func toggleFavorite() async {
        let outcome = await viewModel.toggleFavorite()
        switch outcome {
        case .success(let nowSaved):
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            toast = nowSaved
                ? ToastMessage.success("Saved!", icon: "heart.fill")
                : ToastMessage.info("Removed from saved", icon: "heart")
        case .failure(let error):
            // The favorites cap shows the upsell paywall app-wide (IOS-SUB-011).
            if FavoritesService.isLimitReached(error) { return }
            if let favoritesError = error as? FavoritesService.FavoritesError,
               case .notAuthenticated = favoritesError {
                toast = .info("Sign in to save events", icon: "person.crop.circle")
            } else {
                toast = .error(error.localizedDescription, icon: "exclamationmark.triangle")
            }
        }
    }

    /// Set or clear the reminder and say what happened; every outcome but
    /// success used to be silent.
    private func toggleReminder() async {
        guard let result = await notifications.toggleReminder(for: displayEvent) else {
            toast = .info("Reminder removed", icon: "bell.slash")
            return
        }
        switch result {
        case .scheduled(let fireDate):
            let time = fireDate.formatted(DesMoinesTime.style(.dateTime.weekday(.abbreviated).hour().minute()))
            toast = .success("We'll remind you \(time)\(DesMoinesTime.zoneSuffix(at: fireDate))", icon: "bell.fill")
        case .tooSoon:
            toast = .info("It starts too soon for a reminder", icon: "clock")
        case .alreadyStarted:
            toast = .info("This event has already started", icon: "clock")
        case .denied:
            toast = .error("Turn on notifications in Settings", icon: "bell.slash")
        case .disabled:
            toast = .info("Event reminders are off in Settings", icon: "bell.slash")
        case .noDate:
            toast = .info("This event has no date yet", icon: "calendar")
        case .failed:
            toast = .error("Couldn't set the reminder", icon: "exclamationmark.triangle")
        }
    }
}

// MARK: - Share Sheet (UIKit wrapper)

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#Preview {
    NavigationStack {
        EventDetailView(event: .preview)
    }
}
