import Foundation

/// ViewModel for the restaurant detail screen (IOS-DD-RESTAURANTS-09).
///
/// The screen used to render whatever row the list handed it and never
/// re-read it. Rows from the rotation RPC have no geo_* fields and cached
/// rows can be days old, so detail now shows the passed row at once and swaps
/// in the full row when it arrives.
@MainActor
@Observable
final class RestaurantDetailViewModel {
    private(set) var restaurant: Restaurant

    private let service: RestaurantDetailProviding

    init(restaurant: Restaurant, service: RestaurantDetailProviding = RestaurantsService.shared) {
        self.restaurant = restaurant
        self.service = service
    }

    /// Re-read the full row. A merged row is replaced by the row it was
    /// merged into (WEB-AUTO-005). A failure is silent: the passed row is
    /// complete enough to use, and an error over it would be worse.
    func load() async {
        guard let fresh = try? await service.fetchRestaurant(id: restaurant.id) else { return }
        if fresh.isMerged == true, let survivorId = fresh.mergedInto, !survivorId.isEmpty, survivorId != fresh.id,
           let survivor = try? await service.fetchRestaurant(id: survivorId) {
            restaurant = survivor
            return
        }
        restaurant = fresh
    }

    /// The outcome, so the screen can say what happened. `try?` dropped
    /// notAuthenticated, so a guest's tap did nothing visible.
    func toggleFavorite() async -> Result<Bool, Error> {
        do {
            let nowSaved = try await FavoritesService.shared.toggleRestaurantFavorite(restaurantId: restaurant.id)
            return .success(nowSaved)
        } catch {
            return .failure(error)
        }
    }

    var shareText: String {
        var text = restaurant.name
        if let cuisine = restaurant.cuisine, !cuisine.isEmpty { text += " (\(cuisine))" }
        let location = restaurant.displayLocation
        if !location.isEmpty { text += " - \(location)" }
        if let rating = restaurant.rating { text += " \u{2B50} \(String(format: "%.1f", rating))" }
        if restaurant.lifecycle == .open || restaurant.lifecycle == .newlyOpened,
           let line = restaurant.openStatus().line {
            text += "\n\(line)"
        }
        text += "\n\nFound on Des Moines Insider"
        return text
    }

    /// The restaurant's page on the site, by slug when it has one (the web's
    /// canonical /restaurants/:slug). DeepLinkHandler routes both back in.
    var shareURL: URL {
        let key = (restaurant.slug?.isEmpty == false ? restaurant.slug : nil) ?? restaurant.id
        return Config.siteURL.appendingPathComponent("restaurants").appendingPathComponent(key)
    }
}
