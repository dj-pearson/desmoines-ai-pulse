import Foundation
import CoreLocation

/// Manages user location and distance calculations.
/// Mirrors the web app's useProximitySearch geolocation patterns.
@MainActor
@Observable
final class LocationService: NSObject, CLLocationManagerDelegate {
    static let shared = LocationService()

    private(set) var userLocation: CLLocation?
    private(set) var authorizationStatus: CLAuthorizationStatus = .notDetermined
    private(set) var locationError: String?

    /// Derived from the request actually in flight, not from a per-call flag
    /// (IOS-AUDIT-BUG-015).
    ///
    /// It used to be a stored property set true on entry with
    /// `defer { isLocating = false }`. Two overlapping callers is the normal
    /// case here - several rails ask for location as a screen appears - and
    /// the first one to return, including the one that returns instantly from
    /// cache, ran its defer and switched the spinner off while the other was
    /// still waiting.
    var isLocating: Bool { isRequestInFlight }

    private let locationManager = CLLocationManager()
    private var pendingContinuations: [CheckedContinuation<CLLocation, Error>] = []
    private var isRequestInFlight = false

    /// Timeout duration for location requests (10 seconds).
    private static let locationTimeout: TimeInterval = 10.0

    /// How long a fix stays reusable.
    nonisolated static let cacheLifetime: TimeInterval = 300

    /// Whether a status permits using location at all.
    ///
    /// `nonisolated` because it is a pure function of its argument, and the
    /// service being @MainActor otherwise makes it unusable from anywhere
    /// else - including a test, which is the point of extracting it.
    nonisolated static func isAuthorized(_ status: CLAuthorizationStatus) -> Bool {
        status == .authorizedWhenInUse || status == .authorizedAlways
    }

    /// Whether a fix taken at `timestamp` is still reusable at `now`.
    nonisolated static func isFresh(_ timestamp: Date, now: Date) -> Bool {
        now.timeIntervalSince(timestamp) < cacheLifetime
    }

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        authorizationStatus = locationManager.authorizationStatus
    }

    // MARK: - Request Permission

    func requestPermission() {
        locationManager.requestWhenInUseAuthorization()
    }

    // MARK: - Get Current Location

    func getCurrentLocation() async throws -> CLLocation {
        locationError = nil

        // AUTHORIZATION FIRST. This guard used to sit BELOW the cache shortcut,
        // so for five minutes after a user revoked location in Settings the app
        // kept handing out the coordinate it had already taken - which is the
        // one thing revoking is supposed to stop (IOS-AUDIT-BUG-015).
        guard Self.isAuthorized(authorizationStatus) else {
            requestPermission()
            throw LocationError.permissionDenied
        }

        // Recent enough to reuse (< 5 min old).
        if let existing = userLocation,
           Self.isFresh(existing.timestamp, now: Date()) {
            return existing
        }

        return try await withCheckedThrowingContinuation { continuation in
            self.pendingContinuations.append(continuation)

            // Only start a new location request if one isn't already in flight
            if !self.isRequestInFlight {
                self.isRequestInFlight = true
                self.locationManager.requestLocation()

                // Timeout: fail all pending continuations if location takes too long
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: UInt64(Self.locationTimeout * 1_000_000_000))
                    guard let self, self.isRequestInFlight else { return }
                    self.isRequestInFlight = false
                    let continuations = self.pendingContinuations
                    self.pendingContinuations.removeAll()
                    for c in continuations {
                        c.resume(throwing: LocationError.unavailable)
                    }
                }
            }
        }
    }

    // MARK: - Distance Calculation (Haversine)

    func distance(from coordinate: CLLocationCoordinate2D) -> Double? {
        guard let userLocation else { return nil }
        let target = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        return userLocation.distance(from: target) * 0.000621371 // meters to miles
    }

    func formattedDistance(from coordinate: CLLocationCoordinate2D) -> String? {
        guard let miles = distance(from: coordinate) else { return nil }
        if miles < 0.1 { return "Nearby" }
        if miles < 1.0 {
            let feet = Int(miles * 5280)
            return "\(feet) ft away"
        }
        return String(format: "%.1f mi", miles)
    }

    // MARK: - CLLocationManagerDelegate

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            self.userLocation = location
            self.isRequestInFlight = false
            let continuations = self.pendingContinuations
            self.pendingContinuations.removeAll()
            for c in continuations {
                c.resume(returning: location)
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.locationError = error.localizedDescription
            self.isRequestInFlight = false
            let continuations = self.pendingContinuations
            self.pendingContinuations.removeAll()
            for c in continuations {
                c.resume(throwing: error)
            }
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            let status = manager.authorizationStatus
            self.authorizationStatus = status
            guard !Self.isAuthorized(status) else { return }

            // Revoked. Drop the fix rather than only refusing to hand out new
            // ones: distance(from:) reads userLocation directly with no
            // authorization check, so every "0.4 mi away" label on screen would
            // otherwise keep using the coordinate the user just withdrew.
            self.userLocation = nil
            self.isRequestInFlight = false
            let continuations = self.pendingContinuations
            self.pendingContinuations.removeAll()
            for c in continuations {
                c.resume(throwing: LocationError.permissionDenied)
            }
        }
    }

    // MARK: - Error Types

    enum LocationError: LocalizedError {
        case permissionDenied
        case unavailable

        var errorDescription: String? {
            switch self {
            case .permissionDenied: return "Location permission is required to find events near you."
            case .unavailable: return "Unable to determine your location."
            }
        }
    }
}
