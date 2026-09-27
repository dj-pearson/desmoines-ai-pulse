import SwiftUI

/// List-row restaurant card.
///
/// IOS-IA-003: now a thin wrapper over the unified `ContentCard` (`.listRow`
/// variant) so events, restaurants and attractions share one card layer.
struct RestaurantCardView: View {
    let restaurant: Restaurant
    @Binding var toast: ToastMessage?

    init(restaurant: Restaurant, toast: Binding<ToastMessage?> = .constant(nil)) {
        self.restaurant = restaurant
        self._toast = toast
    }

    var body: some View {
        ContentCard(cardData, variant: .listRow, toast: $toast)
    }

    /// The shared card data plus the distance when location is known
    /// (IOS-DD-RESTAURANTS-12). Detail showed it; the list did not.
    private var cardData: ContentCardData {
        var data = restaurant.cardData
        if let coordinate = restaurant.coordinate,
           let distance = LocationService.shared.formattedDistance(from: coordinate) {
            let area = (restaurant.city?.isEmpty == false ? restaurant.city : nil) ?? restaurant.displayLocation
            data.metaSecondary = CardMetaLine(icon: "location", text: area.isEmpty ? distance : "\(distance) - \(area)")
        }
        return data
    }
}

#Preview {
    RestaurantCardView(restaurant: .preview)
        .padding()
}
