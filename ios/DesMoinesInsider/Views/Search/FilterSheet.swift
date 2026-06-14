import SwiftUI

/// Filter sheet for events on the home screen.
/// Includes basic filters for all users and advanced filters (distance, price, rating) for Insider+ subscribers.
struct FilterSheet: View {
    @Binding var selectedCategory: EventCategory?
    @Binding var selectedDatePreset: DateFilterPreset?
    @Binding var showFeaturedOnly: Bool
    @Binding var showFreeOnly: Bool
    @Binding var maxDistance: Double?
    @Binding var minRating: Double?
    var onClear: () -> Void

    @State private var storeKit = StoreKitService.shared
    @Environment(\.dismiss) private var dismiss

    private var hasPremiumAccess: Bool {
        storeKit.hasFeature(.advancedFilters)
    }

    var body: some View {
        NavigationStack {
            List {
                // Category
                Section("Category") {
                    ForEach(EventCategory.allCases) { category in
                        Button {
                            selectedCategory = selectedCategory == category ? nil : category
                        } label: {
                            HStack {
                                Image(systemName: category.icon)
                                    .foregroundStyle(category.color)
                                    .frame(width: 24)
                                Text(category.displayName)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if selectedCategory == category {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Color.accentColor)
                                        .fontWeight(.semibold)
                                }
                            }
                        }
                        .accessibilityAddTraits(selectedCategory == category ? .isSelected : [])
                    }
                }

                // Date
                Section("When") {
                    ForEach(DateFilterPreset.allCases) { preset in
                        Button {
                            selectedDatePreset = selectedDatePreset == preset ? nil : preset
                        } label: {
                            HStack {
                                Text(preset.rawValue)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if selectedDatePreset == preset {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Color.accentColor)
                                        .fontWeight(.semibold)
                                }
                            }
                        }
                        .accessibilityAddTraits(selectedDatePreset == preset ? .isSelected : [])
                    }
                }

                // Options
                Section("Options") {
                    Toggle("Featured Events Only", isOn: $showFeaturedOnly)
                }

                // Advanced Filters — Insider+ only
                if hasPremiumAccess {
                    advancedFiltersSection
                } else {
                    Section {
                        PremiumGate(
                            requiredTier: .insider,
                            feature: "Distance radius, free events filter, and minimum rating",
                            context: .advancedFilters
                        ) {
                            advancedFiltersSection
                        }
                    } header: {
                        HStack(spacing: 6) {
                            Text("Advanced Filters")
                            PremiumBadge()
                        }
                    }
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Clear") {
                        onClear()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }

    // MARK: - Advanced Filters (Premium)

    @ViewBuilder
    private var advancedFiltersSection: some View {
        Section("Advanced Filters") {
            // Free events only
            Toggle(isOn: $showFreeOnly) {
                Label("Free Events Only", systemImage: "ticket")
            }

            // Distance radius
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Max Distance", systemImage: "location.circle")
                    Spacer()
                    if let distance = maxDistance {
                        Text("\(Int(distance)) mi")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Color.accentColor)
                    } else {
                        Text("Any")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                Slider(
                    value: Binding(
                        get: { maxDistance ?? 50 },
                        set: { maxDistance = $0 }
                    ),
                    in: 1...50,
                    step: 1
                )
                .tint(Color.accentColor)
                .accessibilityLabel("Maximum distance")
                .accessibilityValue(maxDistance.map { "\(Int($0)) miles" } ?? "Any")

                HStack {
                    Text("1 mi")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Spacer()
                    Button {
                        maxDistance = nil
                    } label: {
                        Text("Clear")
                            .font(.caption2)
                            .foregroundStyle(Color.accentColor)
                    }
                    Spacer()
                    Text("50 mi")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            // Minimum rating
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Min Rating", systemImage: "star.fill")
                    Spacer()
                    if let rating = minRating {
                        HStack(spacing: 2) {
                            Image(systemName: "star.fill")
                                .font(.caption2)
                                .foregroundStyle(.yellow)
                            Text(String(format: "%.1f", rating))
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(Color.accentColor)
                        }
                    } else {
                        Text("Any")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                Slider(
                    value: Binding(
                        get: { minRating ?? 1.0 },
                        set: { minRating = $0 }
                    ),
                    in: 1.0...5.0,
                    step: 0.5
                )
                .tint(.yellow)
                .accessibilityLabel("Minimum rating")
                .accessibilityValue(minRating.map { String(format: "%.1f stars", $0) } ?? "Any")

                HStack {
                    Text("1.0")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Spacer()
                    Button {
                        minRating = nil
                    } label: {
                        Text("Clear")
                            .font(.caption2)
                            .foregroundStyle(Color.accentColor)
                    }
                    Spacer()
                    Text("5.0")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }
}

#Preview {
    FilterSheet(
        selectedCategory: .constant(.music),
        selectedDatePreset: .constant(.today),
        showFeaturedOnly: .constant(false),
        showFreeOnly: .constant(false),
        maxDistance: .constant(nil),
        minRating: .constant(nil),
        onClear: {}
    )
}
