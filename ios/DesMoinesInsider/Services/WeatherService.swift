import Foundation
import CoreLocation

/// Tiny client for the Open-Meteo current-conditions API. Keyless so we don't
/// have to ship a secret rotation story for an experimental ribbon.
///
/// Used by the "Right Now" ribbon on Home (IOS-DISCOVER-2026-005).
@MainActor
@Observable
final class WeatherService {
    static let shared = WeatherService()

    /// Open-Meteo's "weather code" enum, abbreviated to the buckets we care
    /// about for ribbon templating.
    enum Conditions: String {
        case clear, cloudy, rain, snow, fog, thunder, unknown

        // A `humanLabel` ("sunny", "rainy", ...) used to live here with no
        // callers. RightNowRibbon does not need it: its templates carry their
        // own phrasing through `headline(temperatureF:)`. A second source of
        // weather wording that nothing reads is worse than none - the next
        // person writing weather copy has to work out which one is live
        // (IOS-AUDIT-UX-060).
    }

    struct Snapshot: Codable, Equatable {
        let temperatureF: Double
        let conditionsRaw: String
        let fetchedAt: Date
        let latitude: Double
        let longitude: Double

        var conditions: Conditions {
            Conditions(rawValue: conditionsRaw) ?? .unknown
        }

        var isStale: Bool {
            Date().timeIntervalSince(fetchedAt) > 30 * 60
        }

        /// Whether this snapshot was taken close enough to `coordinate` to
        /// describe the weather there (IOS-AUDIT-BUG-015).
        ///
        /// The dedupe path already applied this; the network-failure fallback
        /// did not, and returned whatever snapshot happened to be cached. So a
        /// user in another city with no connection was shown Des Moines weather
        /// presented as their own - wrong in a way that looks completely normal.
        func isNear(_ coordinate: CLLocationCoordinate2D) -> Bool {
            abs(latitude - coordinate.latitude) < Snapshot.proximityDegrees
                && abs(longitude - coordinate.longitude) < Snapshot.proximityDegrees
        }

        /// About 5.5 km of latitude. Weather is a city-scale quantity, so this
        /// is deliberately loose - it exists to catch a different CITY, not a
        /// different street.
        static let proximityDegrees: Double = 0.05
    }

    private(set) var current: Snapshot?
    private(set) var lastError: String?

    private let cacheKey = "weather.snapshot.v1"
    private let userDefaults: UserDefaults

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
        if let data = userDefaults.data(forKey: cacheKey),
           let snap = try? JSONDecoder().decode(Snapshot.self, from: data) {
            current = snap
        }
    }

    /// Fetch the current weather for a coordinate. Falls back to cached value
    /// on network failure, returns nil only if there's nothing usable at all.
    @discardableResult
    func refresh(for location: CLLocation) async -> Snapshot? {
        // Cheap dedupe: if we already have a fresh snapshot for roughly this
        // location, skip the network call.
        if let snap = current, !snap.isStale, snap.isNear(location.coordinate) {
            return snap
        }

        // Everything below can fall back to the cache. It is only a valid
        // fallback for the place it was taken.
        let fallback = current.flatMap { $0.isNear(location.coordinate) ? $0 : nil }

        // Round to ~1km (2 decimal places) before sending to the third-party
        // Open-Meteo host — city-level weather doesn't need exact coordinates and
        // we shouldn't transmit precise location off-device (IOS-AUDIT-SEC-010).
        let lat = (location.coordinate.latitude * 100).rounded() / 100
        let lon = (location.coordinate.longitude * 100).rounded() / 100
        let urlString =
            "https://api.open-meteo.com/v1/forecast?latitude=\(lat)&longitude=\(lon)" +
            "&current=temperature_2m,weather_code&temperature_unit=fahrenheit"
        guard let url = URL(string: urlString) else { return fallback }

        do {
            var req = URLRequest(url: url)
            req.timeoutInterval = 6
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                lastError = "Weather HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)"
                return fallback
            }

            struct Payload: Decodable {
                struct Current: Decodable {
                    let temperature_2m: Double
                    let weather_code: Int
                }
                let current: Current
            }
            let parsed = try JSONDecoder().decode(Payload.self, from: data)
            let snapshot = Snapshot(
                temperatureF: parsed.current.temperature_2m,
                conditionsRaw: bucketWeatherCode(parsed.current.weather_code).rawValue,
                fetchedAt: Date(),
                latitude: lat,
                longitude: lon,
            )

            current = snapshot
            if let encoded = try? JSONEncoder().encode(snapshot) {
                userDefaults.set(encoded, forKey: cacheKey)
            }
            lastError = nil
            return snapshot
        } catch {
            lastError = error.localizedDescription
            return fallback
        }
    }

    /// Maps Open-Meteo's weather_code (WMO) into our ribbon buckets.
    /// https://open-meteo.com/en/docs#weathervariables
    private func bucketWeatherCode(_ code: Int) -> Conditions {
        switch code {
        case 0: return .clear
        case 1, 2, 3: return .cloudy
        case 45, 48: return .fog
        case 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82: return .rain
        case 71, 73, 75, 77, 85, 86: return .snow
        case 95, 96, 99: return .thunder
        default: return .unknown
        }
    }
}
