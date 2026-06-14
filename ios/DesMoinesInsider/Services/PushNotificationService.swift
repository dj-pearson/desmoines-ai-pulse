import Foundation
import os
import UIKit
import UserNotifications

/// Manages push notification registration and device token syncing.
/// Activated by setting `Config.enablePushNotifications = true`.
@MainActor
@Observable
final class PushNotificationService: NSObject {
    static let shared = PushNotificationService()

    private(set) var isRegistered = false
    private(set) var deviceToken: String?
    private(set) var permissionStatus: UNAuthorizationStatus = .notDetermined

    private let supabase = SupabaseService.shared.client

    private override init() {
        super.init()
    }

    // MARK: - Request Permission & Register

    func requestPermissionAndRegister() async {
        let center = UNUserNotificationCenter.current()

        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            guard granted else {
                permissionStatus = .denied
                return
            }
            permissionStatus = .authorized

            // Register for remote notifications on the main thread
            UIApplication.shared.registerForRemoteNotifications()
        } catch {
            AppLogger.network.error("Push notification permission error: \(error.localizedDescription)")
        }
    }

    // MARK: - Handle Device Token

    func didRegisterForRemoteNotifications(deviceToken token: Data) {
        let tokenString = token.map { String(format: "%02.2hhx", $0) }.joined()
        self.deviceToken = tokenString
        isRegistered = true

        Task { await syncTokenToBackend(token: tokenString) }
    }

    func didFailToRegisterForRemoteNotifications(error: Error) {
        AppLogger.network.error("Failed to register for push notifications: \(error.localizedDescription)")
        isRegistered = false
    }

    // MARK: - Sync Token

    private func syncTokenToBackend(token: String) async {
        guard let client = supabase else { return }

        do {
            struct TokenPayload: Encodable {
                let deviceToken: String
                let platform: String
            }

            _ = try await client.functions.invoke(
                "register-device-token",
                options: .init(
                    method: .post,
                    body: TokenPayload(deviceToken: token, platform: "ios")
                )
            )
        } catch {
            AppLogger.network.error("Failed to sync device token: \(error.localizedDescription)")
        }
    }

    // MARK: - Check Permission Status

    func checkPermissionStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permissionStatus = settings.authorizationStatus
    }
}

// MARK: - App Delegate for Push Notifications

/// Installed via `@UIApplicationDelegateAdaptor(AppDelegate.self)` in the App struct.
///
/// Installed unconditionally (not gated on `Config.enablePushNotifications`) because
/// it also owns notification *presentation* and *tap routing* for local event
/// reminders, which work regardless of whether remote push is enabled. Remote-token
/// callbacks below only fire after `registerForRemoteNotifications()` is called, which
/// is itself gated on `Config.enablePushNotifications`.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Take ownership of foreground presentation + tap handling for both local
        // reminders and remote push. Set even when push is disabled so reminder
        // taps route to the right screen.
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // MARK: - Remote Notification Token

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            PushNotificationService.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            PushNotificationService.shared.didFailToRegisterForRemoteNotifications(error: error)
        }
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Show a banner (+ sound, badge) for notifications that arrive while the app
    /// is in the foreground — without this, foreground notifications are silently
    /// dropped by the system.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    /// Route a notification tap to the matching screen. Local event reminders carry
    /// an `eventId` (see LocalNotificationService); remote push may carry a
    /// deep-link `url`. Both are resolved by DeepLinkHandler.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        Task { @MainActor in
            DeepLinkHandler.shared.handleNotification(userInfo: userInfo)
        }
        completionHandler()
    }
}
