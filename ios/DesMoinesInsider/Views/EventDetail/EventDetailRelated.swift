import SwiftUI

/// Horizontal carousel of related events with navigation links.
struct EventDetailRelated: View {
    let relatedEvents: [Event]

    var body: some View {
        if !relatedEvents.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("Related Events")
                    .font(.title3.bold())
                    .padding(.horizontal)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(relatedEvents) { related in
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
    }
}

// MARK: - Related Event Card

struct RelatedEventCard: View {
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

#Preview {
    NavigationStack {
        EventDetailRelated(relatedEvents: [.preview])
    }
}
