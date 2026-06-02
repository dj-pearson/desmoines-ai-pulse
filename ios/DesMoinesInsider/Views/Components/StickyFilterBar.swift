import SwiftUI

// MARK: - IOS-IA-004 · Sticky filter bar
//
// A consistent container for the filter pills + active-filter chips that
// list screens (Events/Home, Dining, Attractions) pin under the navigation
// title via `.safeAreaInset(edge: .top)`. Gives a system-bar material so the
// scrolling list reads cleanly underneath, plus a hairline divider.
//
// Pair with `.searchable(...)` for the sticky search field — together they
// form the "sticky search/filter bar pinned under the nav title on scroll".
struct StickyFilterBar<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            content()
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.bar)
        .overlay(alignment: .bottom) {
            Divider()
        }
    }
}
