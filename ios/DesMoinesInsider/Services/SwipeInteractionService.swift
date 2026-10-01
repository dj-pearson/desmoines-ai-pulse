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

    /// Cap on the unsent queue (IOS-DD-DISCOVER-09). A signed-in user who swipes
    /// offline for weeks would otherwise re-encode an ever-growing blob into
    /// UserDefaults on every swipe. The oldest rows go first, as with the
    /// dedupe history.
    nonisolated static let maxPending = 500

    /// Most rows sent in one upsert, so a long backlog goes up in pieces.
    nonisolated static let flushBatchSize = 100

    /// Records a swipe action. Always succeeds; network errors are queued
    /// and retried on the next call.
    ///
    /// Returns the row's idempotency key, which is what `unrecord` needs to
    /// take the swipe back, or nil when nothing was queued (IOS-DD-DISCOVER-07).
    ///
    /// Guests update the local "already seen" keys only. Their rows used to be
    /// queued with no owner, never sent (flush needs a user), never capped, and
    /// then uploaded under whichever account signed in next on the device
    /// (IOS-DD-DISCOVER-09).
    @discardableResult
    func record(
        action: Action,
        itemType: ItemType,
        itemId: String,
        sourceContext: [String: [String]]? = nil
    ) async -> String? {
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

        guard let userId = AuthService.shared.currentUser?.id.uuidString else { return nil }

        let clientEventId = UUID().uuidString
        let row = PendingSwipe(
            itemType: itemType.rawValue,
            itemId: itemId,
            action: action.rawValue,
            sourceContext: sourceContext,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            // Minted HERE, when the row is queued, not at send time. A key
            // generated per attempt is a different key on the retry and
            // dedupes nothing (IOS-AUDIT-BUG-017).
            clientEventId: clientEventId,
            userId: userId
        )

        // Try to flush this swipe + any queued ones.
        let queue = Self.loadPending(pendingKey)
        Self.savePending(pendingKey, queue: Self.trimmedQueue(queue + [row], cap: Self.maxPending))
        await flushPending()
        return clientEventId
    }

    /// Takes a swipe back (IOS-DD-DISCOVER-07): forgets the "already seen" key,
    /// drops the row if it is still queued, and otherwise deletes the sent row
    /// by its idempotency key. The delete is best effort; the "Users can delete
    /// own swipes" policy (20260506000002) allows it.
    func unrecord(itemType: ItemType, itemId: String, clientEventId: String?) async {
        let key = Self.key(itemType: itemType, itemId: itemId)
        if swipedItemKeys.contains(key) {
            swipedOrder.removeAll { $0 == key }
            swipedItemKeys = Set(swipedOrder)
            Self.saveLocal(localKey, order: swipedOrder)
        }

        guard let clientEventId else { return }
        let queue = Self.loadPending(pendingKey)
        if queue.contains(where: { $0.clientEventId == clientEventId }) {
            Self.savePending(pendingKey, queue: queue.filter { $0.clientEventId != clientEventId })
            return
        }
        guard let client = supabase, AuthService.shared.currentUser != nil else { return }
        _ = try? await client
            .from("swipe_interactions")
            .delete()
            .eq("client_event_id", value: clientEventId)
            .execute()
    }

    /// Whether the given item has been swiped on at least once.
    func hasSwiped(itemType: ItemType, itemId: String) -> Bool {
        swipedItemKeys.contains(Self.key(itemType: itemType, itemId: itemId))
    }

    /// Forgets the "already seen" history for the given lanes so the deck can
    /// deal those cards again (IOS-DD-DISCOVER-03, "Start over"). The unsent
    /// queue is left alone: those swipes happened and still count.
    func forgetSeen(itemTypes: Set<ItemType>) {
        let prefixes = itemTypes.map { "\($0.rawValue):" }
        swipedOrder.removeAll { key in prefixes.contains { key.hasPrefix($0) } }
        swipedItemKeys = Set(swipedOrder)
        Self.saveLocal(localKey, order: swipedOrder)
    }

    /// Clears local swipe history and the unsent queue. Called from
    /// AuthService.purgeLocalUserState on sign-out (IOS-DD-DISCOVER-09) and by
    /// privacy controls.
    func reset() {
        swipedItemKeys = []
        swipedOrder = []
        UserDefaults.standard.removeObject(forKey: localKey)
        UserDefaults.standard.removeObject(forKey: pendingKey)
    }

    /// Keep at most `cap` queued rows, dropping the OLDEST first.
    nonisolated static func trimmedQueue(_ queue: [PendingSwipe], cap: Int) -> [PendingSwipe] {
        queue.count <= cap ? queue : Array(queue.suffix(cap))
    }

    /// Splits the queue into rows this user may send and rows that belong to
    /// someone else (IOS-DD-DISCOVER-09). Rows with no owner predate the stamp:
    /// before it, only signed-in swipes could be flushed, so they are sent as
    /// they always were.
    nonisolated static func partitionForFlush(
        _ queue: [PendingSwipe],
        currentUserId: String
    ) -> (send: [PendingSwipe], drop: [PendingSwipe]) {
        var send: [PendingSwipe] = []
        var drop: [PendingSwipe] = []
        for row in queue {
            if row.userId == nil || row.userId == currentUserId {
                send.append(row)
            } else {
                drop.append(row)
            }
        }
        return (send, drop)
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
            // Rows another account queued on this device are dropped, not
            // sent under this user's id (IOS-DD-DISCOVER-09).
            let pending = Self.loadPending(pendingKey)
            let sendable = Self.partitionForFlush(pending, currentUserId: userId).send
            if sendable.count != pending.count {
                Self.savePending(pendingKey, queue: sendable)
            }
            let batch = Array(sendable.prefix(Self.flushBatchSize))
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

            // Remove ONLY the rows we actually sent, by key where they have
            // one. New rows are appended at the end, so anything queued during
            // the insert survives instead of being blanked, and a row an undo
            // removed mid-flight does not shift the count.
            let sentKeys = Set(batch.compactMap(\.clientEventId))
            var remaining = Self.loadPending(pendingKey)
            if sentKeys.count == batch.count {
                remaining.removeAll { row in
                    guard let id = row.clientEventId else { return false }
                    return sentKeys.contains(id)
                }
            } else {
                remaining.removeFirst(min(batch.count, remaining.count))
            }
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

    /// A queued row. Internal so the queue-hygiene tests can build one.
    struct PendingSwipe: Codable, Equatable {
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
        /// Who queued the row (IOS-DD-DISCOVER-09). Optional for the same
        /// reason as clientEventId: older queues have no owner.
        var userId: String? = nil
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
