import SwiftUI

/// IOS-PARITY-001 · Native AI Trip Planner.
///
/// Input form (dates, interests, party, budget, pace, neighborhood) → calls the
/// same `generate-itinerary` backend the web uses → renders a saved, day-by-day
/// itinerary. Tier-quota gated (Insider 5/mo, VIP unlimited) with a quota meter
/// and contextual paywall (IOS-SUB-011). Reachable from the Discover hub and a
/// Home entry point.
struct TripPlannerView: View {
    /// Discover pushes this into its own stack (false); the Home sheet / iPad
    /// detail own one (true).
    var ownsNavigationStack: Bool = true
    /// Shows a "Close" toolbar button — only when presented modally (Home sheet),
    /// not when it's a pushed/detail destination.
    var showsCloseButton: Bool = false

    @State private var storeKit = StoreKitService.shared
    @State private var service = TripPlannerService.shared

    // Form state
    @State private var startDate = Date()
    @State private var endDate = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var selectedInterests: Set<String> = []
    @State private var groupSize = 2
    @State private var hasChildren = false
    @State private var budget = "moderate"
    @State private var pace = "moderate"
    @State private var neighborhood: String?

    // Data + UI state
    @State private var savedTrips: [TripPlan] = []
    @State private var usedThisMonth = 0
    @State private var isGenerating = false
    @State private var isLoadingTrips = true
    @State private var errorMessage: String?
    @State private var generatedTrip: TripPlan?
    @State private var paywallContext: PaywallContext?

    @Environment(\.dismiss) private var dismiss

    private var tier: SubscriptionTier { storeKit.currentTier }
    private let quotaAction = PremiumFeature.QuotaAction.tripPlans

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content.navigationTitle("Trip Planner") }
        } else {
            content.navigationTitle("Trip Planner")
        }
    }

    private var content: some View {
        Form {
            quotaSection
            datesSection
            interestsSection
            partySection
            preferencesSection
            generateSection
            savedSection
        }
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
        .sheet(item: $paywallContext) { ctx in
            PaywallView(context: ctx)
        }
        .task { await reload() }
    }

    // MARK: - Sections

    @ViewBuilder
    private var quotaSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.title3)
                    .foregroundStyle(Color.accentColor.gradient)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("AI Trip Planner")
                        .font(.subheadline.weight(.semibold))
                    Text(quotaText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("AI Trip Planner. \(quotaText)")
        }
    }

    private var datesSection: some View {
        Section("When") {
            DatePicker("Start", selection: $startDate, displayedComponents: .date)
                .onChange(of: startDate) { _, newValue in
                    if endDate < newValue { endDate = newValue }
                }
            DatePicker("End", selection: $endDate, in: startDate..., displayedComponents: .date)
        }
    }

    private var interestsSection: some View {
        Section("Interests") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
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

    private var generateSection: some View {
        Section {
            Button {
                Task { await generate() }
            } label: {
                HStack {
                    Spacer()
                    if isGenerating {
                        ProgressView().tint(.white)
                        Text("Building your itinerary…")
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

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .accessibilityLabel("Error: \(errorMessage)")
            }
        }
    }

    @ViewBuilder
    private var savedSection: some View {
        Section("Saved itineraries") {
            if isLoadingTrips {
                HStack { ProgressView().controlSize(.small); Text("Loading…").foregroundStyle(.secondary) }
            } else if savedTrips.isEmpty {
                Text("Your generated itineraries will appear here.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(savedTrips) { trip in
                    NavigationLink(value: trip) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(trip.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                            Text(trip.dateRangeDisplay).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { offsets in
                    Task { await deleteTrips(at: offsets) }
                }
            }
        }
    }

    // MARK: - Pieces

    private func chip(label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.caption.weight(.medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(isOn ? Color.accentColor.opacity(0.15) : Color(.systemGray6))
                .foregroundStyle(isOn ? Color.accentColor : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isOn ? [.isSelected] : [])
    }

    private var quotaText: String {
        switch tier {
        case .free:
            return "Insider feature — plan AI itineraries across Des Moines."
        case .vip:
            return "Unlimited itineraries this month."
        case .insider:
            let remaining = quotaAction.remaining(usedThisMonth, for: tier) ?? 0
            return "\(remaining) of \(tier.maxTripPlansPerMonth) itineraries left this month."
        }
    }

    // MARK: - Actions

    private func reload() async {
        isLoadingTrips = true
        async let trips = service.fetchTrips()
        async let used = service.tripsThisMonth()
        savedTrips = await trips
        usedThisMonth = await used
        isLoadingTrips = false
    }

    private func generate() async {
        errorMessage = nil

        // Gate 1: feature access (free → paywall).
        guard storeKit.hasFeature(.tripPlanner) else {
            paywallContext = .tripPlanner
            return
        }
        // Gate 2: monthly quota (exhausted → paywall to upgrade).
        guard quotaAction.isWithinLimit(usedThisMonth, for: tier) else {
            paywallContext = .tripPlanner
            return
        }

        let fmt = DateFormatter()
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "yyyy-MM-dd"

        let prefs = TripPreferences(
            interests: selectedInterests.isEmpty ? nil : Array(selectedInterests),
            budget: budget,
            pace: pace,
            groupSize: groupSize,
            hasChildren: hasChildren,
            mustSee: neighborhood.map { ["Focus the plan around the \($0) area"] }
        )

        isGenerating = true
        do {
            let trip = try await service.generate(
                startDate: fmt.string(from: startDate),
                endDate: fmt.string(from: endDate),
                preferences: prefs
            )
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            generatedTrip = trip
        } catch {
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
        isGenerating = false
    }

    private func deleteTrips(at offsets: IndexSet) async {
        let toDelete = offsets.map { savedTrips[$0] }
        savedTrips.remove(atOffsets: offsets)
        var anyFailed = false
        for trip in toDelete {
            if await service.deleteTrip(id: trip.id) == false { anyFailed = true }
        }
        if anyFailed {
            // A failed delete must not silently vanish from the list and then
            // reappear on next load — reconcile with server truth and tell the
            // user (IOS-AUDIT-FEAT-023).
            await reload()
            errorMessage = "Couldn't delete the itinerary. Please try again."
        }
    }
}

#Preview {
    TripPlannerView()
}
