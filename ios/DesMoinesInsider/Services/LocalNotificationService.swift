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

    /// What happened when a reminder was asked for (IOS-DD-EVENTS-14). Every
    /// early return used to be silent, so a denied permission, a switched-off
    /// setting or an event under an hour away all looked like success.
    enum ReminderResult: Equatable {
        case scheduled(Date)
        case tooSoon
        case alreadyStarted
        case denied
        case disabled
        case noDate
        case failed
    }

    /// When to fire, or nil when it is too late. Pure, so the timing is tested
    /// without the notification center.
    ///
    /// A timed event: an hour before, or fifteen minutes before when the hour
    /// has passed. A time-TBA event: 9:00 Des Moines time on its day, since
    /// "an hour before" a time nobody published means nothing.
    nonisolated static func reminderFireDate(eventStart: Date, hasSpecificTime: Bool, now: Date) -> Date? {
        if hasSpecificTime {
            let hourBefore = eventStart.addingTimeInterval(-3600)
            if hourBefore > now { return hourBefore }
            let quarterBefore = eventStart.addingTimeInterval(-15 * 60)
            if quarterBefore > now { return quarterBefore }
            return nil
        }
        let calendar = DesMoinesTime.calendar
        let morning = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: eventStart)
        guard let morning, morning > now else { return nil }
        return morning
    }

    /// Schedules a local notification ahead of the event.
    @discardableResult
    func scheduleReminder(for event: Event) async -> ReminderResult {
        // The master switch, honoured here so every call site gets it.
        guard remindersEnabled else { return .disabled }
        guard let eventDate = event.parsedDate else { return .noDate }

        let now = Date()
        guard let triggerDate = Self.reminderFireDate(
            eventStart: eventDate, hasSpecificTime: event.hasSpecificTime, now: now
        ) else {
            return eventDate <= now ? .alreadyStarted : .tooSoon
        }

        let center = UNUserNotificationCenter.current()

        // Request permission if needed
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            let granted = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
            guard granted == true else { return .denied }
        } else if settings.authorizationStatus == .denied {
            return .denied
        }

        let content = UNMutableNotificationContent()
        content.title = "Event Reminder"
        if !event.hasSpecificTime {
            content.body = "\(event.title) is today"
        } else if eventDate.timeIntervalSince(triggerDate) < 3600 {
            content.body = "\(event.title) starts in 15 minutes"
        } else {
            content.body = "\(event.title) starts in 1 hour"
        }
        if let venue = event.venue {
            content.body += " at \(venue)"
        }
        content.sound = .default
        content.userInfo = ["eventId": event.id]

        // Absolute, so the reminder fires at the right instant wherever the
        // phone is. Calendar.current components would be read back in the
        // zone the phone is in when it fires.
        let interval = triggerDate.timeIntervalSince(now)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(interval, 1), repeats: false)

        let request = UNNotificationRequest(
            identifier: "event-reminder-\(event.id)",
            content: content,
            trigger: trigger
        )

        do {
            try await center.add(request)
            scheduledEventIds.insert(event.id)
            return .scheduled(triggerDate)
        } catch {
            AppLogger.general.error("Failed to schedule notification: \(error.localizedDescription)")
            return .failed
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

    /// Nil when an existing reminder was cancelled; otherwise what scheduling
    /// did, for the caller to report.
    @discardableResult
    func toggleReminder(for event: Event) async -> ReminderResult? {
        if isReminderSet(for: event.id) {
            cancelReminder(for: event.id)
            return nil
        } else {
            return await scheduleReminder(for: event)
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
