import SwiftUI

/// IOS-PARITY-001 · Native AI Trip Planner.
///
/// Input form (dates, interests, party, budget, pace, neighborhood) → calls the
/// same `generate-itinerary` backend the web uses → renders a saved, day-by-day
/// itinerary. Tier-quota gated (Insider 5/mo, VIP unlimited) with a quota meter
/// and contextual paywall (IOS-SUB-011); the server enforces the same limit.
/// Reachable from the Discover hub and a Home entry point.
///
/// When trip storage is missing on the server the whole planner pauses with
/// one honest line instead of a form that can only fail
/// (IOS-DD-TRIP-PLANNER-01).
struct TripPlannerView: View {
    /// Discover pushes this into its own stack (false); the Home sheet / iPad
    /// detail own one (true).
    var ownsNavigationStack: Bool = true
    /// Shows a "Close" toolbar button — only when presented modally (Home sheet),
    /// not when it's a pushed/detail destination.
    var showsCloseButton: Bool = false

    @State private var storeKit = StoreKitService.shared
    @State private var service = TripPlannerService.shared
    @State private var network = NetworkMonitor.shared

    // Form state. Dates are Central days (IOS-DD-TRIP-PLANNER-14); the form
    // opens on this weekend, which is what most plans are for.
    @State private var startDate = TripDatePreset.thisWeekend.range(now: .now).start
    @State private var endDate = TripDatePreset.thisWeekend.range(now: .now).end
    @State private var selectedInterests: Set<String> = []
    @State private var groupSize = 2
    @State private var hasChildren = false
    @State private var budget = "moderate"
    @State private var pace = "moderate"
    @State private var neighborhood: String?

    // Data + UI state
    @State private var savedTrips: [TripPlan] = []
    @State private var usedThisMonth = 0
    /// The usage read failed; the meter says so and the client gate stands
    /// aside, since the server enforces the limit (IOS-DD-TRIP-PLANNER-04).
    @State private var usageUnknown = false
    @State private var tripsLoadFailed = false
    @State private var isGenerating = false
    @State private var generatingStep = 0
    @State private var isLoadingTrips = true
    @State private var errorMessage: String?
    @State private var toast: ToastMessage?
    @State private var generatedTrip: TripPlan?
    @State private var paywallContext: PaywallContext?
    @State private var pendingDelete: [TripPlan]?
    @State private var showAllPast = false
    /// Set by the paywall on a purchase; the blocked generate() resumes once
    /// the sheet is gone, so the result cover is not presented over it.
    @State private var resumeGenerateAfterPaywall = false

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var tier: SubscriptionTier { storeKit.currentTier }
    private var isPaused: Bool { service.availability == .paused }
    private let quotaAction = PremiumFeature.QuotaAction.tripPlans

    /// What the button area says while a plan is being built. The call takes
    /// tens of seconds; a line that moves reads as progress.
    static let generatingSteps = [
        "Checking what is on...",
        "Picking places to eat...",
        "Working out the timing...",
        "Putting the days in order...",
    ]

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content.navigationTitle("Trip Planner") }
        } else {
            content.navigationTitle("Trip Planner")
        }
    }

    /// Split in two so neither modifier chain is one long expression for the
    /// type checker.
    private var content: some View {
        presentingForm
            .sheet(item: $paywallContext, onDismiss: resumeAfterPaywall) { ctx in
                PaywallView(context: ctx, onPurchased: { resumeGenerateAfterPaywall = true })
            }
            .confirmationDialog(
                "Delete this itinerary?",
                isPresented: isConfirmingDelete,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) { confirmDelete() }
                Button("Cancel", role: .cancel) { pendingDelete = nil }
            } message: {
                Text("Deleting a plan does not return it to your monthly allowance.")
            }
            // A generation in flight is billed and saved server-side; a swipe
            // away used to hide the result (IOS-DD-TRIP-PLANNER-15).
            .interactiveDismissDisabled(isGenerating)
            .toastOverlay(message: $toast)
            .task(id: isGenerating) { await cycleGeneratingStatus() }
            .task { await reload() }
    }

    private var presentingForm: some View {
        Form { formSections }
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                if showsCloseButton {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Close") { dismiss() }
                    }
                }
            }
            .navigationDestination(for: TripPlan.self) { trip in
                ItineraryDetailView(trip: trip)
            }
            .fullScreenCover(item: $generatedTrip, onDismiss: { Task { await reload() } }) { trip in
                NavigationStack {
                    ItineraryDetailView(trip: trip)
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                Button("Done") { generatedTrip = nil }
                            }
                        }
                }
            }
    }

    private var isConfirmingDelete: Binding<Bool> {
        Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })
    }

    /// Resume the itinerary the user asked for once they have paid;
    /// generate() re-checks both gates against the refreshed tier
    /// (IOS-DD-MONETIZATION-22).
    private func resumeAfterPaywall() {
        guard resumeGenerateAfterPaywall else { return }
        resumeGenerateAfterPaywall = false
        Task { await generate() }
    }

    private func confirmDelete() {
        let trips = pendingDelete ?? []
        pendingDelete = nil
        Task { await deleteTrips(trips) }
    }

    @ViewBuilder
    private var formSections: some View {
        quotaSection
        if isPaused {
            generateSection
            pausedSavedSection
        } else {
            if !savedTrips.isEmpty { savedTripSections }
            formInputSections
            generateSection
            if savedTrips.isEmpty { savedSection }
        }
    }

    @ViewBuilder
    private var formInputSections: some View {
        Group {
            datesSection
            interestsSection
            partySection
            preferencesSection
        }
        .disabled(isGenerating)
    }

    // MARK: - Sections

    @ViewBuilder
    private var quotaSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: isPaused ? "pause.circle" : "sparkles")
                    .font(.title3)
                    .foregroundStyle(Color.accentColor.gradient)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("AI Trip Planner")
                        .font(.subheadline.weight(.semibold))
                    Text(quotaLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("AI Trip Planner. \(quotaLine)")
        }
    }

    private var datesSection: some View {
        Section {
            presetRow
            DatePicker("Start", selection: $startDate, in: DesMoinesTime.calendar.startOfDay(for: .now)..., displayedComponents: .date)
                .onChange(of: startDate) { _, newValue in
                    endDate = Self.clampedEnd(endDate, start: newValue)
                }
            DatePicker("End", selection: $endDate, in: startDate...Self.latestEnd(for: startDate), displayedComponents: .date)
        } header: {
            Text(savedTrips.isEmpty ? "When" : "Plan a new trip")
        } footer: {
            Text("Up to 14 days.")
        }
        // The days are Des Moines days, so the pickers show Central dates
        // whatever zone the phone is in.
        .environment(\.timeZone, DesMoinesTime.timeZone)
        .environment(\.calendar, DesMoinesTime.calendar)
    }

    private var presetRow: some View {
        let selected = TripDatePreset.matching(start: startDate, end: endDate, now: .now)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(TripDatePreset.allCases) { preset in
                    presetButton(preset, isOn: preset == selected)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func presetButton(_ preset: TripDatePreset, isOn: Bool) -> some View {
        Button {
            let range = preset.range(now: .now)
            startDate = range.start
            endDate = range.end
        } label: {
            Text(preset.title)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 14)
                .frame(minHeight: 44)
                .background(isOn ? Color.accentColor.opacity(0.15) : Color(.systemGray6), in: Capsule())
                .foregroundStyle(isOn ? Color.accentColor : .primary)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isSelected] : [])
    }

    private var interestsSection: some View {
        Section {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], spacing: 8) {
                ForEach(TripPlannerOptions.interests, id: \.value) { option in
                    chip(
                        label: option.label,
                        isOn: selectedInterests.contains(option.value)
                    ) {
                        if selectedInterests.contains(option.value) {
                            selectedInterests.remove(option.value)
                        } else {
                            selectedInterests.insert(option.value)
                        }
                    }
                }
            }
            .padding(.vertical, 4)
        } header: {
            Text("Interests")
        } footer: {
            Text("Pick any, or leave them all off for a bit of everything.")
        }
    }

    private var partySection: some View {
        Section("Party") {
            Stepper("Group size: \(groupSize)", value: $groupSize, in: 1...12)
                .accessibilityLabel("Group size \(groupSize)")
            Toggle("Traveling with kids", isOn: $hasChildren)
        }
    }

    private var preferencesSection: some View {
        Section("Preferences") {
            Picker("Budget", selection: $budget) {
                ForEach(TripPlannerOptions.budgets, id: \.value) { Text($0.label).tag($0.value) }
            }
            Picker("Pace", selection: $pace) {
                ForEach(TripPlannerOptions.paces, id: \.value) { Text($0.label).tag($0.value) }
            }
            Picker("Neighborhood", selection: $neighborhood) {
                Text("Anywhere").tag(String?.none)
                ForEach(TripPlannerOptions.neighborhoods, id: \.self) { Text($0).tag(String?.some($0)) }
            }
        }
    }

    @ViewBuilder
    private var generateSection: some View {
        Section {
            if isPaused {
                // Not a button, for free users too: the paywall must never
                // sell a feature that cannot run (IOS-DD-TRIP-PLANNER-01).
                Label(TripPlannerAvailability.pausedMessage, systemImage: "pause.circle")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                generateButton
                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .accessibilityLabel("Error: \(errorMessage)")
                }
            }
        }
    }

    private var generateButton: some View {
        Button {
            Task { await generate() }
        } label: {
            HStack {
                Spacer()
                if isGenerating {
                    ProgressView().tint(.white)
                    Text(generatingLabel)
                } else {
                    Image(systemName: "wand.and.stars")
                    Text(tier == .free ? "Unlock Trip Planner" : "Generate Itinerary")
                }
                Spacer()
            }
            .font(.headline)
            .padding(.vertical, 10)
            .foregroundStyle(.white)
            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
        }
        .listRowInsets(EdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 8))
        .listRowBackground(Color.clear)
        .disabled(isGenerating)
    }

    private var generatingLabel: String {
        reduceMotion ? "Building your itinerary..." : Self.generatingSteps[generatingStep % Self.generatingSteps.count]
    }

    /// Empty, loading or failed list, shown under the form (first visit).
    @ViewBuilder
    private var savedSection: some View {
        Section("Saved itineraries") {
            if isLoadingTrips {
                HStack { ProgressView().controlSize(.small); Text("Loading…").foregroundStyle(.secondary) }
            } else if tripsLoadFailed {
                loadFailedRow
            } else {
                Text("Your generated itineraries will appear here.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var pausedSavedSection: some View {
        Section("Saved itineraries") {
            Text("Saved itineraries are unavailable while planning is paused.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var loadFailedRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(
                network.isConnected ? "Couldn't load your itineraries." : "You're offline.",
                systemImage: network.isConnected ? "exclamationmark.triangle.fill" : "wifi.slash"
            )
            .font(.footnote)
            .foregroundStyle(.orange)
            Button("Try again") { Task { await reload() } }
                .buttonStyle(.bordered)
        }
    }

    /// Returning users see their plans first (IOS-DD-TRIP-PLANNER-16).
    @ViewBuilder
    private var savedTripSections: some View {
        let parts = Self.partition(savedTrips, today: TripSchedule.ymd(Date()))
        if !parts.upcoming.isEmpty {
            Section("Upcoming") {
                tripRows(parts.upcoming)
            }
        }
        if !parts.past.isEmpty {
            Section("Past") {
                tripRows(showAllPast ? parts.past : Array(parts.past.prefix(3)))
                if !showAllPast && parts.past.count > 3 {
                    Button("Show all \(parts.past.count)") { showAllPast = true }
                        .font(.subheadline)
                }
            }
        }
    }

    private func tripRows(_ trips: [TripPlan]) -> some View {
        ForEach(trips) { trip in
            NavigationLink(value: trip) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(trip.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text(trip.dateRangeDisplay).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .onDelete { offsets in
            pendingDelete = offsets.map { trips[$0] }
        }
    }

    // MARK: - Pieces

    private func chip(label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if isOn {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.bold))
                        .accessibilityHidden(true)
                }
                Text(label)
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(isOn ? Color.accentColor.opacity(0.15) : Color(.systemGray6))
            .foregroundStyle(isOn ? Color.accentColor : .primary)
            .clipShape(Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isOn ? [.isSelected] : [])
    }

    private var quotaLine: String {
        if isPaused { return TripPlannerAvailability.pausedMessage }
        return Self.quotaText(tier: tier, used: usedThisMonth, usageUnknown: usageUnknown)
    }

    // MARK: - Pure helpers (tested in TripPlannerTests)

    /// The meter line. Pure so the unknown-usage case is asserted
    /// (IOS-DD-TRIP-PLANNER-04): it used to read "5 of 5 left" when the
    /// count had simply failed.
    static func quotaText(tier: SubscriptionTier, used: Int, usageUnknown: Bool) -> String {
        switch tier {
        case .free:
            return "Insider feature — plan AI itineraries across Des Moines."
        case .vip:
            return "Unlimited itineraries this month."
        case .insider:
            if usageUnknown { return "Couldn't check this month's allowance." }
            let remaining = PremiumFeature.QuotaAction.tripPlans.remaining(used, for: tier) ?? 0
            return "\(remaining) of \(tier.maxTripPlansPerMonth) itineraries left this month."
        }
    }

    /// Upcoming (ends today or later, soonest first) and past (most recent
    /// first). `today` is "yyyy-MM-dd" in Central time.
    static func partition(_ trips: [TripPlan], today: String) -> (upcoming: [TripPlan], past: [TripPlan]) {
        let day = { (s: String) in String(s.prefix(10)) }
        let upcoming = trips.filter { day($0.endDate) >= today }
            .sorted { day($0.startDate) < day($1.startDate) }
        let past = trips.filter { day($0.endDate) < today }
            .sorted { day($0.startDate) > day($1.startDate) }
        return (upcoming, past)
    }

    /// A plan the server saved after the client gave up (timeout, dropped
    /// connection): the newest trip created after `startedAt`, or nil
    /// (IOS-DD-TRIP-PLANNER-15). `known` holds the ids already listed before
    /// the tap: the caller pads `startedAt` for clock skew, and without this a
    /// plan made seconds earlier would be reopened as if it were the new one.
    static func recoveredTrip(from trips: [TripPlan], startedAt: Date, excluding known: Set<String> = []) -> TripPlan? {
        trips
            .compactMap { trip -> (TripPlan, Date)? in
                guard !known.contains(trip.id),
                      let created = trip.createdAt.flatMap(parseTimestamp), created > startedAt else { return nil }
                return (trip, created)
            }
            .max { $0.1 < $1.1 }?
            .0
    }

    /// Postgres timestamptz as PostgREST sends it, with or without a
    /// fraction (which can run to six digits).
    static func parseTimestamp(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        let plain = ISO8601DateFormatter()
        if let date = plain.date(from: value) { return date }
        // Drop the fraction and try again.
        guard let dot = value.firstIndex(of: ".") else { return nil }
        var end = value.index(after: dot)
        while end < value.endIndex, value[end].isNumber { end = value.index(after: end) }
        return plain.date(from: String(value[..<dot]) + String(value[end...]))
    }

    /// End date kept within 14 days of the start and not before it.
    static func clampedEnd(_ end: Date, start: Date) -> Date {
        min(max(end, start), latestEnd(for: start))
    }

    static func latestEnd(for start: Date) -> Date {
        DesMoinesTime.calendar.date(byAdding: .day, value: 13, to: start) ?? start
    }

    // MARK: - Actions

    private func reload() async {
        isLoadingTrips = true
        await service.refreshAvailability()

        do {
            savedTrips = try await service.fetchTrips()
            tripsLoadFailed = false
        } catch {
            tripsLoadFailed = true
        }

        do {
            usedThisMonth = try await service.usageThisMonth()
            usageUnknown = false
        } catch {
            usageUnknown = true
        }
        isLoadingTrips = false
    }

    private func cycleGeneratingStatus() async {
        guard isGenerating else { return }
        generatingStep = 0
        UIAccessibility.post(notification: .announcement, argument: "Building your itinerary. This can take up to a minute.")
        guard !reduceMotion else { return }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled, isGenerating else { return }
            generatingStep += 1
        }
    }

    private func generate() async {
        errorMessage = nil
        guard !isPaused else { return }

        // Gate 1: feature access (free → paywall). Presented from here: the
        // soft paywall posted to the root presenter, which cannot present
        // over this sheet, so the tap did nothing (IOS-DD-MONETIZATION-13).
        guard storeKit.hasFeature(.tripPlanner) else {
            SoftPaywallService.shared.noteTripPlannerAttempt()
            paywallContext = .tripPlanner
            return
        }
        // Gate 2: monthly quota (exhausted → paywall to upgrade). Skipped
        // when the count could not be read: the server enforces it anyway.
        if !usageUnknown {
            guard quotaAction.isWithinLimit(usedThisMonth, for: tier) else {
                paywallContext = .tripPlanner
                return
            }
        }

        // Des Moines days (IOS-DD-TRIP-PLANNER-14).
        let startString = TripSchedule.ymd(startDate)
        let endString = TripSchedule.ymd(endDate)
        let prefs = TripPreferences(
            interests: selectedInterests.isEmpty ? nil : Array(selectedInterests).sorted(),
            budget: budget,
            pace: pace,
            groupSize: groupSize,
            hasChildren: hasChildren,
            mustSee: nil,
            neighborhood: neighborhood
        )

        let startedAt = Date()
        let knownTripIds = Set(savedTrips.map(\.id))
        isGenerating = true
        defer { isGenerating = false }
        do {
            let trip = try await service.generate(startDate: startString, endDate: endString, preferences: prefs)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            usedThisMonth += 1
            generatedTrip = trip
        } catch {
            await handleGenerateError(error, startedAt: startedAt, knownTripIds: knownTripIds)
        }
    }

    private func handleGenerateError(_ error: Error, startedAt: Date, knownTripIds: Set<String>) async {
        switch error as? TripPlannerService.TripPlannerError {
        case .needsUpgrade?:
            if tier == .free {
                paywallContext = .tripPlanner
            } else {
                errorMessage = "Your purchase is still syncing with our server. Try again in a minute."
            }
        case .monthlyQuota?:
            if tier == .insider { usedThisMonth = tier.maxTripPlansPerMonth }
            paywallContext = .tripPlanner
        case .generationFailed?, .server?:
            // The client can give up (timeout, dropped connection) after the
            // server saved and counted the plan. Look before blaming the dates.
            await reload()
            if let recovered = Self.recoveredTrip(
                from: savedTrips,
                startedAt: startedAt.addingTimeInterval(-30),
                excluding: knownTripIds
            ) {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                generatedTrip = recovered
                return
            }
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        default:
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    private func deleteTrips(_ trips: [TripPlan]) async {
        let ids = Set(trips.map(\.id))
        savedTrips.removeAll { ids.contains($0.id) }
        var anyFailed = false
        for trip in trips {
            if await service.deleteTrip(id: trip.id) == false { anyFailed = true }
        }
        if anyFailed {
            // A failed delete must not silently vanish from the list and then
            // reappear on next load — reconcile with server truth and tell the
            // user, next to the list rather than under Generate
            // (IOS-AUDIT-FEAT-023, IOS-DD-TRIP-PLANNER-16).
            await reload()
            toast = .error("Couldn't delete the itinerary.")
        }
    }
}

#Preview {
    TripPlannerView()
}
