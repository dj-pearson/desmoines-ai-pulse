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
        ContentCard(restaurant.cardData, variant: .listRow, toast: $toast)
    }
}

#Preview {
    RestaurantCardView(restaurant: .preview)
        .padding()
}
