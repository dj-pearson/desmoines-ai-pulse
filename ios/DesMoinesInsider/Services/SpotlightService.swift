import Foundation
import CoreSpotlight
import MobileCoreServices
import os

/// Indexes app content (events, restaurants, attractions) into iOS Spotlight search.
actor SpotlightService {
    static let shared = SpotlightService()

    private init() {}

    // MARK: - Re-index suppression (IOS-AUDIT-FEAT-026 AC3)

    /// Identifier -> a signature of what was last written for it this session.
    ///
    /// Both callers index on a RESET load, which is every first appear, every
    /// pull-to-refresh, every filter change and every search. Each one handed
    /// the whole first page to CSSearchableIndex again. That is correct -
    /// indexing is idempotent by uniqueIdentifier, so nothing duplicates - but
    /// it rewrites tens of unchanged items to a disk-backed index every time a
    /// user taps a filter chip, which is what AC3 asks not to happen.
    ///
    /// Session-scoped on purpose. The Spotlight index itself persists across
    /// launches, so a cold start re-indexing once is cheap and also repairs
    /// anything the system evicted while the app was closed. Persisting these
    /// signatures would trade that repair for very little.
    private var indexedSignatures: [String: String] = [:]

    /// The subset whose indexed content differs from what this session last wrote.
    ///
    /// The signature covers exactly the fields written into the attribute set,
    /// so an edited title or description re-indexes while an unchanged row does
    /// not. Building the items is cheap; `indexSearchableItems` is the disk work
    /// being avoided.
    private func changedOnly(_ items: [CSSearchableItem]) -> [CSSearchableItem] {
        var changed: [CSSearchableItem] = []
        for item in items {
            guard let identifier = item.uniqueIdentifier else {
                changed.append(item)
                continue
            }
            let signature = [
                item.attributeSet.title ?? "",
                item.attributeSet.contentDescription ?? "",
                (item.attributeSet.keywords ?? []).joined(separator: ","),
                item.expirationDate.map { String($0.timeIntervalSince1970) } ?? "",
            ].joined(separator: "|")
            if indexedSignatures[identifier] == signature { continue }
            indexedSignatures[identifier] = signature
            changed.append(item)
        }
        return changed
    }

    /// Forget signatures for identifiers removed from the index, so a row that
    /// comes back is written again rather than being suppressed as unchanged.
    private func forgetSignatures(_ identifiers: [String]) {
        for identifier in identifiers { indexedSignatures.removeValue(forKey: identifier) }
    }

    // MARK: - Index Events

    /// Index events, expire them at their end, and remove any already-past
    /// ones from this batch (IOS-AUDIT-FEAT-037).
    ///
    /// Indexed items used to have no expirationDate and nothing ever pruned
    /// them, so a Spotlight search surfaced last month's events forever and
    /// tapping one deep-linked to a detail page for an event the API no longer
    /// returns. Two independent mechanisms now stop that, because each covers
    /// what the other cannot:
    ///   - expirationDate lets iOS drop an item on its own, which is the only
    ///     thing that works for a user who stops opening the app.
    ///   - past events in this batch are deleted by identifier, which clears
    ///     what was indexed BEFORE this shipped and therefore carries no
    ///     expiration at all.
    ///
    /// Deleting only the identifiers in this batch, rather than wiping the
    /// events domain and re-indexing, is deliberate. The caller passes the
    /// first page of whatever the user is currently browsing, so a wipe would
    /// discard everything indexed under a different filter and shrink Spotlight
    /// coverage to one page.
    func indexEvents(_ events: [Event]) async {
        let (fresh, expiredIdentifiers) = Self.partition(events, now: Date())

        if !expiredIdentifiers.isEmpty {
            do {
                try await CSSearchableIndex.default()
                    .deleteSearchableItems(withIdentifiers: expiredIdentifiers)
                forgetSignatures(expiredIdentifiers)
            } catch {
                AppLogger.general.error("Spotlight prune error (events): \(error.localizedDescription)")
            }
        }

        let items = fresh.compactMap { event -> CSSearchableItem? in
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
                attributes.endDate = date.addingTimeInterval(Self.assumedDurationSeconds)
            }
            // An event with an unparseable date gets NO expiration, on purpose.
            // Guessing one would delete a listing we cannot date, and an
            // undated event is exactly the one a user is most likely to be
            // searching for by name.

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

            let item = CSSearchableItem(
                uniqueIdentifier: "event-\(event.id)",
                domainIdentifier: "com.desmoines.aipulse.events",
                attributeSet: attributes
            )
            // Set on the item rather than the attribute set: this is the
            // property CSSearchableIndex actually honours when deciding to drop
            // an item on its own.
            if let date = event.parsedDate {
                item.expirationDate = Self.expiration(for: date)
            }
            return item
        }

        let changed = changedOnly(items)
        guard !changed.isEmpty else { return }

        do {
            try await CSSearchableIndex.default().indexSearchableItems(changed)
        } catch {
            AppLogger.general.error("Spotlight indexing error (events): \(error.localizedDescription)")
        }
    }

    // MARK: - Expiry rules (pure, and the part under test)

    /// How long an event is assumed to run when the data carries only a start.
    /// Two hours, matching the endDate this service already wrote.
    static let assumedDurationSeconds: TimeInterval = 7200

    /// Grace period after the assumed end before Spotlight drops the item.
    ///
    /// Not zero. A user searching at 9pm for the thing they are standing in
    /// front of should still find it, and the start time is frequently the only
    /// time the source publishes, so the two-hour duration above is a guess
    /// that runs short more often than long.
    static let expiryGraceSeconds: TimeInterval = 6 * 3600

    /// When Spotlight should drop an event that starts at `date`.
    static func expiration(for date: Date) -> Date {
        date.addingTimeInterval(assumedDurationSeconds + expiryGraceSeconds)
    }

    /// Split a batch into the events worth indexing and the identifiers of the
    /// ones that are already past.
    ///
    /// `now` is a parameter so the boundary can be tested rather than waited
    /// for. An event with no parseable date is always indexed and never pruned.
    static func partition(_ events: [Event], now: Date) -> (fresh: [Event], expired: [String]) {
        var fresh: [Event] = []
        var expired: [String] = []
        for event in events {
            guard let date = event.parsedDate else {
                fresh.append(event)
                continue
            }
            if expiration(for: date) <= now {
                expired.append("event-\(event.id)")
            } else {
                fresh.append(event)
            }
        }
        return (fresh, expired)
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

        let changed = changedOnly(items)
        guard !changed.isEmpty else { return }

        do {
            try await CSSearchableIndex.default().indexSearchableItems(changed)
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
