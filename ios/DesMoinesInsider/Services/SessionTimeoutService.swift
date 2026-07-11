import Foundation
import os

/// Tracks user activity and enforces session timeouts matching backend session_policies.
///
/// - Regular users: 60-min idle timeout, 8-hour absolute timeout
/// - Admin users: 30-min idle timeout, 4-hour absolute timeout
///
/// Resets idle timer on scene phase changes (active → background → active).
/// Persists last activity timestamp in Keychain for app restart scenarios.
@MainActor
@Observable
final class SessionTimeoutService {
    static let shared = SessionTimeoutService()

    // MARK: - Configuration

    private enum Timeout {
        // User timeouts
        static let userIdle: TimeInterval = 60 * 60           // 60 minutes
        static let userAbsolute: TimeInterval = 8 * 60 * 60   // 8 hours

        // Admin timeouts (stricter)
        static let adminIdle: TimeInterval = 30 * 60           // 30 minutes
        static let adminAbsolute: TimeInterval = 4 * 60 * 60   // 4 hours

        // Warning before expiry
        static let warningBefore: TimeInterval = 5 * 60        // 5 minutes

        // Check interval
        static let checkInterval: TimeInterval = 30            // 30 seconds
    }

    private enum Keys {
        static let lastActivity = "session_last_activity"
        static let sessionStart = "session_start_time"
        static let isAdmin = "session_is_admin"
    }

    // MARK: - State

    enum SessionState: Equatable {
        case active
        case warning(minutesRemaining: Int)
        case expired
    }

    private(set) var sessionState: SessionState = .active
    private var isAdmin = false
    private var isTracking = false
    private var checkTask: Task<Void, Never>?

    /// Last time `recordActivity` actually persisted, used to throttle Keychain
    /// writes when activity is driven by a continuous gesture (scroll/drag).
    private var lastRecordedActivity: TimeInterval = 0

    // MARK: - Lifecycle

    /// Start tracking session timeouts. Call after successful authentication.
    func startTracking(isAdmin: Bool) {
        self.isAdmin = isAdmin
        self.isTracking = true

        // Persist the admin flag so a cold-launch `isSessionValid()` check
        // applies the correct (stricter) admin thresholds even before auth has
        // re-resolved the role for this launch.
        KeychainService.shared.saveString(key: Keys.isAdmin, value: isAdmin ? "1" : "0")

        let now = Date().timeIntervalSince1970
        KeychainService.shared.saveString(key: Keys.sessionStart, value: String(now))
        lastRecordedActivity = 0   // force the first recordActivity to persist
        recordActivity()

        // Start periodic check
        checkTask?.cancel()
        checkTask = Task { [weak self] in
            while !Task.isCancelled {
                self?.checkTimeouts()
                try? await Task.sleep(nanoseconds: UInt64(Timeout.checkInterval * 1_000_000_000))
            }
        }

        AppLogger.auth.info("Session timeout tracking started (admin=\(isAdmin))")
    }

    /// Stop tracking session timeouts. Call on sign out.
    func stopTracking() {
        isTracking = false
        checkTask?.cancel()
        checkTask = nil
        sessionState = .active

        KeychainService.shared.delete(key: Keys.lastActivity)
        KeychainService.shared.delete(key: Keys.sessionStart)
        KeychainService.shared.delete(key: Keys.isAdmin)
        lastRecordedActivity = 0

        AppLogger.auth.info("Session timeout tracking stopped")
    }

    /// Record user activity (resets the idle timer). Safe to call on every user
    /// interaction — including continuous gestures — because the Keychain write
    /// is throttled; idle resolution is 30s so sub-throttle staleness is
    /// irrelevant. A pending warning is always cleared immediately, though, so
    /// the banner disappears the instant the user interacts.
    func recordActivity() {
        if case .warning = sessionState {
            sessionState = .active
        }

        let now = Date().timeIntervalSince1970
        guard now - lastRecordedActivity >= 5 else { return }
        lastRecordedActivity = now
        KeychainService.shared.saveString(key: Keys.lastActivity, value: String(now))
    }

    /// Check if the session is still valid on app restart.
    func isSessionValid() -> Bool {
        guard let lastActivityStr = KeychainService.shared.loadString(key: Keys.lastActivity),
              let sessionStartStr = KeychainService.shared.loadString(key: Keys.sessionStart),
              let lastActivity = Double(lastActivityStr),
              let sessionStart = Double(sessionStartStr) else {
            return true // No tracking data
        }

        // Use the persisted admin flag rather than the in-memory `isAdmin`, which
        // is still its `false` default this early in cold launch — otherwise an
        // admin would be granted the looser user thresholds.
        let wasAdmin = KeychainService.shared.loadString(key: Keys.isAdmin) == "1"

        let now = Date().timeIntervalSince1970
        let idleTimeout = wasAdmin ? Timeout.adminIdle : Timeout.userIdle
        let absoluteTimeout = wasAdmin ? Timeout.adminAbsolute : Timeout.userAbsolute

        let idleExpired = (now - lastActivity) > idleTimeout
        let absoluteExpired = (now - sessionStart) > absoluteTimeout

        return !idleExpired && !absoluteExpired
    }

    // MARK: - Private

    private func checkTimeouts() {
        guard isTracking else { return }

        guard let lastActivityStr = KeychainService.shared.loadString(key: Keys.lastActivity),
              let sessionStartStr = KeychainService.shared.loadString(key: Keys.sessionStart),
              let lastActivity = Double(lastActivityStr),
              let sessionStart = Double(sessionStartStr) else {
            return
        }

        let now = Date().timeIntervalSince1970
        let idleTimeout = isAdmin ? Timeout.adminIdle : Timeout.userIdle
        let absoluteTimeout = isAdmin ? Timeout.adminAbsolute : Timeout.userAbsolute

        let idleElapsed = now - lastActivity
        let absoluteElapsed = now - sessionStart

        // Check absolute timeout first (non-resettable)
        if absoluteElapsed >= absoluteTimeout {
            sessionState = .expired
            AppLogger.auth.warning("Session expired: absolute timeout reached")
            return
        }

        // Check idle timeout
        if idleElapsed >= idleTimeout {
            sessionState = .expired
            AppLogger.auth.warning("Session expired: idle timeout reached")
            return
        }

        // Check warning threshold
        let idleRemaining = idleTimeout - idleElapsed
        let absoluteRemaining = absoluteTimeout - absoluteElapsed
        let minRemaining = min(idleRemaining, absoluteRemaining)

        if minRemaining <= Timeout.warningBefore {
            let minutes = max(Int(minRemaining / 60), 1)
            sessionState = .warning(minutesRemaining: minutes)
        } else {
            sessionState = .active
        }
    }

    private init() {}
}
