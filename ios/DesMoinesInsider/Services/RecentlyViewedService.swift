import Foundation

/// IOS-PARITY-007 · Recently-viewed content.
///
/// Persists the last few events / restaurants / attractions the user opened, so
/// the Dashboard can offer a "Jump back in" rail. UserDefaults-backed (like
/// SearchHistoryService) — lightweight, on-device, survives relaunch.
@MainActor
@Observable
final class RecentlyViewedService {
    static let shared = RecentlyViewedService()

    struct RecentItem: Codable, Identifiable, Hashable {
        let type: String   // "event" | "restaurant" | "attraction"
        let itemId: String
        let title: String
        let imageUrl: String?

        var id: String { "\(type)-\(itemId)" }

        var systemImage: String {
            switch type {
            case "event": return "calendar"
            case "restaurant": return "fork.knife"
            case "attraction": return "mountain.2.fill"
            case "article": return "doc.richtext"
            case "hotel": return "bed.double.fill"
            default: return "mappin.and.ellipse"
            }
        }
    }

    private(set) var recent: [RecentItem] = []

    private let key = "recentlyViewedItems_v1"
    private let maxItems = 12

    private init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let items = try? JSONDecoder().decode([RecentItem].self, from: data) {
            recent = items
        }
    }

    /// Record a viewed item (moves to front if already present, capped).
    func record(type: String, id: String, title: String, imageUrl: String?) {
        guard !id.isEmpty, !title.isEmpty else { return }
        let item = RecentItem(type: type, itemId: id, title: title, imageUrl: imageUrl)
        recent.removeAll { $0.id == item.id }
        recent.insert(item, at: 0)
        if recent.count > maxItems {
            recent = Array(recent.prefix(maxItems))
        }
        save()
    }

    func clear() {
        recent = []
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(recent) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
