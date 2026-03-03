import Foundation
import UserNotifications

/// Manages local notifications for event reminders.
@MainActor
@Observable
final class LocalNotificationService {
    static let shared = LocalNotificationService()

    private(set) var scheduledEventIds: Set<String> = []

    private init() {
        Task { await refreshScheduledEvents() }
    }

    // MARK: - Schedule Reminder

    /// Schedules a local notification 1 hour before the event.
    func scheduleReminder(for event: Event) async {
        guard let eventDate = event.parsedDate else { return }

        let center = UNUserNotificationCenter.current()

        // Request permission if needed
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            let granted = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
            guard granted == true else { return }
        } else if settings.authorizationStatus == .denied {
            return
        }

        // Schedule 1 hour before
        let triggerDate = eventDate.addingTimeInterval(-3600)
        guard triggerDate > Date() else { return }

        let content = UNMutableNotificationContent()
        content.title = "Event Reminder"
        content.body = "\(event.title) starts in 1 hour"
        if let venue = event.venue {
            content.body += " at \(venue)"
        }
        content.sound = .default
        content.userInfo = ["eventId": event.id]

        let components = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: triggerDate
        )
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)

        let request = UNNotificationRequest(
            identifier: "event-reminder-\(event.id)",
            content: content,
            trigger: trigger
        )

        do {
            try await center.add(request)
            scheduledEventIds.insert(event.id)
        } catch {
            print("Failed to schedule notification: \(error.localizedDescription)")
        }
    }

    // MARK: - Cancel Reminder

    func cancelReminder(for eventId: String) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["event-reminder-\(eventId)"])
        scheduledEventIds.remove(eventId)
    }

    // MARK: - Toggle

    func toggleReminder(for event: Event) async {
        if isReminderSet(for: event.id) {
            cancelReminder(for: event.id)
        } else {
            await scheduleReminder(for: event)
        }
    }

    // MARK: - Check

    func isReminderSet(for eventId: String) -> Bool {
        scheduledEventIds.contains(eventId)
    }

    // MARK: - Refresh

    /// Syncs scheduledEventIds with what's actually pending in the notification center.
    func refreshScheduledEvents() async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let ids = pending
            .filter { $0.identifier.hasPrefix("event-reminder-") }
            .compactMap { $0.content.userInfo["eventId"] as? String }
        scheduledEventIds = Set(ids)
    }
}
