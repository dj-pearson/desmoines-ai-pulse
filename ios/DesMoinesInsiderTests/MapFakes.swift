import Foundation
import CoreLocation
@testable import DesMoinesInsider

/// A controllable MapContentLoading for the map view-model tests
/// (IOS-DD-MAP-04/06/10/15). Records every origin it is asked for.
@MainActor
final class FakeMapLoader: MapContentLoading {
    var events: [Event] = []
    var restaurants: [Restaurant] = []
    var attractions: [Attraction] = []
    var searchEventResults: [Event] = []
    var searchRestaurantResults: [Restaurant] = []
    var searchAttractionResults: [Attraction] = []
    /// When set, every call throws it.
    var error: Error?

    private(set) var nearbyEventCalls = 0
    private(set) var searchEventCalls = 0
    private(set) var origins: [CLLocationCoordinate2D] = []
    private(set) var queries: [String] = []

    func nearbyEvents(lat: Double, lng: Double, radiusMiles: Double, until: Date?) async throws -> [Event] {
        nearbyEventCalls += 1
        origins.append(CLLocationCoordinate2D(latitude: lat, longitude: lng))
        if let error { throw error }
        return events
    }

    func nearbyRestaurants(lat: Double, lng: Double, radiusMiles: Double) async throws -> [Restaurant] {
        if let error { throw error }
        return restaurants
    }

    func nearbyAttractions(lat: Double, lng: Double, radiusMiles: Double) async throws -> [Attraction] {
        if let error { throw error }
        return attractions
    }

    func searchEvents(_ query: String) async throws -> [Event] {
        searchEventCalls += 1
        queries.append(query)
        if let error { throw error }
        return searchEventResults
    }

    func searchRestaurants(_ query: String) async throws -> [Restaurant] {
        if let error { throw error }
        return searchRestaurantResults
    }

    func searchAttractions(_ query: String) async throws -> [Attraction] {
        if let error { throw error }
        return searchAttractionResults
    }
}

/// A MapLocationProviding with a fixed status and fix.
@MainActor
final class FakeMapLocation: MapLocationProviding {
    var authorizationStatus: CLAuthorizationStatus
    var accuracyAuthorization: CLAccuracyAuthorization = .fullAccuracy
    var fix: CLLocation?

    init(status: CLAuthorizationStatus = .authorizedWhenInUse, latitude: Double? = nil, longitude: Double? = nil) {
        authorizationStatus = status
        if let latitude, let longitude {
            fix = CLLocation(latitude: latitude, longitude: longitude)
        }
    }

    func awaitAuthorizationDecision(timeout: Duration) async -> CLAuthorizationStatus {
        authorizationStatus
    }

    func getCurrentLocation() async throws -> CLLocation {
        guard let fix else { throw LocationService.LocationError.unavailable }
        return fix
    }

    func distance(from coordinate: CLLocationCoordinate2D) -> Double? {
        guard let fix else { return nil }
        return fix.distance(from: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)) * 0.000621371
    }

    func formattedDistance(from coordinate: CLLocationCoordinate2D) -> String? {
        distance(from: coordinate).map { String(format: "%.1f mi", $0) }
    }
}

/// Builders shared by the map tests. Every instant is Central time.
enum MapFixtures {
    static let downtownLat = 41.5868
    static let downtownLng = -93.6250

    static func central(_ year: Int, _ month: Int, _ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        DesMoinesTime.calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute))!
    }

    static func event(_ id: String, start: Date, end: Date? = nil, lat: Double = downtownLat, lng: Double = downtownLng) -> Event {
        var e = Event(id: id, title: "Event \(id)", date: DateParser.toISO(start))
        e.endDate = end.map { DateParser.toISO($0) }
        e.latitude = lat
        e.longitude = lng
        return e
    }

    static func restaurant(_ id: String, hours: StoredHours? = nil, businessStatus: String? = nil,
                           lat: Double = downtownLat, lng: Double = downtownLng) -> Restaurant {
        var r = Restaurant(id: id, name: "Restaurant \(id)")
        r.hoursJson = hours
        r.businessStatus = businessStatus
        r.latitude = lat
        r.longitude = lng
        return r
    }

    static func attraction(_ id: String, name: String? = nil, lat: Double = downtownLat, lng: Double = downtownLng) -> Attraction {
        var a = Attraction(id: id, name: name ?? "Attraction \(id)", type: "Park")
        a.latitude = lat
        a.longitude = lng
        return a
    }

    /// Open every day 11:00-22:00.
    static var dailyHours: StoredHours {
        StoredHours(periods: (0...6).map {
            StoredHours.Period(open: .init(day: $0, hour: 11), close: .init(day: $0, hour: 22))
        })
    }

    /// Open Monday 06:00-07:00 only.
    static var mondayBreakfastHours: StoredHours {
        StoredHours(periods: [StoredHours.Period(open: .init(day: 1, hour: 6), close: .init(day: 1, hour: 7))])
    }
}
