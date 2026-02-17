import SwiftUI
import MapKit

/// Map view showing nearby events, restaurants, and attractions with color-coded pins
/// and search functionality.
struct EventMapView: View {
    @State private var viewModel = MapViewModel()
    @State private var navigationPath = NavigationPath()
    @State private var isSearchFocused = false

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack {
                // Map layer
                mapContent

                // Overlays
                VStack(spacing: 0) {
                    // Search bar
                    searchBar
                        .padding(.horizontal)
                        .padding(.top, 8)

                    Spacer()

                    // Error / empty state overlay
                    if let error = viewModel.errorMessage, viewModel.isEmpty {
                        errorOverlay(message: error)
                    }

                    Spacer()

                    // Loading indicator
                    if viewModel.isLoading {
                        loadingOverlay
                    }

                    // Pin count badge
                    if viewModel.totalPinCount > 0 {
                        pinCountBadge
                            .padding(.bottom, 4)
                    }
                }

                // Toggle controls (top-right, below search)
                VStack {
                    Spacer().frame(height: 60)
                    HStack {
                        Spacer()
                        toggleControls
                    }
                    Spacer()
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let event = viewModel.selectedEvent {
                    eventPopup(event)
                } else if let restaurant = viewModel.selectedRestaurant {
                    restaurantPopup(restaurant)
                } else if let attraction = viewModel.selectedAttraction {
                    attractionPopup(attraction)
                }
            }
            .navigationTitle("Explore")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Event.self) { event in
                EventDetailView(event: event)
            }
            .task {
                await viewModel.loadNearbyContent()
            }
        }
    }

    // MARK: - Map Content

    private var mapContent: some View {
        Map(position: $viewModel.cameraPosition) {
            // User location
            UserAnnotation()

            // Event markers
            ForEach(viewModel.eventAnnotations) { annotation in
                Annotation(annotation.event.title, coordinate: annotation.coordinate) {
                    Button {
                        viewModel.clearSelection()
                        viewModel.selectedEvent = annotation.event
                    } label: {
                        EventMapPin(
                            category: annotation.event.eventCategory,
                            isSelected: viewModel.selectedEvent?.id == annotation.event.id
                        )
                    }
                }
            }

            // Restaurant markers
            ForEach(viewModel.restaurantAnnotations) { annotation in
                Annotation(annotation.restaurant.name, coordinate: annotation.coordinate) {
                    Button {
                        viewModel.clearSelection()
                        viewModel.selectedRestaurant = annotation.restaurant
                    } label: {
                        RestaurantMapPin(
                            isSelected: viewModel.selectedRestaurant?.id == annotation.restaurant.id
                        )
                    }
                }
            }

            // Attraction markers
            ForEach(viewModel.attractionAnnotations) { annotation in
                Annotation(annotation.attraction.name, coordinate: annotation.coordinate) {
                    Button {
                        viewModel.clearSelection()
                        viewModel.selectedAttraction = annotation.attraction
                    } label: {
                        AttractionMapPin(
                            type: annotation.attraction.attractionType,
                            isSelected: viewModel.selectedAttraction?.id == annotation.attraction.id
                        )
                    }
                }
            }
        }
        .mapStyle(.standard(elevation: .realistic))
        .mapControls {
            MapUserLocationButton()
            MapCompass()
            MapScaleView()
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)

                TextField("Search events, dining, attractions...", text: $viewModel.searchText)
                    .textFieldStyle(.plain)
                    .font(.subheadline)
                    .submitLabel(.search)
                    .onSubmit {
                        Task { await viewModel.search() }
                    }

                if !viewModel.searchText.isEmpty {
                    Button {
                        viewModel.searchText = ""
                        Task { await viewModel.search() }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
        }
    }

    // MARK: - Toggle Controls

    private var toggleControls: some View {
        VStack(spacing: 6) {
            Toggle(isOn: $viewModel.showEvents) {
                Label("Events", systemImage: "calendar")
            }
            .toggleStyle(.button)
            .tint(viewModel.showEvents ? .blue : .gray)

            Toggle(isOn: $viewModel.showRestaurants) {
                Label("Dining", systemImage: "fork.knife")
            }
            .toggleStyle(.button)
            .tint(viewModel.showRestaurants ? .orange : .gray)

            Toggle(isOn: $viewModel.showAttractions) {
                Label("Places", systemImage: "mappin.and.ellipse")
            }
            .toggleStyle(.button)
            .tint(viewModel.showAttractions ? .green : .gray)
        }
        .font(.caption)
        .padding(8)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.trailing)
    }

    // MARK: - Error Overlay

    private func errorOverlay(message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "map.fill")
                .font(.largeTitle)
                .foregroundStyle(.secondary)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button {
                Task { await viewModel.retry() }
            } label: {
                Label("Try Again", systemImage: "arrow.clockwise")
                    .font(.subheadline.weight(.medium))
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
        .padding(20)
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 16))
        .shadow(radius: 8)
        .padding(.horizontal, 40)
    }

    // MARK: - Pin Count Badge

    private var pinCountBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: "mappin.circle.fill")
                .font(.caption)
            Text("\(viewModel.totalPinCount) places")
                .font(.caption2.weight(.medium))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial, in: Capsule())
    }

    // MARK: - Event Popup

    private func eventPopup(_ event: Event) -> some View {
        HStack(spacing: 12) {
            CachedAsyncImage(url: event.imageUrl) {
                ZStack {
                    Rectangle().fill(event.eventCategory.color.opacity(0.15))
                    Image(systemName: event.eventCategory.icon)
                        .foregroundStyle(event.eventCategory.color.opacity(0.5))
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                Text(event.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                if let date = event.parsedDate {
                    Text(date.formatted(.dateTime.month(.abbreviated).day().hour().minute()))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text(event.displayLocation)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                navigationPath.append(event)
            } label: {
                Image(systemName: "chevron.right.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Color.accentColor)
            }

            Button {
                viewModel.selectedEvent = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 16))
        .shadow(radius: 8)
        .padding()
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Restaurant Popup

    private func restaurantPopup(_ restaurant: Restaurant) -> some View {
        HStack(spacing: 12) {
            CachedAsyncImage(url: restaurant.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.orange.opacity(0.1))
                    Image(systemName: "fork.knife")
                        .foregroundStyle(.orange.opacity(0.4))
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                Text(restaurant.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                HStack(spacing: 6) {
                    if let cuisine = restaurant.cuisine {
                        Text(cuisine)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let rating = restaurant.rating {
                        HStack(spacing: 2) {
                            Image(systemName: "star.fill")
                                .font(.system(size: 9))
                                .foregroundStyle(.yellow)
                            Text(String(format: "%.1f", rating))
                                .font(.caption2)
                        }
                    }
                }

                Text(restaurant.displayLocation)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }

            Spacer()

            if let url = restaurant.callURL {
                Link(destination: url) {
                    Image(systemName: "phone.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.green)
                }
            }

            Button {
                viewModel.selectedRestaurant = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 16))
        .shadow(radius: 8)
        .padding()
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Attraction Popup

    private func attractionPopup(_ attraction: Attraction) -> some View {
        HStack(spacing: 12) {
            CachedAsyncImage(url: attraction.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.green.opacity(0.1))
                    Image(systemName: attraction.attractionType.icon)
                        .foregroundStyle(.green.opacity(0.4))
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                Text(attraction.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                Text(attraction.attractionType.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let rating = attraction.rating {
                    HStack(spacing: 2) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.caption2)
                    }
                }
            }

            Spacer()

            if let url = attraction.websiteURL {
                Link(destination: url) {
                    Image(systemName: "safari")
                        .font(.title2)
                        .foregroundStyle(Color.accentColor)
                }
            }

            Button {
                viewModel.selectedAttraction = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 16))
        .shadow(radius: 8)
        .padding()
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Loading

    private var loadingOverlay: some View {
        HStack(spacing: 8) {
            ProgressView()
            Text("Finding nearby places...")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
        .padding(.bottom, 8)
    }
}

// MARK: - Custom Map Pins

private struct EventMapPin: View {
    let category: EventCategory
    var isSelected: Bool = false

    var body: some View {
        ZStack {
            Circle()
                .fill(category.color)
                .frame(width: isSelected ? 40 : 32, height: isSelected ? 40 : 32)
                .shadow(color: category.color.opacity(0.4), radius: isSelected ? 6 : 3)

            Image(systemName: category.icon)
                .font(.system(size: isSelected ? 16 : 12, weight: .semibold))
                .foregroundStyle(.white)
        }
        .animation(.spring(response: 0.3), value: isSelected)
    }
}

private struct RestaurantMapPin: View {
    var isSelected: Bool = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.orange)
                .frame(width: isSelected ? 38 : 30, height: isSelected ? 38 : 30)
                .shadow(color: .orange.opacity(0.4), radius: isSelected ? 6 : 3)

            Image(systemName: "fork.knife")
                .font(.system(size: isSelected ? 14 : 11, weight: .semibold))
                .foregroundStyle(.white)
        }
        .animation(.spring(response: 0.3), value: isSelected)
    }
}

private struct AttractionMapPin: View {
    let type: AttractionType
    var isSelected: Bool = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.green)
                .frame(width: isSelected ? 38 : 30, height: isSelected ? 38 : 30)
                .shadow(color: .green.opacity(0.4), radius: isSelected ? 6 : 3)

            Image(systemName: type.icon)
                .font(.system(size: isSelected ? 14 : 11, weight: .semibold))
                .foregroundStyle(.white)
        }
        .animation(.spring(response: 0.3), value: isSelected)
    }
}

#Preview {
    EventMapView()
}
