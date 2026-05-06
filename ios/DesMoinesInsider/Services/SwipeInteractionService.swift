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
    /// the Discover deck to skip items it has already shown the user.
    private(set) var swipedItemKeys: Set<String> = []

    private let supabase: SupabaseClient? = SupabaseService.shared.client
    private let localKey = "discover.swipedItems.v1"
    private let pendingKey = "discover.pendingSwipes.v1"

    private init() {
        swipedItemKeys = Self.loadLocal(localKey)
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
        swipedItemKeys.insert(key)
        Self.saveLocal(localKey, set: swipedItemKeys)

        let row = PendingSwipe(
            itemType: itemType.rawValue,
            itemId: itemId,
            action: action.rawValue,
            sourceContext: sourceContext,
            createdAt: ISO8601DateFormatter().string(from: Date())
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
        UserDefaults.standard.removeObject(forKey: localKey)
        UserDefaults.standard.removeObject(forKey: pendingKey)
    }

    // MARK: - Network sync

    private func flushPending() async {
        guard let client = supabase else { return }
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            return
        }

        var queue = Self.loadPending(pendingKey)
        guard !queue.isEmpty else { return }

        struct InsertRow: Encodable {
            let user_id: String
            let item_type: String
            let item_id: String
            let action: String
            let source_context: [String: [String]]?
        }

        let rows = queue.map {
            InsertRow(
                user_id: userId,
                item_type: $0.itemType,
                item_id: $0.itemId,
                action: $0.action,
                source_context: $0.sourceContext
            )
        }

        do {
            try await client.from("swipe_interactions").insert(rows).execute()
            queue.removeAll()
            Self.savePending(pendingKey, queue: queue)
        } catch {
            // Leave queue intact; next swipe will retry.
        }
    }

    // MARK: - Storage helpers

    private static func key(itemType: ItemType, itemId: String) -> String {
        "\(itemType.rawValue):\(itemId)"
    }

    private static func loadLocal(_ key: String) -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
    }

    private static func saveLocal(_ key: String, set: Set<String>) {
        UserDefaults.standard.set(Array(set), forKey: key)
    }

    private struct PendingSwipe: Codable {
        let itemType: String
        let itemId: String
        let action: String
        let sourceContext: [String: [String]]?
        let createdAt: String
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
