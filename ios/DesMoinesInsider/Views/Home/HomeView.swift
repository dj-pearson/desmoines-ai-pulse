import SwiftUI

/// Main home/feed view with featured events, date presets, category filters, and event list.
struct HomeView: View {
    @State private var viewModel = EventsViewModel()
    @State private var showFilters = false
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ScrollView {
                VStack(spacing: 0) {
                    headerSection
                    datePresetsSection
                    categoryChipsSection

                    if !viewModel.featuredEvents.isEmpty {
                        featuredSection
                    }

                    activeFiltersBar
                    eventsList
                }
            }
            .refreshable {
                await viewModel.refresh()
            }
            .navigationTitle("Des Moines Insider")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    filterButton
                }
            }
            .sheet(isPresented: $showFilters) {
                FilterSheet(
                    selectedCategory: $viewModel.selectedCategory,
                    selectedDatePreset: $viewModel.selectedDatePreset,
                    showFeaturedOnly: $viewModel.showFeaturedOnly,
                    onClear: { viewModel.clearFilters() }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .navigationDestination(for: Event.self) { event in
                EventDetailView(event: event)
            }
            .task {
                await viewModel.loadInitialData()
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("What's happening in Des Moines")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if viewModel.totalCount > 0 {
                Text("\(viewModel.totalCount) upcoming events")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .padding(.top, 4)
    }

    // MARK: - Date Presets

    private var datePresetsSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(DateFilterPreset.allCases) { preset in
                    Button {
                        withAnimation(.snappy) {
                            if viewModel.selectedDatePreset == preset {
                                viewModel.selectedDatePreset = nil
                            } else {
                                viewModel.selectedDatePreset = preset
                            }
                        }
                    } label: {
                        Text(preset.rawValue)
                            .font(.subheadline.weight(.medium))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                viewModel.selectedDatePreset == preset
                                    ? Color.accentColor
                                    : Color(.systemGray6)
                            )
                            .foregroundStyle(
                                viewModel.selectedDatePreset == preset
                                    ? .white
                                    : .primary
                            )
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
    }

    // MARK: - Category Chips

    private var categoryChipsSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(EventCategory.allCases.prefix(8)) { category in
                    Button {
                        withAnimation(.snappy) {
                            if viewModel.selectedCategory == category {
                                viewModel.selectedCategory = nil
                            } else {
                                viewModel.selectedCategory = category
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: category.icon)
                                .font(.caption)
                            Text(category.displayName)
                                .font(.caption.weight(.medium))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(
                            viewModel.selectedCategory == category
                                ? category.color.opacity(0.2)
                                : Color(.systemGray6)
                        )
                        .foregroundStyle(
                            viewModel.selectedCategory == category
                                ? category.color
                                : .secondary
                        )
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .stroke(
                                    viewModel.selectedCategory == category
                                        ? category.color.opacity(0.3)
                                        : Color.clear,
                                    lineWidth: 1
                                )
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Featured Section

    private var featuredSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Featured", systemImage: "star.fill")
                    .font(.headline)
                    .foregroundStyle(.orange)
                Spacer()
            }
            .padding(.horizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(viewModel.featuredEvents) { event in
                        Button {
                            navigationPath.append(event)
                        } label: {
                            FeaturedEventCard(event: event)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Active Filters Bar

    @ViewBuilder
    private var activeFiltersBar: some View {
        if viewModel.activeFilterCount > 0 {
            HStack {
                Text("\(viewModel.activeFilterCount) filter\(viewModel.activeFilterCount > 1 ? "s" : "") active")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Clear All") {
                    withAnimation { viewModel.clearFilters() }
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.accent)
            }
            .padding(.horizontal)
            .padding(.vertical, 6)
        }
    }

    // MARK: - Events List

    private var eventsList: some View {
        Group {
            if viewModel.isLoading {
                ForEach(0..<6, id: \.self) { _ in
                    EventCardSkeleton()
                        .padding(.horizontal)
                        .padding(.vertical, 4)
                }
            } else if viewModel.events.isEmpty {
                EmptyStateView(
                    icon: "calendar.badge.exclamationmark",
                    title: "No Events Found",
                    message: "Try adjusting your filters or check back later.",
                    actionTitle: viewModel.activeFilterCount > 0 ? "Clear Filters" : nil,
                    action: { viewModel.clearFilters() }
                )
                .padding(.top, 40)
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(viewModel.events) { event in
                        Button {
                            navigationPath.append(event)
                        } label: {
                            EventCardView(event: event)
                        }
                        .buttonStyle(.plain)
                        .task {
                            await viewModel.loadMoreIfNeeded(currentItem: event)
                        }
                    }

                    if viewModel.isLoadingMore {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.bottom, 20)
    }

    // MARK: - Filter Button

    private var filterButton: some View {
        Button {
            showFilters = true
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .font(.title3)

                if viewModel.activeFilterCount > 0 {
                    Text("\(viewModel.activeFilterCount)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 16, height: 16)
                        .background(Color.red, in: Circle())
                        .offset(x: 4, y: -4)
                }
            }
        }
    }
}

// MARK: - Featured Event Card

private struct FeaturedEventCard: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Image
            ZStack(alignment: .bottomLeading) {
                CachedAsyncImage(url: event.imageUrl) {
                    Rectangle()
                        .fill(event.eventCategory.color.gradient)
                }
                .frame(width: 260, height: 150)
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Category badge
                CategoryBadge(category: event.eventCategory)
                    .padding(8)
            }

            // Title
            Text(event.title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            // Date & Location
            HStack(spacing: 4) {
                if let date = event.parsedDate {
                    Image(systemName: "calendar")
                        .font(.caption2)
                    Text(date.formatted(.dateTime.month(.abbreviated).day()))
                        .font(.caption)
                }

                Spacer()

                if event.isFree {
                    Text("FREE")
                        .font(.caption2.bold())
                        .foregroundStyle(.green)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.green.opacity(0.15), in: Capsule())
                }
            }
            .foregroundStyle(.secondary)
        }
        .frame(width: 260)
    }
}

// MARK: - Skeleton

private struct EventCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray5))
                .frame(height: 160)

            RoundedRectangle(cornerRadius: 4)
                .fill(Color(.systemGray5))
                .frame(height: 18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, 40)

            RoundedRectangle(cornerRadius: 4)
                .fill(Color(.systemGray6))
                .frame(height: 14)
                .frame(maxWidth: 200, alignment: .leading)
        }
        .redacted(reason: .placeholder)
        .shimmer()
    }
}

#Preview {
    HomeView()
}
