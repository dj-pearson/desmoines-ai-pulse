import Foundation
import CoreSpotlight
import MobileCoreServices
import os

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
            AppLogger.general.error("Spotlight indexing error (events): \(error.localizedDescription)")
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
            AppLogger.general.error("Spotlight indexing error (restaurants): \(error.localizedDescription)")
        }
    }

    // MARK: - Index Articles (IOS-PARITY-002)

    func indexArticles(_ articles: [Article]) async {
        let items = articles.map { article -> CSSearchableItem in
            let attributes = CSSearchableItemAttributeSet(contentType: .content)
            attributes.title = article.title
            attributes.contentDescription = article.displaySummary
            attributes.keywords = ([article.displayCategory, "guide", "article"]
                + (article.tags ?? []))
                .filter { !$0.isEmpty }

            if let date = article.date {
                attributes.contentCreationDate = date
            }

            if let imageUrl = article.featuredImageUrl {
                attributes.thumbnailURL = URL(string: imageUrl)
            }

            return CSSearchableItem(
                uniqueIdentifier: "article-\(article.id)",
                domainIdentifier: "com.desmoines.aipulse.articles",
                attributeSet: attributes
            )
        }

        do {
            try await CSSearchableIndex.default().indexSearchableItems(items)
        } catch {
            AppLogger.general.error("Spotlight indexing error (articles): \(error.localizedDescription)")
        }
    }

    // MARK: - Index Hotels (IOS-PARITY-003)

    func indexHotels(_ hotels: [Hotel]) async {
        let items = hotels.map { hotel -> CSSearchableItem in
            let attributes = CSSearchableItemAttributeSet(contentType: .content)
            attributes.title = hotel.name
            attributes.contentDescription = hotel.shortDescription ?? hotel.description
            attributes.keywords = ([hotel.displayArea, hotel.hotelType ?? "hotel", "hotel", "stay", "lodging"]
                + (hotel.chainName.map { [$0] } ?? []))
                .filter { !$0.isEmpty }

            if let location = hotel.area ?? hotel.city {
                attributes.namedLocation = location
            }
            if let coord = hotel.coordinate {
                attributes.latitude = NSNumber(value: coord.latitude)
                attributes.longitude = NSNumber(value: coord.longitude)
            }
            if let imageUrl = hotel.imageUrl {
                attributes.thumbnailURL = URL(string: imageUrl)
            }

            return CSSearchableItem(
                uniqueIdentifier: "hotel-\(hotel.id)",
                domainIdentifier: "com.desmoines.aipulse.hotels",
                attributeSet: attributes
            )
        }

        do {
            try await CSSearchableIndex.default().indexSearchableItems(items)
        } catch {
            AppLogger.general.error("Spotlight indexing error (hotels): \(error.localizedDescription)")
        }
    }

    // MARK: - Remove

    func removeAllItems() async {
        do {
            try await CSSearchableIndex.default().deleteAllSearchableItems()
        } catch {
            AppLogger.general.error("Spotlight remove error: \(error.localizedDescription)")
        }
    }

    func removeItems(withDomain domain: String) async {
        do {
            try await CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [domain])
        } catch {
            AppLogger.general.error("Spotlight remove domain error: \(error.localizedDescription)")
        }
    }
}
