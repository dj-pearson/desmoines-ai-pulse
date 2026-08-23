import Foundation
import Supabase

/// Records swipe-to-discover signals from the Discover screen.
///
/// Best-effort: records to Supabase when the user is authenticated and
/// online, but always logs locally first so the personalization layer can
/// read swipe history offline and so anonymous users still benefit from
/// "don't show me the same item twice" within a session.
@MainActor
@Observable
final class SwipeInteractionService {
    static let shared = SwipeInteractionService()

    /// Set of `itemType:itemId` keys the user has already swiped on. Used by
    /// the Discover deck to skip items it has already shown the user. Backed by
    /// an ordered, bounded list so it can't grow without limit (IOS-AUDIT-PERF-019).
    private(set) var swipedItemKeys: Set<String> = []

    /// Insertion-ordered (most-recent-last) mirror of `swipedItemKeys`, capped at
    /// `maxSwipedKeys` so the in-memory set and the persisted UserDefaults blob
    /// stay bounded for engaged users.
    private var swipedOrder: [String] = []

    /// Retain the most recent N swipes for dedupe; older ones age out.
    /// Cap on remembered swipes. Non-private so the ratchet can be asserted
    /// against the real value rather than a literal copied into a test.
    nonisolated static let maxSwipedKeys = 1000

    private let supabase: SupabaseClient? = SupabaseService.shared.client
    private let localKey = "discover.swipedItems.v1"
    private let pendingKey = "discover.pendingSwipes.v1"

    /// Single-flight guard so concurrent `record` calls don't each start a flush
    /// that double-sends rows and blanks the other's queue (IOS-AUDIT-DATA-003).
    private var isFlushing = false

    private init() {
        // Tolerate the legacy unordered array; cap on load.
        swipedOrder = Self.trimmed(Self.loadLocalArray(localKey), cap: Self.maxSwipedKeys)
        swipedItemKeys = Set(swipedOrder)
    }

    /// Keep at most `cap` entries, dropping the OLDEST first.
    ///
    /// Extracted so the cap can be asserted directly (IOS-AUDIT-TEST-005).
    /// Recording a swipe used to compute the overflow inline with index
    /// arithmetic - `prefix(overflow)` to find the stale keys, then
    /// `removeFirst(overflow)` - which is correct and is the kind of expression
    /// that goes wrong by one and silently leaks unbounded history into
    /// UserDefaults, since nothing downstream would notice a list that never
    /// stops growing.
    ///
    /// Dropping the oldest rather than the newest is what makes the cap behave
    /// like a recency window: the whole point of this list is "have I already
    /// seen this card", and the answer matters most for what was just swiped.
    nonisolated static func trimmed(_ order: [String], cap: Int) -> [String] {
        order.count <= cap ? order : Array(order.suffix(cap))
    }

    // MARK: - Public API

    enum Action: String {
        case like, skip, boost, detail
    }

    enum ItemType: String {
        case event, restaurant, attraction
    }

    /// Records a swipe action. Always succeeds; network errors are queued
    /// and retried on the next call.
    func record(
        action: Action,
        itemType: ItemType,
        itemId: String,
        sourceContext: [String: [String]]? = nil
    ) async {
        let key = Self.key(itemType: itemType, itemId: itemId)
        if !swipedItemKeys.contains(key) {
            swipedOrder = Self.trimmed(swipedOrder + [key], cap: Self.maxSwipedKeys)
            // Rebuilt from the trimmed order rather than patched alongside it.
            // The set and the array are the same list seen two ways, and the
            // only way they can disagree is if one is updated and the other is
            // not - which is precisely what the removed index arithmetic was
            // doing by hand. A thousand-element Set rebuild per swipe is free at
            // the rate a human swipes.
            swipedItemKeys = Set(swipedOrder)
            Self.saveLocal(localKey, order: swipedOrder)
        }

        let row = PendingSwipe(
            itemType: itemType.rawValue,
            itemId: itemId,
            action: action.rawValue,
            sourceContext: sourceContext,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            // Minted HERE, when the row is queued, not at send time. A key
            // generated per attempt is a different key on the retry and
            // dedupes nothing (IOS-AUDIT-BUG-017).
            clientEventId: UUID().uuidString
        )

        // Try to flush this swipe + any queued ones.
        var queue = Self.loadPending(pendingKey)
        queue.append(row)
        Self.savePending(pendingKey, queue: queue)
        await flushPending()
    }

    /// Whether the given item has been swiped on at least once.
    func hasSwiped(itemType: ItemType, itemId: String) -> Bool {
        swipedItemKeys.contains(Self.key(itemType: itemType, itemId: itemId))
    }

    /// Clears local swipe history. Sign-out hook + privacy controls call this.
    func reset() {
        swipedItemKeys = []
        swipedOrder = []
        UserDefaults.standard.removeObject(forKey: localKey)
        UserDefaults.standard.removeObject(forKey: pendingKey)
    }

    // MARK: - Network sync

    private func flushPending() async {
        guard let client = supabase else { return }
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            return
        }

        // Single-flight: a flush already running will pick up rows we've just
        // appended (it re-reads the queue each loop), so a concurrent caller
        // returning here can't double-send or blank the queue.
        guard !isFlushing else { return }
        isFlushing = true
        defer { isFlushing = false }

        // Give any row queued by a build that predates client_event_id a key,
        // once, and persist it. Without this the existing backlog keeps the
        // old behaviour forever: a null key conflicts with nothing, so a lost
        // response still re-inserts it. Minting here rather than in
        // loadPending is deliberate - loadPending is pure and called in the
        // drain loop below, so a key minted there would be different on every
        // read and dedupe nothing.
        Self.backfillEventIds(pendingKey)

        struct InsertRow: Encodable {
            let user_id: String
            let item_type: String
            let item_id: String
            let action: String
            let source_context: [String: [String]]?
            let client_event_id: String?
        }

        // Drain in a loop so rows appended while an insert was in flight still
        // get sent by this same flush.
        while true {
            let batch = Self.loadPending(pendingKey)
            guard !batch.isEmpty else { return }

            let rows = batch.map {
                InsertRow(
                    user_id: userId,
                    item_type: $0.itemType,
                    item_id: $0.itemId,
                    action: $0.action,
                    source_context: $0.sourceContext,
                    client_event_id: $0.clientEventId
                )
            }

            do {
                // Upsert, not insert (IOS-AUDIT-BUG-017). The catch below
                // treats a thrown error as "the write did not happen" and
                // keeps the batch, but a LOST RESPONSE - committed write,
                // reply never arrived, the ordinary way a mobile connection
                // drops - looks identical from here, so the retry used to
                // insert the same rows again. Nothing errored; the counts
                // were just high, by an amount that scaled with how bad the
                // user's connection was.
                //
                // ignoreDuplicates so a replayed row is dropped rather than
                // overwriting the stored one, which would move created_at.
                try await client
                    .from("swipe_interactions")
                    .upsert(rows, onConflict: "client_event_id", ignoreDuplicates: true)
                    .execute()
            } catch {
                // Leave the queue intact; the next swipe will retry.
                return
            }

            // Remove ONLY the rows we actually sent (the leading `batch.count`).
            // New rows are appended at the end, so anything queued during the
            // insert survives instead of being blanked.
            var remaining = Self.loadPending(pendingKey)
            remaining.removeFirst(min(batch.count, remaining.count))
            Self.savePending(pendingKey, queue: remaining)
        }
    }

    // MARK: - Storage helpers

    private static func key(itemType: ItemType, itemId: String) -> String {
        "\(itemType.rawValue):\(itemId)"
    }

    private static func loadLocalArray(_ key: String) -> [String] {
        UserDefaults.standard.stringArray(forKey: key) ?? []
    }

    private static func saveLocal(_ key: String, order: [String]) {
        UserDefaults.standard.set(order, forKey: key)
    }

    private struct PendingSwipe: Codable {
        let itemType: String
        let itemId: String
        let action: String
        let sourceContext: [String: [String]]?
        let createdAt: String
        /// Idempotency key, minted WHEN THE ROW IS QUEUED (IOS-AUDIT-BUG-017).
        ///
        /// Optional so entries written by an earlier build still decode - the
        /// queue in UserDefaults is a stored schema, and a required field
        /// would make every one of them fail to decode and vanish. Those rows
        /// send a null key and behave exactly as they did before.
        var clientEventId: String?
    }

    /// Assign an idempotency key to any queued row that lacks one, and save.
    /// No-op when every row already has one, so it costs a decode and nothing
    /// else on the normal path.
    ///
    /// Returns how many rows were filled, so a test can tell "nothing needed
    /// doing" from "the decode failed and the queue silently emptied" - which
    /// is exactly what a required field on PendingSwipe would have caused.
    @discardableResult
    static func backfillEventIds(_ key: String) -> Int {
        let queue = loadPending(key)
        let missing = queue.filter { $0.clientEventId == nil }.count
        guard missing > 0 else { return 0 }
        let filled = queue.map { row -> PendingSwipe in
            guard row.clientEventId == nil else { return row }
            var copy = row
            copy.clientEventId = UUID().uuidString
            return copy
        }
        savePending(key, queue: filled)
        return missing
    }

    private static func loadPending(_ key: String) -> [PendingSwipe] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let rows = try? JSONDecoder().decode([PendingSwipe].self, from: data) else {
            return []
        }
        return rows
    }

    private static func savePending(_ key: String, queue: [PendingSwipe]) {
        guard let data = try? JSONEncoder().encode(queue) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
