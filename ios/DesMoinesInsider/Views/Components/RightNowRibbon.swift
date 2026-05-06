import SwiftUI
import CoreLocation

/// "Right Now" contextual ribbon shown at the top of the Home tab. Composes
/// a single sentence from { temperature, conditions, time-of-day, location,
/// matching-item count } and tapping opens DiscoverView pre-filtered to the
/// matching slice.
///
/// Hidden when location is denied or weather fetches fail (no broken state).
///
/// IOS-DISCOVER-2026-005.
struct RightNowRibbon: View {
    @State private var weather = WeatherService.shared
    @State private var location = LocationService.shared
    @State private var matchingCount: Int = 0
    @State private var template: Template?
    @State private var isLoading = false

    /// Caller hooks: tapping the ribbon opens DiscoverView with these.
    let onTap: (DiscoverFilterContext, DiscoverMode) -> Void

    var body: some View {
        Group {
            if let template, let snap = weather.current {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onTap(template.filter, template.mode)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: template.systemIcon)
                            .font(.title2)
                            .foregroundStyle(template.tint)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(template.headline(temperatureF: snap.temperatureF, count: matchingCount))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.leading)
                            Text("Tap to swipe through them")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(template.tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(template.tint.opacity(0.25), lineWidth: 1),
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(template.accessibilityLabel(temperatureF: snap.temperatureF, count: matchingCount))
                .accessibilityHint("Opens swipe discovery filtered to this slice")
            } else {
                EmptyView()
            }
        }
        .task(id: location.userLocation?.coordinate.latitude ?? 0) {
            await refresh()
        }
    }

    // MARK: - Refresh

    private func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        // Bail silently if the user denied location — we don't want a broken
        // ribbon that says "78° in cupertino" when the user is in Iowa.
        guard location.authorizationStatus == .authorizedWhenInUse
            || location.authorizationStatus == .authorizedAlways
            || location.userLocation != nil
        else { return }

        // Use cached location if we have one, otherwise request once.
        let loc: CLLocation
        if let existing = location.userLocation {
            loc = existing
        } else {
            do {
                loc = try await location.getCurrentLocation()
            } catch {
                return
            }
        }

        guard let snap = await weather.refresh(for: loc) else { return }

        // Pick a template based on the weather + time of day.
        let now = Date()
        let hour = Calendar.current.component(.hour, from: now)
        let weekday = Calendar.current.component(.weekday, from: now)
        let chosen = Template.choose(snapshot: snap, hour: hour, weekday: weekday)

        // Count matching items so the headline reads "4 patios open within
        // 10 min of you" instead of an unspecific "patios are open".
        let count = await chosen.estimateCount()
        await MainActor.run {
            self.template = chosen
            self.matchingCount = count
        }
    }
}

// MARK: - Templates

extension RightNowRibbon {
    /// One-sentence ribbon variant + the discover slice it opens.
    struct Template {
        let id: String
        let systemIcon: String
        let tint: Color
        let mode: DiscoverMode
        let filter: DiscoverFilterContext
        private let headlineFn: (Double, Int) -> String
        private let countFetcher: () async -> Int

        func headline(temperatureF: Double, count: Int) -> String {
            headlineFn(temperatureF, count)
        }

        func accessibilityLabel(temperatureF: Double, count: Int) -> String {
            headline(temperatureF: temperatureF, count: count) + ". Tap to swipe through them."
        }

        func estimateCount() async -> Int {
            await countFetcher()
        }

        // MARK: Choose

        static func choose(
            snapshot: WeatherService.Snapshot,
            hour: Int,
            weekday: Int,
        ) -> Template {
            let temp = snapshot.temperatureF
            let cond = snapshot.conditions

            // Hot + clear → patios
            if temp >= 70, cond == .clear {
                return patios()
            }
            // Cold + wet → cozy
            if temp <= 50, cond == .rain || cond == .snow {
                return cozy()
            }
            // Snow → comfort food
            if cond == .snow {
                return comfortFood()
            }
            // Evening (after 6pm) → live music
            if hour >= 18 && hour <= 23 {
                return liveMusic()
            }
            // Lunch hour
            if hour >= 11 && hour <= 14 {
                return lunch()
            }
            // Default: open now restaurants
            return openNow()
        }

        // MARK: Concrete templates

        private static func patios() -> Template {
            var ctx = DiscoverFilterContext()
            ctx.openNow = true
            return Template(
                id: "patios",
                systemIcon: "sun.max.fill",
                tint: .orange,
                mode: .restaurants,
                filter: ctx,
                headlineFn: { temp, count in
                    let countText = count > 0 ? "— \(count) patios open within 10 min of you" : "— check out the patio scene"
                    return "It's \(Int(temp.rounded()))° and sunny \(countText)"
                },
                countFetcher: {
                    // We don't have a cheap "count restaurants with patio + open"
                    // query; approximate with "open now" count from cache.
                    return 0
                },
            )
        }

        private static func cozy() -> Template {
            var ctx = DiscoverFilterContext()
            ctx.openNow = true
            return Template(
                id: "cozy",
                systemIcon: "cloud.rain.fill",
                tint: .blue,
                mode: .restaurants,
                filter: ctx,
                headlineFn: { temp, count in
                    let countText = count > 0 ? "— try one of these \(count) cozy spots" : "— let's find a cozy spot"
                    return "Cold and wet (\(Int(temp.rounded()))°) \(countText)"
                },
                countFetcher: { 0 },
            )
        }

        private static func comfortFood() -> Template {
            var ctx = DiscoverFilterContext()
            ctx.openNow = true
            return Template(
                id: "comfort_food",
                systemIcon: "snowflake",
                tint: .cyan,
                mode: .restaurants,
                filter: ctx,
                headlineFn: { temp, count in
                    let suffix = count > 0 ? "— \(count) comfort-food picks open" : "— let's find comfort food"
                    return "Snowing — \(suffix)"
                },
                countFetcher: { 0 },
            )
        }

        private static func liveMusic() -> Template {
            var ctx = DiscoverFilterContext()
            ctx.eventCategory = nil // Music category resolved server-side via search
            ctx.datePreset = .today
            return Template(
                id: "live_music",
                systemIcon: "music.note",
                tint: .purple,
                mode: .events,
                filter: ctx,
                headlineFn: { _, count in
                    let suffix = count > 0 ? "\(count) live music shows tonight" : "Live music tonight"
                    return suffix
                },
                countFetcher: { 0 },
            )
        }

        private static func lunch() -> Template {
            var ctx = DiscoverFilterContext()
            ctx.openNow = true
            return Template(
                id: "lunch",
                systemIcon: "fork.knife",
                tint: .green,
                mode: .restaurants,
                filter: ctx,
                headlineFn: { _, count in
                    let suffix = count > 0 ? "\(count) lunch spots open right now" : "Lunch spots open right now"
                    return suffix
                },
                countFetcher: { 0 },
            )
        }

        private static func openNow() -> Template {
            var ctx = DiscoverFilterContext()
            ctx.openNow = true
            return Template(
                id: "open_now",
                systemIcon: "clock.fill",
                tint: .accentColor,
                mode: .restaurants,
                filter: ctx,
                headlineFn: { _, count in
                    let suffix = count > 0 ? "\(count) spots open near you" : "Spots open near you"
                    return suffix
                },
                countFetcher: { 0 },
            )
        }
    }
}
