import SwiftUI

/// Standard full-width event card for the Events list.
///
/// IOS-IA-003: now a thin wrapper over the unified `ContentCard` (`.standard`
/// variant) so the visual + accessibility logic lives in exactly one place.
struct EventCardView: View {
    let event: Event
    /// Nil when the host has no toast; ContentCard then uses AppToastCenter
    /// rather than a `.constant(nil)` that drops every message (IOS-DD-SAVED-15).
    private let toast: Binding<ToastMessage?>?

    init(event: Event, toast: Binding<ToastMessage?>? = nil) {
        self.event = event
        self.toast = toast
    }

    var body: some View {
        ContentCard(event.cardData, variant: .standard, toast: toast)
    }
}

#Preview {
    EventCardView(event: .preview)
        .padding()
}
