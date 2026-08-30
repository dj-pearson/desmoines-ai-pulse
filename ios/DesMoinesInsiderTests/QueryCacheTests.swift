import XCTest
@testable import DesMoinesInsider

final class QueryCacheTests: XCTestCase {

    private var cache: QueryCache!

    override func setUp() async throws {
        cache = QueryCache.shared
        await cache.clearAll()
    }

    override func tearDown() async throws {
        await cache.clearAll()
    }

    // MARK: - Basic Get / Set

    func testSetAndGetValue() async {
        let key = "test-events"
        let data = ["event1", "event2", "event3"]

        await cache.set(key, value: data, ttl: 60)
        let result: [String]? = await cache.get(key)

        XCTAssertNotNil(result)
        XCTAssertEqual(result, data)
    }

    func testGetMissingKeyReturnsNil() async {
        let result: String? = await cache.get("nonexistent-key")
        XCTAssertNil(result)
    }

    // MARK: - Expiration

    func testExpiredEntryReturnsNil() async {
        let key = "expiring"
        await cache.set(key, value: "hello", ttl: 0.01) // 10ms TTL

        // Wait for expiration
        try? await Task.sleep(for: .milliseconds(50))

        let result: String? = await cache.get(key)
        XCTAssertNil(result)
    }

    func testAllowStaleReturnExpiredEntry() async {
        let key = "stale-test"
        await cache.set(key, value: "stale-data", ttl: 0.01)

        try? await Task.sleep(for: .milliseconds(50))

        let result: String? = await cache.get(key, allowStale: true)
        XCTAssertEqual(result, "stale-data")
    }

    // MARK: - Remove

    func testRemoveEntry() async {
        let key = "to-remove"
        await cache.set(key, value: 42, ttl: 300)

        await cache.remove(key)

        let result: Int? = await cache.get(key)
        XCTAssertNil(result)
    }

    // MARK: - Clear All

    func testClearAll() async {
        await cache.set("a", value: 1, ttl: 300)
        await cache.set("b", value: 2, ttl: 300)

        await cache.clearAll()

        let a: Int? = await cache.get("a")
        let b: Int? = await cache.get("b")
        XCTAssertNil(a)
        XCTAssertNil(b)
    }

    // MARK: - Type Safety

    func testWrongTypeReturnsNil() async {
        await cache.set("typed", value: "string-value", ttl: 300)

        // Try to get as Int — should return nil (decode failure)
        let result: Int? = await cache.get("typed")
        XCTAssertNil(result)
    }

    // MARK: - Pruning

    func testPruneExpiredRemovesOldEntries() async {
        await cache.set("expired-1", value: "old", ttl: 0.01)
        await cache.set("fresh", value: "new", ttl: 300)

        try? await Task.sleep(for: .milliseconds(50))

        await cache.pruneExpired()

        let expired: String? = await cache.get("expired-1")
        let fresh: String? = await cache.get("fresh")
        XCTAssertNil(expired)
        XCTAssertEqual(fresh, "new")
    }

    // MARK: - Size Cap / LRU Eviction (IOS-AUDIT-PERF-005)

    /// A payload large enough that a handful of entries blow past a small cap.
    private func makePayload(_ marker: String, bytes: Int = 4_000) -> [String] {
        // Each element is ~length chars; JSON-encoded this comfortably exceeds
        // `bytes` once a few entries accumulate.
        [marker, String(repeating: "x", count: bytes)]
    }

    func testSizeCapKeepsTotalBounded() async {
        // Tiny cap so a few writes must trigger eviction.
        let cap = 10_000
        await cache.setMaxDiskBytesForTesting(cap)

        for i in 0..<20 {
            await cache.set("entry-\(i)", value: makePayload("entry-\(i)"), ttl: 300)
        }

        let total = await cache.totalDiskBytesForTesting()
        XCTAssertLessThanOrEqual(total, cap, "On-disk cache size must stay under the configured cap")
    }

    func testEvictsLeastRecentlyUsedFirst() async {
        let cap = 12_000
        await cache.setMaxDiskBytesForTesting(cap)

        // Write three entries that together would exceed the cap.
        await cache.set("oldest", value: makePayload("oldest", bytes: 5_000), ttl: 300)
        try? await Task.sleep(for: .milliseconds(20))
        await cache.set("middle", value: makePayload("middle", bytes: 5_000), ttl: 300)
        try? await Task.sleep(for: .milliseconds(20))

        // Access "oldest" so it becomes most-recently-used (touches mtime).
        let _: [String]? = await cache.get("oldest")
        try? await Task.sleep(for: .milliseconds(20))

        // This write pushes total over the cap; "middle" is now the LRU entry
        // and should be evicted before the freshly-accessed "oldest".
        await cache.set("newest", value: makePayload("newest", bytes: 5_000), ttl: 300)

        let oldest: [String]? = await cache.get("oldest")
        let middle: [String]? = await cache.get("middle")
        let newest: [String]? = await cache.get("newest")

        XCTAssertNotNil(newest, "Most recently written entry should survive")
        XCTAssertNotNil(oldest, "Recently accessed entry should survive over the LRU one")
        XCTAssertNil(middle, "Least recently used entry should be evicted first")

        let total = await cache.totalDiskBytesForTesting()
        XCTAssertLessThanOrEqual(total, cap)
    }
}
