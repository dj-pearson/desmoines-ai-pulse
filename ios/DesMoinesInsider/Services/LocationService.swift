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
    private(set) var isLocating = false
    private(set) var locationError: String?

    private let locationManager = CLLocationManager()
    private var pendingContinuations: [CheckedContinuation<CLLocation, Error>] = []
    private var isRequestInFlight = false

    /// Timeout duration for location requests (10 seconds).
    private static let locationTimeout: TimeInterval = 10.0

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
        isLocating = true
        locationError = nil

        defer { isLocating = false }

        // Check if we have a recent location (< 5 min old)
        if let existing = userLocation,
           existing.timestamp.timeIntervalSinceNow > -300 {
            return existing
        }

        guard authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways else {
            requestPermission()
            throw LocationError.permissionDenied
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
            self.isLocating = false
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            self.authorizationStatus = manager.authorizationStatus
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
