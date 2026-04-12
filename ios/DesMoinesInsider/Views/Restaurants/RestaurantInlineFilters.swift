import SwiftUI

/// Always-visible horizontal row of filter pills. Each pill opens a focused
/// popover for just that one filter — no giant sheet, no hidden sections.
/// Mirrors the web app's RestaurantInlineFilters.
struct RestaurantInlineFilters: View {
    @Bindable var viewModel: RestaurantsViewModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                CuisinePill(viewModel: viewModel)
                PricePill(viewModel: viewModel)
                AreaPill(viewModel: viewModel)
                RatingPill(viewModel: viewModel)
                DietaryPill(viewModel: viewModel)
                MorePill(viewModel: viewModel)
            }
            .padding(.horizontal, 2)
            .padding(.vertical, 4)
        }
    }
}

// MARK: - Shared Pill Styling

private struct FilterPillLabel: View {
    let title: String
    let systemImage: String
    let isActive: Bool
    var badgeCount: Int = 0

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: systemImage).font(.caption2)
            Text(title).font(.subheadline.weight(.medium))
            if badgeCount > 0 {
                Text("\(badgeCount)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(minWidth: 16, minHeight: 16)
                    .padding(.horizontal, 3)
                    .background(Color.white.opacity(0.25), in: Capsule())
            }
            Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(isActive ? Color.accentColor : Color(.systemGray6))
        .foregroundStyle(isActive ? .white : .primary)
        .clipShape(Capsule())
    }
}

// MARK: - Cuisine Pill

private struct CuisinePill: View {
    @Bindable var viewModel: RestaurantsViewModel
    @State private var showPopover = false

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: "Cuisine",
                systemImage: "fork.knife",
                isActive: !viewModel.selectedCuisines.isEmpty,
                badgeCount: viewModel.selectedCuisines.count
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "Cuisine", hasSelection: !viewModel.selectedCuisines.isEmpty) {
                viewModel.selectedCuisines = []
            } content: {
                FlowChipGrid(items: viewModel.availableCuisines.prefix(40).map { $0 }) { item in
                    viewModel.selectedCuisines.contains(item)
                } onTap: { item in
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    if viewModel.selectedCuisines.contains(item) {
                        viewModel.selectedCuisines.remove(item)
                    } else {
                        viewModel.selectedCuisines.insert(item)
                    }
                    viewModel.activePreset = nil
                }
            }
            .presentationCompactAdaptation(.popover)
        }
    }
}

// MARK: - Price Pill

private struct PricePill: View {
    @Bindable var viewModel: RestaurantsViewModel
    @State private var showPopover = false

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: "Price",
                systemImage: "dollarsign.circle",
                isActive: !viewModel.selectedPriceRanges.isEmpty,
                badgeCount: viewModel.selectedPriceRanges.count
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "Price Range", hasSelection: !viewModel.selectedPriceRanges.isEmpty) {
                viewModel.selectedPriceRanges = []
            } content: {
                VStack(spacing: 8) {
                    ForEach(PriceRange.allCases) { range in
                        let selected = viewModel.selectedPriceRanges.contains(range.rawValue)
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            if selected {
                                viewModel.selectedPriceRanges.remove(range.rawValue)
                            } else {
                                viewModel.selectedPriceRanges.insert(range.rawValue)
                            }
                            viewModel.activePreset = nil
                        } label: {
                            HStack {
                                Text(range.rawValue)
                                    .font(.system(size: 18, weight: .bold))
                                Text(range.displayName)
                                    .font(.subheadline)
                                Spacer()
                                if selected {
                                    Image(systemName: "checkmark")
                                        .font(.caption.weight(.bold))
                                }
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(selected ? Color.accentColor : Color(.systemGray6))
                            .foregroundStyle(selected ? .white : .primary)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .presentationCompactAdaptation(.popover)
        }
    }
}

// MARK: - Area Pill

private struct AreaPill: View {
    @Bindable var viewModel: RestaurantsViewModel
    @State private var showPopover = false

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: "Area",
                systemImage: "mappin.and.ellipse",
                isActive: !viewModel.selectedLocations.isEmpty,
                badgeCount: viewModel.selectedLocations.count
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "Neighborhood", hasSelection: !viewModel.selectedLocations.isEmpty) {
                viewModel.selectedLocations = []
            } content: {
                FlowChipGrid(items: LocationArea.allCases.map { $0.rawValue }) { item in
                    viewModel.selectedLocations.contains(item)
                } onTap: { item in
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    if viewModel.selectedLocations.contains(item) {
                        viewModel.selectedLocations.remove(item)
                    } else {
                        viewModel.selectedLocations.insert(item)
                    }
                    viewModel.activePreset = nil
                }
            }
            .presentationCompactAdaptation(.popover)
        }
    }
}

// MARK: - Rating Pill

private struct RatingPill: View {
    @Bindable var viewModel: RestaurantsViewModel
    @State private var showPopover = false

    private var isActive: Bool { viewModel.minRating > 0 }

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: isActive ? "\(formatted(viewModel.minRating))★+" : "Rating",
                systemImage: "star.fill",
                isActive: isActive
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "Minimum Rating", hasSelection: isActive) {
                viewModel.minRating = 0
            } content: {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        ForEach([0.0, 3.0, 3.5, 4.0, 4.5], id: \.self) { r in
                            let selected = viewModel.minRating == r
                            Button {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                viewModel.minRating = r
                                viewModel.activePreset = nil
                            } label: {
                                HStack(spacing: 3) {
                                    Image(systemName: "star.fill").font(.system(size: 10))
                                    Text(r == 0 ? "Any" : "\(formatted(r))+")
                                        .font(.caption.weight(.semibold))
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(selected ? Color.accentColor : Color(.systemGray6))
                                .foregroundStyle(selected ? .white : .primary)
                                .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Slider(
                        value: $viewModel.minRating,
                        in: 0...5,
                        step: 0.5
                    )
                    HStack {
                        Text("Any").font(.caption2).foregroundStyle(.secondary)
                        Spacer()
                        Text("5★").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            .presentationCompactAdaptation(.popover)
        }
    }

    private func formatted(_ r: Double) -> String {
        r.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", r)
            : String(format: "%.1f", r)
    }
}

// MARK: - Dietary Pill

private struct DietaryPill: View {
    @Bindable var viewModel: RestaurantsViewModel
    @State private var showPopover = false

    private static let options: [(key: String, label: String, emoji: String)] = [
        ("vegan",        "Vegan",        "🌱"),
        ("vegetarian",   "Vegetarian",   "🥬"),
        ("gluten-free",  "Gluten-Free",  "🌾"),
        ("keto",         "Keto",         "🥑"),
        ("halal",        "Halal",        "🍖"),
    ]

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: "Dietary",
                systemImage: "leaf.fill",
                isActive: !viewModel.selectedDietary.isEmpty,
                badgeCount: viewModel.selectedDietary.count
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "Dietary Preferences", hasSelection: !viewModel.selectedDietary.isEmpty) {
                viewModel.selectedDietary = []
            } content: {
                VStack(spacing: 6) {
                    ForEach(Self.options, id: \.key) { opt in
                        let selected = viewModel.selectedDietary.contains(opt.key)
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            if selected {
                                viewModel.selectedDietary.remove(opt.key)
                            } else {
                                viewModel.selectedDietary.insert(opt.key)
                            }
                            viewModel.activePreset = nil
                        } label: {
                            HStack {
                                Text(opt.emoji)
                                Text(opt.label).font(.subheadline.weight(.medium))
                                Spacer()
                                if selected {
                                    Image(systemName: "checkmark")
                                        .font(.caption.weight(.bold))
                                }
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(selected ? Color.accentColor : Color(.systemGray6))
                            .foregroundStyle(selected ? .white : .primary)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .presentationCompactAdaptation(.popover)
        }
    }
}

// MARK: - More Pill (Open Now + Featured toggles)

private struct MorePill: View {
    @Bindable var viewModel: RestaurantsViewModel
    @State private var showPopover = false

    private var count: Int {
        (viewModel.showOpenNowOnly ? 1 : 0) + (viewModel.featuredOnly ? 1 : 0)
    }

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: "More",
                systemImage: "slider.horizontal.3",
                isActive: count > 0,
                badgeCount: count
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "More Options", hasSelection: count > 0) {
                viewModel.showOpenNowOnly = false
                viewModel.featuredOnly = false
            } content: {
                VStack(spacing: 10) {
                    Toggle(isOn: $viewModel.showOpenNowOnly) {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Open Now").font(.subheadline.weight(.medium))
                                Text("Currently serving").font(.caption2).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "clock.fill").foregroundStyle(.green)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))

                    Toggle(isOn: $viewModel.featuredOnly) {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Featured Only").font(.subheadline.weight(.medium))
                                Text("Editor's picks").font(.caption2).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "sparkles").foregroundStyle(.orange)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
                }
            }
            .presentationCompactAdaptation(.popover)
        }
    }
}

// MARK: - Popover Chrome

/// Consistent popover container with a title row and optional Clear button.
private struct PopoverList<Content: View>: View {
    let title: String
    let hasSelection: Bool
    let onClear: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title).font(.subheadline.weight(.semibold))
                Spacer()
                if hasSelection {
                    Button("Clear", action: onClear)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            content()
        }
        .padding(14)
        .frame(width: 280)
        .frame(maxHeight: 420)
    }
}

// MARK: - Flow Chip Grid

/// Simple multi-line wrapping chip grid used by Cuisine and Area popovers.
private struct FlowChipGrid: View {
    let items: [String]
    let isSelected: (String) -> Bool
    let onTap: (String) -> Void

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 6)], alignment: .leading, spacing: 6) {
                ForEach(items, id: \.self) { item in
                    let selected = isSelected(item)
                    Button {
                        onTap(item)
                    } label: {
                        HStack(spacing: 3) {
                            if selected {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 9, weight: .bold))
                            }
                            Text(item)
                                .font(.caption.weight(.medium))
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(selected ? Color.accentColor : Color(.systemGray6))
                        .foregroundStyle(selected ? .white : .primary)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

#Preview {
    RestaurantInlineFilters(viewModel: RestaurantsViewModel())
        .padding()
}
