import Foundation
import os

/// Tracks activity and enforces session timeouts for ADMIN sessions only.
///
/// - Admin users: 30-min idle timeout, 4-hour absolute timeout
/// - Regular users: not tracked (IOS-DD-ACCOUNT-02)
///
/// Regular users used to get a 60-min idle / 8-hour absolute sign-out. That
/// was removed on purpose: this is an app people open to browse what's on this
/// weekend, it holds no payment method and no admin power, and a surprise
/// orange banner followed by a forced sign-out was the result. It also never
/// worked as written: every token refresh restarted the clock, so the absolute
/// limit could not fire, and the cold-launch check raced the auth listener.
/// Admins keep the stricter limits because an admin session can edit content.
///
/// The absolute clock starts on a real sign-in and is NOT reset by token
/// refreshes or cold launches. Timestamps persist in the Keychain so a
/// relaunch sees the same clock.
@MainActor
@Observable
final class SessionTimeoutService {
    static let shared = SessionTimeoutService()

    // MARK: - Configuration

    private enum Timeout {
        // Admin timeouts. Regular users are not tracked (see type docs).
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

    /// Start tracking after authentication.
    ///
    /// - `isAdmin == false`: stops tracking and returns. Regular users have no
    ///   idle or absolute timeout (IOS-DD-ACCOUNT-02).
    /// - `resetClock == true` (a real sign-in): starts a fresh absolute clock.
    /// - `resetClock == false` (cold launch): keeps the persisted clock, so a
    ///   relaunch cannot extend an admin session.
    func startTracking(isAdmin: Bool, resetClock: Bool) {
        guard isAdmin else {
            if isTracking || KeychainService.shared.loadString(key: Keys.sessionStart) != nil {
                stopTracking()
            }
            return
        }
        self.isAdmin = true
        self.isTracking = true

        // Persist the admin flag so a cold-launch check applies the admin
        // thresholds before auth has re-resolved the role for this launch.
        KeychainService.shared.saveString(key: Keys.isAdmin, value: "1")

        let now = Date().timeIntervalSince1970
        if resetClock || KeychainService.shared.loadString(key: Keys.sessionStart) == nil {
            KeychainService.shared.saveString(key: Keys.sessionStart, value: String(now))
        }
        if resetClock || KeychainService.shared.loadString(key: Keys.lastActivity) == nil {
            KeychainService.shared.saveString(key: Keys.lastActivity, value: String(now))
            lastRecordedActivity = now
        }

        startCheckLoopIfNeeded()
        AppLogger.auth.info("Session timeout tracking started (resetClock=\(resetClock))")
    }

    /// Applies a role change (e.g. on token refresh) WITHOUT touching the
    /// timestamps. A demoted admin stops being tracked; a promotion is picked
    /// up by the next sign-in rather than starting a clock mid-session.
    func updateRole(isAdmin: Bool) {
        guard isTracking else { return }
        if !isAdmin {
            stopTracking()
            return
        }
        self.isAdmin = true
        startCheckLoopIfNeeded()
    }

    /// True when a previous run left tracking data and it is already past a
    /// limit. Called on `.initialSession` BEFORE anything else, so the app
    /// signs out before authenticated UI renders.
    func expireIfStaleOnLaunch() -> Bool {
        guard KeychainService.shared.loadString(key: Keys.sessionStart) != nil else { return false }
        return !isSessionValid()
    }

    /// Returning to the foreground: evaluate the limits against the time
    /// spent in the background first, and only count it as activity if the
    /// session survived. Recording first would forgive any idle period.
    func noteForeground() {
        guard isTracking else { return }
        checkTimeouts()
        if sessionState != .expired {
            recordActivity()
        }
    }

    private func startCheckLoopIfNeeded() {
        guard checkTask == nil else { return }
        checkTask = Task { [weak self] in
            while !Task.isCancelled {
                self?.checkTimeouts()
                try? await Task.sleep(nanoseconds: UInt64(Timeout.checkInterval * 1_000_000_000))
            }
        }
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
        guard isTracking else { return }
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

        // Only admin sessions are tracked. Data left by an older build for a
        // regular user (flag "0") is not a reason to sign anyone out.
        guard KeychainService.shared.loadString(key: Keys.isAdmin) == "1" else {
            return true
        }

        let now = Date().timeIntervalSince1970
        let idleTimeout = Timeout.adminIdle
        let absoluteTimeout = Timeout.adminAbsolute

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
        let idleTimeout = Timeout.adminIdle
        let absoluteTimeout = Timeout.adminAbsolute

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
