import SwiftUI

/// Standard full-width event card for the Events list.
///
/// IOS-IA-003: now a thin wrapper over the unified `ContentCard` (`.standard`
/// variant) so the visual + accessibility logic lives in exactly one place.
struct EventCardView: View {
    let event: Event
    @Binding var toast: ToastMessage?

    init(event: Event, toast: Binding<ToastMessage?> = .constant(nil)) {
        self.event = event
        self._toast = toast
    }

    var body: some View {
        ContentCard(event.cardData, variant: .standard, toast: $toast)
    }
}

#Preview {
    EventCardView(event: .preview)
        .padding()
}
