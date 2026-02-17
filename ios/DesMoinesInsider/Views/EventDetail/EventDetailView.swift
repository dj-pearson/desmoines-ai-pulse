import SwiftUI

/// Full event detail view with hero image, description, actions, and related events.
struct EventDetailView: View {
    let event: Event

    @State private var viewModel = EventDetailViewModel()
    @State private var showShareSheet = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                heroImage
                contentSection
                actionsSection
                descriptionSection

                if !viewModel.relatedEvents.isEmpty {
                    relatedEventsSection
                }
            }
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
            .frame(height: 300)
            .clipped()

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
    }

    // MARK: - Content

    private var contentSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Date & Time
            if let date = event.parsedDate {
                HStack(spacing: 10) {
                    Image(systemName: "calendar")
                        .font(.title3)
                        .foregroundStyle(Color.accentColor)
                        .frame(width: 28)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(date.formatted(.dateTime.weekday(.wide).month(.wide).day().year()))
                            .font(.subheadline.weight(.semibold))
                        Text(date.formatted(.dateTime.hour().minute()))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    if let urgency = event.urgencyLabel {
                        Text(urgency)
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.orange, in: Capsule())
                    }
                }
            }

            Divider()

            // Location
            HStack(spacing: 10) {
                Image(systemName: "mappin.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.red)
                    .frame(width: 28)

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
                    .accessibilityLabel("Get directions")
                }
            }

            Divider()

            // Price
            HStack(spacing: 10) {
                Image(systemName: "ticket.fill")
                    .font(.title3)
                    .foregroundStyle(.green)
                    .frame(width: 28)

                if event.isFree {
                    Text("Free Event")
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
                    Text(distance)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
    }

    // MARK: - Actions

    private var actionsSection: some View {
        HStack(spacing: 12) {
            // Add to Calendar (native EventKit)
            if event.parsedDate != nil {
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
                .accessibilityLabel(viewModel.calendarAdded ? "Event added to calendar" : "Add event to your calendar")
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
