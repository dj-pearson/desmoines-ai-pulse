import SwiftUI

enum ChatRole {
    case user, assistant
}

/// Chat bubble used in the Trip Planner conversational UI.
/// Mirrors Android `ChatBubble.kt`.
struct ChatBubble: View {
    let text: String
    let role: ChatRole

    var body: some View {
        HStack {
            if role == .user { Spacer(minLength: 40) }
            Text(text)
                .font(.body)
                .foregroundStyle(role == .user ? Color.white : Color.primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    role == .user ? Color.accentColor : Color(.secondarySystemBackground)
                )
                .clipShape(
                    .rect(
                        topLeadingRadius: 18,
                        bottomLeadingRadius: role == .user ? 18 : 4,
                        bottomTrailingRadius: role == .user ? 4 : 18,
                        topTrailingRadius: 18
                    )
                )
            if role == .assistant { Spacer(minLength: 40) }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .accessibilityLabel(
            (role == .user ? "You said: " : "Assistant said: ") + text
        )
    }
}

/// Three-dot typing indicator shown while the assistant is thinking.
struct TypingIndicator: View {
    @State private var phase: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack {
            HStack(spacing: 6) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(Color.secondary)
                        .frame(width: 8, height: 8)
                        .offset(y: reduceMotion ? 0 : dotOffset(index: i))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18))
            Spacer(minLength: 40)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 0.6).repeatForever(autoreverses: true)) {
                phase = 1
            }
        }
        .accessibilityLabel("Assistant is typing")
    }

    private func dotOffset(index: Int) -> CGFloat {
        let delay = CGFloat(index) * 0.25
        let adjusted = max(0, min(1, phase - delay))
        return -sin(adjusted * .pi) * 4
    }
}

/// Horizontal row of quick-reply suggestion chips for the trip planner.
struct SuggestionChipsRow: View {
    let suggestions: [String]
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        HapticFeedback.shared.selection()
                        onSelect(suggestion)
                    } label: {
                        Text(suggestion)
                            .font(.subheadline)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Color(.systemBackground))
                            .overlay(
                                Capsule().stroke(Color(.separator), lineWidth: 1)
                            )
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .minHitTarget()
                    .accessibilityLabel(suggestion)
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 8)
    }
}

#Preview {
    VStack(spacing: 0) {
        ChatBubble(text: "Plan me a kid-friendly Saturday in Des Moines.", role: .user)
        ChatBubble(text: "I'd love to help! Here's a 4-stop itinerary…", role: .assistant)
        TypingIndicator()
        SuggestionChipsRow(
            suggestions: ["Kid-friendly weekend", "Foodie Saturday", "Free events", "Late-night"],
            onSelect: { _ in }
        )
    }
}
