import SwiftUI

/// Always-visible horizontal row of event filter pills. Mirrors the Dining
/// tab's inline filter UX — each pill opens a focused popover for its one
/// filter, no giant bottom sheet.
struct EventInlineFilters: View {
    @Bindable var viewModel: EventsViewModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                CategoryPill(viewModel: viewModel)
                WhenPill(viewModel: viewModel)
                PricePill(viewModel: viewModel)
                AreaPill(viewModel: viewModel)
                MorePill(viewModel: viewModel)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
    }
}

// MARK: - Shared Pill Label

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

// MARK: - Category Pill

private struct CategoryPill: View {
    @Bindable var viewModel: EventsViewModel
    @State private var showPopover = false

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: viewModel.selectedCategory?.displayName ?? "Category",
                systemImage: viewModel.selectedCategory?.icon ?? "tag",
                isActive: viewModel.selectedCategory != nil
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "Category", hasSelection: viewModel.selectedCategory != nil) {
                viewModel.selectedCategory = nil
                viewModel.activePreset = nil
            } content: {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 6)], alignment: .leading, spacing: 6) {
                    ForEach(EventCategory.allCases) { cat in
                        let selected = viewModel.selectedCategory == cat
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            viewModel.selectedCategory = selected ? nil : cat
                            viewModel.activePreset = nil
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: cat.icon).font(.caption2)
                                Text(cat.displayName)
                                    .font(.caption.weight(.medium))
                                    .lineLimit(1)
                                Spacer(minLength: 0)
                                if selected {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 9, weight: .bold))
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(selected ? cat.color : Color(.systemGray6))
                            .foregroundStyle(selected ? .white : .primary)
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .presentationCompactAdaptation(.popover)
        }
    }
}

// MARK: - When Pill (Date Preset)

private struct WhenPill: View {
    @Bindable var viewModel: EventsViewModel
    @State private var showPopover = false

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: viewModel.selectedDatePreset?.rawValue ?? "When",
                systemImage: "calendar",
                isActive: viewModel.selectedDatePreset != nil
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "When", hasSelection: viewModel.selectedDatePreset != nil) {
                viewModel.selectedDatePreset = nil
                viewModel.activePreset = nil
            } content: {
                VStack(spacing: 6) {
                    ForEach(DateFilterPreset.allCases) { preset in
                        let selected = viewModel.selectedDatePreset == preset
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            viewModel.selectedDatePreset = selected ? nil : preset
                            viewModel.activePreset = nil
                        } label: {
                            HStack {
                                Text(preset.rawValue)
                                    .font(.subheadline.weight(.medium))
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

// MARK: - Price Pill (Free Only)

private struct PricePill: View {
    @Bindable var viewModel: EventsViewModel
    @State private var showPopover = false

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: viewModel.showFreeOnly ? "Free" : "Price",
                systemImage: "dollarsign.circle",
                isActive: viewModel.showFreeOnly
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "Price", hasSelection: viewModel.showFreeOnly) {
                viewModel.showFreeOnly = false
            } content: {
                VStack(spacing: 8) {
                    priceRow(title: "Any price", selected: !viewModel.showFreeOnly) {
                        viewModel.showFreeOnly = false
                        viewModel.activePreset = nil
                    }
                    priceRow(title: "Free only", selected: viewModel.showFreeOnly) {
                        viewModel.showFreeOnly = true
                        viewModel.activePreset = nil
                    }
                }
            }
            .presentationCompactAdaptation(.popover)
        }
    }

    private func priceRow(title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            HStack {
                Text(title).font(.subheadline.weight(.medium))
                Spacer()
                if selected {
                    Image(systemName: "checkmark").font(.caption.weight(.bold))
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

// MARK: - Area Pill

private struct AreaPill: View {
    @Bindable var viewModel: EventsViewModel
    @State private var showPopover = false

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: "Area",
                systemImage: "mappin.and.ellipse",
                isActive: !viewModel.selectedCities.isEmpty,
                badgeCount: viewModel.selectedCities.count
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "Neighborhood", hasSelection: !viewModel.selectedCities.isEmpty) {
                viewModel.selectedCities = []
            } content: {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 6)], alignment: .leading, spacing: 6) {
                    ForEach(LocationArea.allCases) { area in
                        let selected = viewModel.selectedCities.contains(area.rawValue)
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            if selected {
                                viewModel.selectedCities.remove(area.rawValue)
                            } else {
                                viewModel.selectedCities.insert(area.rawValue)
                            }
                            viewModel.activePreset = nil
                        } label: {
                            HStack(spacing: 4) {
                                if selected {
                                    Image(systemName: "checkmark").font(.system(size: 9, weight: .bold))
                                }
                                Text(area.displayName)
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
            .presentationCompactAdaptation(.popover)
        }
    }
}

// MARK: - More Pill (Featured toggle)

private struct MorePill: View {
    @Bindable var viewModel: EventsViewModel
    @State private var showPopover = false

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showPopover = true
        } label: {
            FilterPillLabel(
                title: "More",
                systemImage: "slider.horizontal.3",
                isActive: viewModel.showFeaturedOnly,
                badgeCount: viewModel.showFeaturedOnly ? 1 : 0
            )
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            PopoverList(title: "More Options", hasSelection: viewModel.showFeaturedOnly) {
                viewModel.showFeaturedOnly = false
            } content: {
                Toggle(isOn: $viewModel.showFeaturedOnly) {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Featured Only").font(.subheadline.weight(.medium))
                            Text("Editor's picks").font(.caption2).foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "star.fill").foregroundStyle(.orange)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
            }
            .presentationCompactAdaptation(.popover)
        }
    }
}

// MARK: - Popover Chrome

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
            ScrollView { content() }
        }
        .padding(14)
        .frame(width: 300)
        .frame(maxHeight: 420)
    }
}

#Preview {
    EventInlineFilters(viewModel: EventsViewModel())
}
