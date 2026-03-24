import os

/// Structured logging via OSLog. Logs are viewable in Console.app
/// by filtering on subsystem "com.desmoines.aipulse".
///
/// Usage:
///   AppLogger.auth.info("User signed in")
///   AppLogger.network.error("Request failed", metadata: ["url": url, "status": 500])
enum AppLogger {
    // MARK: - Categories

    static let auth     = Logger(subsystem: subsystem, category: "auth")
    static let network  = Logger(subsystem: subsystem, category: "network")
    static let cache    = Logger(subsystem: subsystem, category: "cache")
    static let storekit = Logger(subsystem: subsystem, category: "storekit")
    static let ui       = Logger(subsystem: subsystem, category: "ui")
    static let nav      = Logger(subsystem: subsystem, category: "navigation")
    static let general  = Logger(subsystem: subsystem, category: "general")

    private static let subsystem = "com.desmoines.aipulse"
}
