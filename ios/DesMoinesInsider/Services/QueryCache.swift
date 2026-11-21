import CryptoKit
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

    /// Maximum total on-disk size for the cache. When exceeded, the least
    /// recently used entries are evicted (see `enforceSizeCap`). Settable so the
    /// cap can be exercised in tests without writing the full 50 MB.
    private var maxDiskBytes: Int = 50 * 1024 * 1024 // 50 MB

    /// Cache format version. Increment to force a full cache purge on upgrade
    /// (e.g. when switching from unencrypted to encrypted storage).
    private static let cacheVersion = 2

    private init() {
        // Fall back to the temporary directory rather than force-unwrapping and
        // crashing at launch if the caches directory is unavailable (IOS-AUDIT-PERF-012).
        let caches: URL
        if let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
            caches = dir
        } else {
            AppLogger.cache.error("Caches directory unavailable; falling back to temporary directory")
            caches = FileManager.default.temporaryDirectory
        }
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

        // Rename entries written under the old percent-encoded-key scheme to
        // their hashed names, so no query text stays on disk past first launch
        // (IOS-AUDIT-PERF-032).
        Self.migrateLegacyFilenames(in: cacheDir)
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
            // Touch the file's modification date so it reflects last access.
            // The size cap (enforceSizeCap) evicts by oldest mtime, so recording
            // reads here makes eviction least-recently-*used* rather than
            // least-recently-written (IOS-AUDIT-PERF-005).
            try? FileManager.default.setAttributes(
                [.modificationDate: Date()],
                ofItemAtPath: fileURL.path
            )
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
            // Per-filter cache keys accumulate unbounded, so enforce the disk
            // budget after every write (IOS-AUDIT-PERF-005).
            enforceSizeCap()
        } catch {
            AppLogger.cache.error("Cache write failed for key: \(key) — \(error.localizedDescription)")
        }
    }

    /// Removes a single cache entry.
    func remove(_ key: String) {
        try? FileManager.default.removeItem(at: fileURL(for: key))
    }

    /// Removes all expired entries. Call on app launch.
    func pruneExpired() {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }

        let maxAge: TimeInterval = 24 * 60 * 60 // 24 hours hard limit
        var removedCount = 0

        for file in files {
            guard let attrs = try? fm.attributesOfItem(atPath: file.path),
                  let modified = attrs[.modificationDate] as? Date else { continue }

            if Date().timeIntervalSince(modified) > maxAge {
                try? fm.removeItem(at: file)
                removedCount += 1
            }
        }

        if removedCount > 0 {
            AppLogger.cache.info("Pruned \(removedCount) expired cache entries")
        }

        // After dropping expired entries, make sure the surviving set still fits
        // within the disk budget.
        enforceSizeCap()
    }

    /// Enforces the `maxDiskBytes` budget using LRU eviction.
    ///
    /// `get(_:)` touches each file's modification date on access, so the file
    /// mtime is a proxy for last-access time. When the total on-disk size of the
    /// cache exceeds `maxDiskBytes`, the least-recently-used entries are evicted
    /// (oldest mtime first) until the total is back under the cap
    /// (IOS-AUDIT-PERF-005).
    func enforceSizeCap() {
        let fm = FileManager.default
        let keys: [URLResourceKey] = [.contentModificationDateKey, .fileSizeKey, .isRegularFileKey]
        guard let files = try? fm.contentsOfDirectory(
            at: cacheDir,
            includingPropertiesForKeys: keys
        ) else { return }

        // Gather (url, size, mtime) for each regular file, skipping the
        // version marker and anything we can't stat.
        struct Entry {
            let url: URL
            let size: Int
            let modified: Date
        }

        var entries: [Entry] = []
        var totalBytes = 0
        for file in files where file.lastPathComponent != ".cache-version" {
            guard let values = try? file.resourceValues(forKeys: Set(keys)),
                  values.isRegularFile == true,
                  let size = values.fileSize,
                  let modified = values.contentModificationDate else { continue }
            entries.append(Entry(url: file, size: size, modified: modified))
            totalBytes += size
        }

        guard totalBytes > maxDiskBytes else { return }

        // Evict least-recently-used first (oldest modification date).
        entries.sort { $0.modified < $1.modified }

        var evictedCount = 0
        for entry in entries {
            guard totalBytes > maxDiskBytes else { break }
            do {
                try fm.removeItem(at: entry.url)
                totalBytes -= entry.size
                evictedCount += 1
            } catch {
                AppLogger.cache.error("LRU eviction failed for \(entry.url.lastPathComponent) — \(error.localizedDescription)")
            }
        }

        if evictedCount > 0 {
            AppLogger.cache.info("Evicted \(evictedCount) LRU cache entries to stay under \(self.maxDiskBytes) bytes")
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
        cacheDir.appendingPathComponent(Self.hashedFilename(for: key))
    }

    /// On-disk name for a cache key: the SHA-256 of the key, hex-encoded.
    ///
    /// Keys carry filter state, and some carry what the user typed
    /// (`EventsViewModel.eventsCacheKey()` appends `q-<searchText>`). The old
    /// scheme percent-encoded the key into the filename, so a search for a
    /// person's name or address sat in the Caches directory as a readable file
    /// name, outside the encrypted payload. Hashing keeps the key out of the
    /// file system entirely (IOS-AUDIT-PERF-032).
    nonisolated static func hashedFilename(for key: String) -> String {
        let digest = SHA256.hash(data: Data(key.utf8))
        return digest.map { String(format: "%02x", $0) }.joined() + ".json"
    }

    /// True for a name `hashedFilename(for:)` produced: 64 lowercase hex
    /// characters plus `.json`.
    nonisolated static func isHashedFilename(_ name: String) -> Bool {
        guard name.hasSuffix(".json") else { return false }
        let stem = name.dropLast(5)
        return stem.count == 64 && stem.allSatisfy { $0.isHexDigit && !$0.isUppercase }
    }

    /// Moves files named by the old scheme (`<percent-encoded key>.json`) to
    /// their hashed names. The old name is reversible, so the entry and its
    /// TTL survive the upgrade instead of costing an offline user their cache.
    /// A file whose key cannot be recovered, or whose hashed name is already
    /// taken by a newer write, is deleted rather than left behind.
    nonisolated static func migrateLegacyFilenames(in dir: URL) {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return }

        var migrated = 0
        var dropped = 0
        for file in files {
            let name = file.lastPathComponent
            guard name.hasSuffix(".json"), !isHashedFilename(name) else { continue }

            guard let key = String(name.dropLast(5)).removingPercentEncoding else {
                try? fm.removeItem(at: file)
                dropped += 1
                continue
            }
            let target = dir.appendingPathComponent(hashedFilename(for: key))
            if fm.fileExists(atPath: target.path) {
                try? fm.removeItem(at: file)
                dropped += 1
                continue
            }
            do {
                try fm.moveItem(at: file, to: target)
                migrated += 1
            } catch {
                try? fm.removeItem(at: file)
                dropped += 1
            }
        }

        if migrated + dropped > 0 {
            AppLogger.cache.info("Migrated \(migrated) cache entries to hashed filenames, dropped \(dropped)")
        }
    }

    // MARK: - Test Support

    #if DEBUG
    /// Overrides the disk budget so the LRU size cap can be exercised in tests
    /// without writing the full 50 MB. Not used in production code.
    func setMaxDiskBytesForTesting(_ bytes: Int) {
        maxDiskBytes = bytes
    }

    /// Total on-disk size of the cache in bytes (excludes the version marker).
    /// Test-only helper for asserting the cap is honoured.
    /// Names of the files currently in the cache directory, version marker
    /// excluded. Lets tests assert what actually lands on disk.
    func diskFilenamesForTesting() -> [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: cacheDir.path)) ?? []
        return names.filter { $0 != ".cache-version" }
    }

    /// The cache directory, so a test can plant a file written by an older build.
    func cacheDirectoryForTesting() -> URL {
        cacheDir
    }

    /// Runs the legacy-filename migration against the live cache directory.
    func migrateLegacyFilenamesForTesting() {
        Self.migrateLegacyFilenames(in: cacheDir)
    }

    func totalDiskBytesForTesting() -> Int {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(
            at: cacheDir,
            includingPropertiesForKeys: [.fileSizeKey]
        ) else { return 0 }

        var total = 0
        for file in files where file.lastPathComponent != ".cache-version" {
            if let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                total += size
            }
        }
        return total
    }
    #endif
}

// MARK: - Cache Entry Wrapper

private struct CacheEntry<T: Codable>: Codable {
    let value: T
    let expiresAt: Date

    var isExpired: Bool {
        Date() > expiresAt
    }
}
