import Foundation
import os
import UserNotifications

/// Manages local notifications for event reminders.
@MainActor
@Observable
final class LocalNotificationService {
    static let shared = LocalNotificationService()

    private(set) var scheduledEventIds: Set<String> = []

    /// The Settings master switch for event reminders (IOS-AUDIT-BUG-012).
    ///
    /// It used to be written and read in exactly ONE place - the Toggle in
    /// SettingsView - and nowhere else in the app consulted it. Turning "Event
    /// Reminders" off changed nothing: already-scheduled reminders still fired,
    /// and an event page would happily schedule new ones. A settings switch
    /// wired to nothing is worse than a missing setting, because it tells the
    /// user something untrue.
    ///
    /// Living on the service rather than in the view is what makes it
    /// load-bearing: scheduleReminder consults it, and turning it off clears
    /// what is already pending.
    var remindersEnabled: Bool {
        didSet {
            guard remindersEnabled != oldValue else { return }
            UserDefaults.standard.set(remindersEnabled, forKey: Self.remindersEnabledKey)
            if !remindersEnabled {
                cancelAllReminders()
            }
        }
    }

    /// Unchanged from the key the Toggle already wrote, so a user who had
    /// switched reminders off keeps that preference across this change.
    private static let remindersEnabledKey = "eventRemindersEnabled"

    private init() {
        // Defaults to ON for anyone who has never touched the switch, which is
        // the behaviour they have had until now: UserDefaults.bool returns false
        // for a missing key, and defaulting to false would silently disable
        // reminders for every existing user on upgrade.
        remindersEnabled = UserDefaults.standard.object(forKey: Self.remindersEnabledKey) as? Bool ?? true
        Task { await refreshScheduledEvents() }
    }

    // MARK: - Schedule Reminder

    /// Schedules a local notification 1 hour before the event.
    func scheduleReminder(for event: Event) async {
        // The master switch, honoured here so every call site gets it.
        guard remindersEnabled else { return }
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
            AppLogger.general.error("Failed to schedule notification: \(error.localizedDescription)")
        }
    }

    // MARK: - Cancel Reminder

    func cancelReminder(for eventId: String) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["event-reminder-\(eventId)"])
        scheduledEventIds.remove(eventId)
    }

    /// Clears every pending event reminder. Used when the master switch goes off.
    func cancelAllReminders() {
        let center = UNUserNotificationCenter.current()
        let identifiers = scheduledEventIds.map { "event-reminder-\($0)" }
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
        scheduledEventIds.removeAll()
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
