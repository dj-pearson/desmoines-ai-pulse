import SwiftUI
import MapKit

/// Map view showing nearby events and restaurants with color-coded pins.
struct EventMapView: View {
    @State private var viewModel = MapViewModel()
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ZStack(alignment: .topTrailing) {
                Map(position: $viewModel.cameraPosition) {
                    // User location
                    UserAnnotation()

                    // Event markers
                    ForEach(viewModel.eventAnnotations) { annotation in
                        Annotation(annotation.event.title, coordinate: annotation.coordinate) {
                            Button {
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
                                viewModel.selectedRestaurant = annotation.restaurant
                            } label: {
                                RestaurantMapPin(
                                    isSelected: viewModel.selectedRestaurant?.id == annotation.restaurant.id
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

                // Toggle controls
                toggleControls

                // Loading overlay
                if viewModel.isLoading {
                    loadingOverlay
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let event = viewModel.selectedEvent {
                    eventPopup(event)
                } else if let restaurant = viewModel.selectedRestaurant {
                    restaurantPopup(restaurant)
                }
            }
            .navigationTitle("Nearby")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Event.self) { event in
                EventDetailView(event: event)
            }
            .task {
                await viewModel.loadNearbyContent()
            }
        }
    }

    // MARK: - Toggle Controls

    private var toggleControls: some View {
        VStack(spacing: 8) {
            Toggle(isOn: $viewModel.showEvents) {
                Label("Events", systemImage: "calendar")
            }
            .toggleStyle(.button)
            .tint(viewModel.showEvents ? .blue : .gray)

            Toggle(isOn: $viewModel.showRestaurants) {
                Label("Food", systemImage: "fork.knife")
            }
            .toggleStyle(.button)
            .tint(viewModel.showRestaurants ? .orange : .gray)
        }
        .font(.caption)
        .padding(8)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding()
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

    // MARK: - Loading

    private var loadingOverlay: some View {
        VStack {
            Spacer()
            HStack(spacing: 8) {
                ProgressView()
                Text("Finding nearby places...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
            .padding(.bottom, 80)
        }
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

#Preview {
    EventMapView()
}
