import Foundation
import Security
import os

/// A lightweight Keychain wrapper for securely storing small values
/// (tokens, credentials) using `kSecClassGenericPassword`.
///
/// Items are stored with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` —
/// values are unreadable while the device is locked, tightening the
/// post-compromise window for a lost/stolen unlocked-then-locked device.
/// Earlier builds used `AfterFirstUnlockThisDeviceOnly`; call
/// `migrateAccessibilityIfNeeded()` from app launch so existing items are
/// re-stamped with the new flag.
final class KeychainService {
    static let shared = KeychainService()

    private let service = Config.appBundleId

    /// Canonical accessibility attribute for all items stored by this service.
    /// Changing this requires a corresponding bump in `migrationVersion`.
    private static let accessibility: CFString = kSecAttrAccessibleWhenUnlockedThisDeviceOnly

    /// Incremented when `accessibility` changes. Stored in UserDefaults so
    /// the migration runs at most once per install per version bump.
    private static let migrationVersion = 1
    private static let migrationKey = "keychain.accessibilityMigrationVersion"

    private init() {}

    // MARK: - Data

    /// Save raw data to the Keychain for the given key.
    /// Overwrites any existing value.
    @discardableResult
    func save(key: String, data: Data) -> Bool {
        // Remove any existing item first to avoid errSecDuplicateItem
        delete(key: key)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: Self.accessibility
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    /// Load raw data from the Keychain for the given key.
    /// Returns `nil` if the item doesn't exist or an error occurs.
    func load(key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    /// Delete a single item from the Keychain.
    @discardableResult
    func delete(key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    // MARK: - String Convenience

    /// Save a UTF-8 string to the Keychain.
    @discardableResult
    func saveString(key: String, value: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        return save(key: key, data: data)
    }

    /// Load a UTF-8 string from the Keychain.
    func loadString(key: String) -> String? {
        guard let data = load(key: key) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: - Cleanup

    /// Delete all items stored by this service. Call on logout.
    func deleteAll() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ]

        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Accessibility Migration

    /// Re-saves every item under the current accessibility flag so upgraded
    /// installs don't keep tokens readable while the device is locked.
    ///
    /// Safe to call on every launch — a version-gated UserDefaults flag
    /// ensures the re-save loop only runs when the value in
    /// `migrationVersion` bumps. Runs synchronously; the Keychain calls are
    /// fast even with 10+ items.
    func migrateAccessibilityIfNeeded() {
        let completed = UserDefaults.standard.integer(forKey: Self.migrationKey)
        guard completed < Self.migrationVersion else { return }

        // Enumerate every generic-password item under our service and record
        // its (account, data) so we can delete + re-add with the new flag.
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecSuccess, let items = result as? [[String: Any]] {
            for item in items {
                guard let account = item[kSecAttrAccount as String] as? String,
                      let data = item[kSecValueData as String] as? Data else { continue }
                // delete() + save() re-applies Self.accessibility. Preserves
                // the binary payload exactly.
                save(key: account, data: data)
            }
            AppLogger.auth.info("Keychain migrated \(items.count) item(s) to stricter accessibility")
        } else if status != errSecItemNotFound {
            AppLogger.auth.warning("Keychain migration read failed: \(status)")
        }

        // Mark complete even if there were no items — prevents re-running
        // the enumeration on every launch for fresh installs.
        UserDefaults.standard.set(Self.migrationVersion, forKey: Self.migrationKey)
    }
}
