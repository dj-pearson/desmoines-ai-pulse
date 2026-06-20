import SwiftUI

/// Action button row: calendar, external link, and reminder.
struct EventDetailActions: View {
    let event: Event
    let hasPremiumAccess: Bool
    let calendarAdded: Bool
    let isReminderSet: Bool
    let onAddToCalendar: () -> Void
    let onShowSubscription: () -> Void
    let onToggleReminder: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                // Add to Calendar — Insider+ feature
                if event.parsedDate != nil {
                    if hasPremiumAccess {
                        Button {
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            onAddToCalendar()
                        } label: {
                            Label(
                                calendarAdded ? "Added to Calendar" : "Add to Calendar",
                                systemImage: calendarAdded ? "checkmark.circle.fill" : "calendar.badge.plus"
                            )
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(
                                calendarAdded ? Color.green : Color.accentColor,
                                in: RoundedRectangle(cornerRadius: 12)
                            )
                            .foregroundStyle(.white)
                        }
                        .disabled(calendarAdded)
                        .accessibilityLabel(
                            calendarAdded
                                ? "\(event.title) added to calendar"
                                : "Add \(event.title) to your calendar"
                        )
                        .accessibilityHint(calendarAdded ? "" : "Adds event to your iOS Calendar app")
                    } else {
                        // Locked calendar button for free users
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            onShowSubscription()
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

                // External Link — content-supplied, so restrict to safe web
                // schemes (IOS-AUDIT-SEC-002); unsafe values render no button.
                if let url = event.sourceUrl.flatMap({ $0.safeWebURL }) {
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
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    onToggleReminder()
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
}

#Preview {
    EventDetailActions(
        event: .preview,
        hasPremiumAccess: true,
        calendarAdded: false,
        isReminderSet: false,
        onAddToCalendar: {},
        onShowSubscription: {},
        onToggleReminder: {}
    )
}
