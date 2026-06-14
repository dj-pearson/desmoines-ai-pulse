import Foundation
import os

/// A simple file-backed JSON cache for API query results.
///
/// Stores query results as JSON files in the app's Caches directory.
/// Entries expire based on a configurable TTL (default from Config.cacheExpirationMinutes).
/// When offline, stale cache is returned regardless of TTL.
///
/// Usage:
///     let events: [Event]? = await QueryCache.shared.get("events-home")
///     await QueryCache.shared.set("events-home", value: events)
actor QueryCache {
    static let shared = QueryCache()

    private let cacheDir: URL
    private let defaultTTL: TimeInterval
    private let maxDiskBytes: Int = 50 * 1024 * 1024 // 50 MB

    /// Cache format version. Increment to force a full cache purge on upgrade
    /// (e.g. when switching from unencrypted to encrypted storage).
    private static let cacheVersion = 2

    private init() {
        // Avoid force-unwrapping in a launch-path singleton (IOS-AUDIT-PERF-012);
        // fall back to the temp dir if the caches dir is somehow unavailable.
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        cacheDir = caches.appendingPathComponent("QueryCache", isDirectory: true)
        defaultTTL = TimeInterval(Config.cacheExpirationMinutes * 60)

        // Ensure directory exists with file protection
        let fm = FileManager.default
        try? fm.createDirectory(at: cacheDir, withIntermediateDirectories: true)

        // Set NSFileProtectionComplete on the cache directory so files are
        // inaccessible when the device is locked.
        try? fm.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: cacheDir.path
        )

        // Purge old unversioned cache when upgrading
        let versionFile = cacheDir.appendingPathComponent(".cache-version")
        let currentVersion = (try? String(contentsOf: versionFile, encoding: .utf8))
            .flatMap { Int($0) } ?? 0
        if currentVersion < Self.cacheVersion {
            // Old cache format — purge everything
            if let files = try? fm.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: nil) {
                for file in files where file.lastPathComponent != ".cache-version" {
                    try? fm.removeItem(at: file)
                }
            }
            try? String(Self.cacheVersion).write(to: versionFile, atomically: true, encoding: .utf8)
            AppLogger.cache.info("Cache upgraded to version \(Self.cacheVersion), old entries purged")
        }
    }

    // MARK: - Public API

    /// Returns cached data if within TTL. When `allowStale` is true (e.g. offline),
    /// returns data regardless of expiration.
    func get<T: Codable>(_ key: String, allowStale: Bool = false) -> T? {
        let fileURL = fileURL(for: key)
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }

        do {
            let data = try Data(contentsOf: fileURL)
            let entry = try JSONDecoder().decode(CacheEntry<T>.self, from: data)

            if !allowStale && entry.isExpired {
                AppLogger.cache.debug("Cache expired for key: \(key)")
                return nil
            }

            AppLogger.cache.debug("Cache hit for key: \(key), stale: \(entry.isExpired)")
            return entry.value
        } catch {
            AppLogger.cache.error("Cache decode failed for key: \(key) — \(error.localizedDescription)")
            return nil
        }
    }

    /// Stores a value in the cache with the default TTL.
    func set<T: Codable>(_ key: String, value: T, ttl: TimeInterval? = nil) {
        let entry = CacheEntry(value: value, expiresAt: Date().addingTimeInterval(ttl ?? defaultTTL))
        let fileURL = fileURL(for: key)

        do {
            let data = try JSONEncoder().encode(entry)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            AppLogger.cache.debug("Cached \(data.count) bytes for key: \(key)")
        } catch {
            AppLogger.cache.error("Cache write failed for key: \(key) — \(error.localizedDescription)")
        }
    }

    /// Removes a single cache entry.
    func remove(_ key: String) {
        try? FileManager.default.removeItem(at: fileURL(for: key))
    }

    /// Removes expired entries (24h hard limit), then enforces the disk-size cap
    /// with oldest-first LRU eviction. Call on app launch.
    func pruneExpired() {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey]) else { return }

        let maxAge: TimeInterval = 24 * 60 * 60 // 24 hours hard limit
        var removedCount = 0
        var survivors: [(url: URL, size: Int, modified: Date)] = []

        for file in files {
            guard let attrs = try? fm.attributesOfItem(atPath: file.path),
                  let modified = attrs[.modificationDate] as? Date else { continue }

            if Date().timeIntervalSince(modified) > maxAge {
                try? fm.removeItem(at: file)
                removedCount += 1
            } else {
                survivors.append((file, (attrs[.size] as? Int) ?? 0, modified))
            }
        }

        // Size-based LRU eviction (IOS-AUDIT-PERF-005): maxDiskBytes was declared
        // but never enforced, so browsing many filter combos grew the cache
        // unbounded. Evict oldest-first until under the cap.
        var totalSize = survivors.reduce(0) { $0 + $1.size }
        if totalSize > maxDiskBytes {
            for entry in survivors.sorted(by: { $0.modified < $1.modified }) {
                if totalSize <= maxDiskBytes { break }
                try? fm.removeItem(at: entry.url)
                totalSize -= entry.size
                removedCount += 1
            }
        }

        if removedCount > 0 {
            AppLogger.cache.info("Pruned \(removedCount) cache entries (expired + LRU)")
        }
    }

    /// Removes all cached data.
    func clearAll() {
        let fm = FileManager.default
        if let files = try? fm.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: nil) {
            for file in files {
                try? fm.removeItem(at: file)
            }
        }
        AppLogger.cache.info("Cache cleared")
    }

    // MARK: - Internal

    private func fileURL(for key: String) -> URL {
        let safeKey = key.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? key
        return cacheDir.appendingPathComponent(safeKey + ".json")
    }
}

// MARK: - Cache Entry Wrapper

private struct CacheEntry<T: Codable>: Codable {
    let value: T
    let expiresAt: Date

    var isExpired: Bool {
        Date() > expiresAt
    }
}
