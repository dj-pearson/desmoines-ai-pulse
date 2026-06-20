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

    /// Requests push permission at a deliberate post-onboarding moment
    /// (IOS-AUDIT-FEAT-001) — exactly once per install, and never re-prompting a
    /// user who already decided. If a previous grant exists but remote
    /// registration hasn't happened this launch, re-register.
    func requestPermissionIfAppropriate() async {
        await checkPermissionStatus()

        guard permissionStatus == .notDetermined else {
            if permissionStatus == .authorized && !isRegistered {
                UIApplication.shared.registerForRemoteNotifications()
            }
            return
        }

        guard !UserDefaults.standard.bool(forKey: Self.didRequestPermissionKey) else { return }
        UserDefaults.standard.set(true, forKey: Self.didRequestPermissionKey)
        await requestPermissionAndRegister()
    }

    private static let didRequestPermissionKey = "didRequestPushPermission"
}

// MARK: - App Delegate for Push Notifications

/// Installed via `@UIApplicationDelegateAdaptor(AppDelegate.self)` in the App
/// struct so APNs token callbacks (IOS-AUDIT-FEAT-001) and notification taps /
/// foreground presentation (IOS-AUDIT-FEAT-003) are actually delivered. The
/// UNUserNotificationCenter delegate is set unconditionally because local
/// event-reminder notifications need tap routing even when remote push is off;
/// remote registration itself stays gated on `Config.enablePushNotifications`.
class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

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

    // MARK: - UNUserNotificationCenterDelegate (IOS-AUDIT-FEAT-003)

    /// Show foreground notifications as a banner with sound instead of swallowing them.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    /// Route a notification tap (event reminder or push deep-link payload) to the
    /// right screen via DeepLinkHandler; MainTabView consumes the destination.
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
