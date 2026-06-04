import SwiftUI

/// Full event detail view with hero image, description, actions, and related events.
struct EventDetailView: View {
    let event: Event

    @State private var viewModel = EventDetailViewModel()
    @State private var showShareSheet = false
    @State private var showImageViewer = false
    @State private var showSubscription = false
    @State private var notifications = LocalNotificationService.shared
    @State private var storeKit = StoreKitService.shared
    @State private var auth = AuthService.shared
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var hasPremiumAccess: Bool {
        storeKit.currentTier == .insider || storeKit.currentTier == .vip
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                EventDetailHeader(event: event, onImageTap: { showImageViewer = true })

                EventDetailInfo(event: event)

                EventDetailActions(
                    event: event,
                    hasPremiumAccess: hasPremiumAccess,
                    calendarAdded: viewModel.calendarAdded,
                    isReminderSet: notifications.isReminderSet(for: event.id),
                    onAddToCalendar: { Task { await viewModel.addToCalendar() } },
                    onShowSubscription: { showSubscription = true },
                    onToggleReminder: { Task { await notifications.toggleReminder(for: event) } }
                )

                EventDetailInsiderTips(
                    event: event,
                    hasPremiumAccess: hasPremiumAccess,
                    currentTier: storeKit.currentTier,
                    onShowSubscription: { showSubscription = true }
                )

                // "Promote this listing" advertiser funnel (IOS-ADS-016) — shown
                // to admins/owners who manage listings. Opens the web campaign
                // checkout in Safari, NOT StoreKit (see PromoteListing.swift).
                if auth.isAdmin {
                    PromoteListingButton(
                        listing: .event(id: event.id, name: event.title),
                        style: .inline
                    )
                    .padding(.horizontal)
                    .padding(.top, 4)
                }

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
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        Task { await viewModel.toggleFavorite() }
                    } label: {
                        Image(systemName: viewModel.isFavorited ? "heart.fill" : "heart")
                            .foregroundStyle(viewModel.isFavorited ? .red : .primary)
                    }
                    .accessibilityLabel(viewModel.isFavorited ? "Remove from saved" : "Save event")
                }
            }
        }
        .sheet(isPresented: $showShareSheet) {
            ShareSheet(items: [viewModel.shareText])
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
            FullScreenImageViewer(imageUrl: event.imageUrl, isPresented: $showImageViewer)
        }
        .sheet(isPresented: $showSubscription) {
            PaywallView(context: .insiderTips)
        }
        .task {
            await viewModel.loadEvent(event)
            // IOS-PARITY-007 — feed the Dashboard "Jump back in" rail.
            RecentlyViewedService.shared.record(
                type: "event", id: event.id, title: event.title, imageUrl: event.imageUrl
            )
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
