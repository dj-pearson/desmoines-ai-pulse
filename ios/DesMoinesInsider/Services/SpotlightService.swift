import Foundation
import CoreSpotlight
import MobileCoreServices

/// Indexes app content (events, restaurants, attractions) into iOS Spotlight search.
actor SpotlightService {
    static let shared = SpotlightService()

    private init() {}

    // MARK: - Index Events

    func indexEvents(_ events: [Event]) async {
        let items = events.compactMap { event -> CSSearchableItem? in
            let attributes = CSSearchableItemAttributeSet(contentType: .content)
            attributes.title = event.title
            attributes.contentDescription = event.displayDescription
            attributes.keywords = [
                event.category ?? "event",
                event.venue ?? "",
                event.city ?? "Des Moines",
            ].filter { !$0.isEmpty }

            if let date = event.parsedDate {
                attributes.startDate = date
                attributes.endDate = date.addingTimeInterval(7200)
            }

            if let location = event.location {
                attributes.namedLocation = location
            }

            if let lat = event.latitude, let lng = event.longitude {
                attributes.latitude = NSNumber(value: lat)
                attributes.longitude = NSNumber(value: lng)
            }

            if let imageUrl = event.imageUrl {
                attributes.thumbnailURL = URL(string: imageUrl)
            }

            return CSSearchableItem(
                uniqueIdentifier: "event-\(event.id)",
                domainIdentifier: "com.desmoines.aipulse.events",
                attributeSet: attributes
            )
        }

        do {
            try await CSSearchableIndex.default().indexSearchableItems(items)
        } catch {
            print("Spotlight indexing error (events): \(error.localizedDescription)")
        }
    }

    // MARK: - Index Restaurants

    func indexRestaurants(_ restaurants: [Restaurant]) async {
        let items = restaurants.compactMap { restaurant -> CSSearchableItem? in
            let attributes = CSSearchableItemAttributeSet(contentType: .content)
            attributes.title = restaurant.name
            attributes.contentDescription = restaurant.description
            attributes.keywords = [
                restaurant.cuisine ?? "restaurant",
                restaurant.city ?? "Des Moines",
                restaurant.priceRange ?? "",
            ].filter { !$0.isEmpty }

            if let location = restaurant.location {
                attributes.namedLocation = location
            }

            if let lat = restaurant.latitude, let lng = restaurant.longitude {
                attributes.latitude = NSNumber(value: lat)
                attributes.longitude = NSNumber(value: lng)
            }

            if let imageUrl = restaurant.imageUrl {
                attributes.thumbnailURL = URL(string: imageUrl)
            }

            return CSSearchableItem(
                uniqueIdentifier: "restaurant-\(restaurant.id)",
                domainIdentifier: "com.desmoines.aipulse.restaurants",
                attributeSet: attributes
            )
        }

        do {
            try await CSSearchableIndex.default().indexSearchableItems(items)
        } catch {
            print("Spotlight indexing error (restaurants): \(error.localizedDescription)")
        }
    }

    // MARK: - Remove

    func removeAllItems() async {
        do {
            try await CSSearchableIndex.default().deleteAllSearchableItems()
        } catch {
            print("Spotlight remove error: \(error.localizedDescription)")
        }
    }

    func removeItems(withDomain domain: String) async {
        do {
            try await CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [domain])
        } catch {
            print("Spotlight remove domain error: \(error.localizedDescription)")
        }
    }
}
