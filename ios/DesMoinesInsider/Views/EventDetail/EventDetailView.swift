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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var hasPremiumAccess: Bool {
        storeKit.currentTier == .insider || storeKit.currentTier == .vip
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                heroImage
                contentSection
                actionsSection
                descriptionSection

                // Insider Tip — exclusive content for subscribers
                insiderTipSection

                if !viewModel.relatedEvents.isEmpty {
                    relatedEventsSection
                }
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
            SubscriptionView()
        }
        .task {
            await viewModel.loadEvent(event)
        }
    }

    // MARK: - Hero Image

    private var heroImage: some View {
        ZStack(alignment: .bottomLeading) {
            CachedAsyncImage(url: event.imageUrl) {
                ZStack {
                    Rectangle()
                        .fill(event.eventCategory.color.gradient)
                    Image(systemName: event.eventCategory.icon)
                        .font(.system(size: 64))
                        .foregroundStyle(.white.opacity(0.3))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 300, maxHeight: 300)
            // Decorative — title is in the text overlay below; hide from VoiceOver
            .accessibilityHidden(true)

            // Gradient overlay
            LinearGradient(
                colors: [.clear, .clear, .black.opacity(0.7)],
                startPoint: .top,
                endPoint: .bottom
            )

            // Title overlay
            VStack(alignment: .leading, spacing: 6) {
                CategoryBadge(category: event.eventCategory)

                Text(event.title)
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .lineLimit(3)
            }
            .padding()
        }
        // clip the ZStack so neither the image nor overlays can push layout wider than screen
        .clipped()
        .onTapGesture {
            if event.imageUrl != nil {
                showImageViewer = true
            }
        }
    }

    // MARK: - Content

    private var contentSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Date & Time — grouped so VoiceOver reads it as one element
            if let date = event.parsedDate {
                HStack(spacing: 10) {
                    Image(systemName: "calendar")
                        .font(.title3)
                        .foregroundStyle(Color.accentColor)
                        .frame(width: 28)
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(date.formatted(.dateTime.weekday(.wide).month(.wide).day().year()))
                            .font(.subheadline.weight(.semibold))
                        Text(date.formatted(.dateTime.hour().minute()))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    // Icon + text so urgency is not conveyed by colour alone
                    if let urgency = event.urgencyLabel {
                        Label(urgency, systemImage: "clock.badge.exclamationmark")
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.orange, in: Capsule())
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel({
                    var label = date.formatted(.dateTime.weekday(.wide).month(.wide).day().year())
                        + ", " + date.formatted(.dateTime.hour().minute())
                    if let urgency = event.urgencyLabel { label += ". \(urgency)" }
                    return label
                }())
            }

            Divider()

            // Location — grouped so VoiceOver reads venue + address together
            HStack(spacing: 10) {
                Image(systemName: "mappin.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.red)
                    .frame(width: 28)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    if let venue = event.venue {
                        Text(venue)
                            .font(.subheadline.weight(.semibold))
                    }
                    if let location = event.location, !location.isEmpty {
                        Text(location)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if let city = event.city {
                        Text(city)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                .accessibilityElement(children: .combine)

                Spacer()

                if event.coordinate != nil {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        openInMaps()
                    } label: {
                        Image(systemName: "arrow.triangle.turn.up.right.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.blue)
                    }
                    .accessibilityLabel("Get directions to \(event.venue ?? event.displayLocation)")
                }
            }

            Divider()

            // Price — icon + text so colour is not the only differentiator
            HStack(spacing: 10) {
                Image(systemName: "ticket.fill")
                    .font(.title3)
                    .foregroundStyle(.green)
                    .frame(width: 28)
                    .accessibilityHidden(true)

                if event.isFree {
                    Label("Free Event", systemImage: "checkmark.seal.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.green)
                } else if let price = event.price {
                    Text(price)
                        .font(.subheadline.weight(.semibold))
                } else {
                    Text("Price not listed")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            // Distance
            if let coord = event.coordinate,
               let distance = LocationService.shared.formattedDistance(from: coord) {
                HStack(spacing: 10) {
                    Image(systemName: "location.fill")
                        .font(.title3)
                        .foregroundStyle(.blue)
                        .frame(width: 28)
                        .accessibilityHidden(true)
                    Text(distance)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(distance) away")
            }
        }
        .padding()
    }

    // MARK: - Actions

    private var actionsSection: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                // Add to Calendar — Insider+ feature
                if event.parsedDate != nil {
                    if hasPremiumAccess {
                        Button {
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            Task { await viewModel.addToCalendar() }
                        } label: {
                            Label(
                                viewModel.calendarAdded ? "Added to Calendar" : "Add to Calendar",
                                systemImage: viewModel.calendarAdded ? "checkmark.circle.fill" : "calendar.badge.plus"
                            )
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(
                                viewModel.calendarAdded ? Color.green : Color.accentColor,
                                in: RoundedRectangle(cornerRadius: 12)
                            )
                            .foregroundStyle(.white)
                        }
                        .disabled(viewModel.calendarAdded)
                        .accessibilityLabel(
                            viewModel.calendarAdded
                                ? "\(event.title) added to calendar"
                                : "Add \(event.title) to your calendar"
                        )
                        .accessibilityHint(viewModel.calendarAdded ? "" : "Adds event to your iOS Calendar app")
                    } else {
                        // Locked calendar button for free users
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            showSubscription = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "lock.fill")
                                    .font(.caption)
                                Text("Add to Calendar")
                                    .font(.subheadline.weight(.medium))
                                PremiumBadge()
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color(.systemGray5), in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(.secondary)
                        }
                        .accessibilityLabel("Add to Calendar — requires Insider subscription")
                        .accessibilityHint("Tap to upgrade to Insider for calendar integration")
                    }
                }

                // External Link
                if let sourceUrl = event.sourceUrl, let url = URL(string: sourceUrl) {
                    Link(destination: url) {
                        Label("More Info", systemImage: "safari")
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color(.systemGray5), in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(.primary)
                    }
                    .accessibilityLabel("More info about \(event.title)")
                    .accessibilityHint("Opens in Safari")
                }
            }

            // Remind Me — uses icon + colour + text for state (no colour-only reliance)
            if event.parsedDate != nil {
                let isReminderSet = notifications.isReminderSet(for: event.id)
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    Task { await notifications.toggleReminder(for: event) }
                } label: {
                    Label(
                        isReminderSet ? "Reminder Set" : "Remind Me",
                        systemImage: isReminderSet ? "bell.fill" : "bell"
                    )
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        isReminderSet ? Color.orange : Color(.systemGray5),
                        in: RoundedRectangle(cornerRadius: 12)
                    )
                    .foregroundStyle(isReminderSet ? .white : .primary)
                }
                .accessibilityLabel(
                    isReminderSet
                        ? "Cancel reminder for \(event.title)"
                        : "Remind me about \(event.title)"
                )
                .accessibilityHint(
                    isReminderSet
                        ? "Removes your notification"
                        : "Sends a notification 1 hour before the event"
                )
                .accessibilitySelected(isReminderSet)
            }
        }
        .padding(.horizontal)
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !event.displayDescription.isEmpty {
                Text("About")
                    .font(.title3.bold())

                Text(event.displayDescription)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineSpacing(4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }

    // MARK: - Related Events

    private var relatedEventsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Related Events")
                .font(.title3.bold())
                .padding(.horizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(viewModel.relatedEvents) { related in
                        NavigationLink(value: related) {
                            RelatedEventCard(event: related)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical)
    }

    // MARK: - Insider Tip (Premium Content)

    @ViewBuilder
    private var insiderTipSection: some View {
        if hasPremiumAccess {
            // Show exclusive insider content for subscribers
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "star.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.orange)
                    Text("Insider Tip")
                        .font(.headline)
                        .foregroundStyle(.orange)
                    Spacer()
                    PremiumBadge(tier: storeKit.currentTier == .vip ? .vip : .insider)
                }

                Text(insiderTipText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineSpacing(3)
            }
            .padding()
            .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal)
            .padding(.top, 8)
        } else {
            // Teaser for free users showing they're missing exclusive content
            Button {
                showSubscription = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "lock.fill")
                        .font(.subheadline)
                        .foregroundStyle(.orange)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Insider Tips Available")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Text("Upgrade to get exclusive tips, calendar sync, and ad-free browsing")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(14)
                .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.orange.opacity(0.15), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .padding(.horizontal)
            .padding(.top, 8)
            .accessibilityLabel("Unlock Insider Tips by upgrading to a premium plan")
        }
    }

    /// Generates a contextual insider tip based on event attributes.
    private var insiderTipText: String {
        var tips: [String] = []

        if event.isFree {
            tips.append("This is a free event — arrive early for the best spots!")
        }

        if let venue = event.venue, venue.lowercased().contains("downtown") {
            tips.append("Parking can fill up fast downtown. Consider using the Des Moines Skywalk system or DART bus.")
        } else if event.coordinate != nil {
            tips.append("Check the map for nearby parking options. Rideshare drops off nearby too.")
        }

        switch event.eventCategory {
        case .music:
            tips.append("Bring ear protection for indoor venues. Outdoor shows are great with a blanket or lawn chair.")
        case .food:
            tips.append("Come hungry! Many food events offer sample-size portions so you can try everything.")
        case .outdoor:
            tips.append("Check the weather forecast and dress in layers. Iowa weather can change quickly!")
        case .family:
            tips.append("Most family events have activities for all ages. Strollers are usually welcome.")
        case .art:
            tips.append("Many art events feature local Des Moines artists. Ask about pieces — they love to talk about their work!")
        default:
            tips.append("Get there a bit early to find your spot and enjoy the full experience.")
        }

        return tips.joined(separator: " ")
    }

    // MARK: - Helpers

    private func openInMaps() {
        guard let coord = event.coordinate else { return }
        let url = URL(string: "maps://?daddr=\(coord.latitude),\(coord.longitude)")!
        UIApplication.shared.open(url)
    }
}

// MARK: - Related Event Card

private struct RelatedEventCard: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            CachedAsyncImage(url: event.imageUrl) {
                Rectangle()
                    .fill(event.eventCategory.color.opacity(0.2))
            }
            .frame(width: 180, height: 100)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Text(event.title)
                .font(.caption.weight(.semibold))
                .lineLimit(2)

            if let date = event.parsedDate {
                Text(date.formatted(.dateTime.month(.abbreviated).day()))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 180)
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
