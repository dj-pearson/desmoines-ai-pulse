import Foundation
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
            print("Push notification permission error: \(error.localizedDescription)")
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
        print("Failed to register for push notifications: \(error.localizedDescription)")
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
            print("Failed to sync device token: \(error.localizedDescription)")
        }
    }

    // MARK: - Check Permission Status

    func checkPermissionStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permissionStatus = settings.authorizationStatus
    }
}

// MARK: - App Delegate for Push Notifications

/// Use as `@UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate` in the App struct
/// when `Config.enablePushNotifications` is true.
class AppDelegate: NSObject, UIApplicationDelegate {
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
}
