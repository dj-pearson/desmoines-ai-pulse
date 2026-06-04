import SwiftUI

/// Chat-style conversational discovery surface. Calls the discover-chat
/// edge function and renders 3-5 picks with a one-line "why" caption per
/// card. Reachable from the prominent search-bar entry on HomeView and
/// from the Search tab.
///
/// IOS-DISCOVER-2026-001.
struct AskPulseView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var service = AskPulseService.shared
    @State private var input: String = ""
    @State private var conversation: [AskPulseService.ChatMessage] = []
    @State private var picks: [AskPulseService.Pick] = []
    @State private var followUps: [String] = []
    /// At most one labeled sponsored pick (IOS-ADS-015), server-eligible + free-tier only.
    @State private var sponsoredPick: SponsoredPickService.SponsoredPick?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @FocusState private var inputFocused: Bool

    private let suggestions: [String] = [
        "date night, walkable, under $60",
        "something fun with the kids tomorrow afternoon",
        "quiet patio for a meeting",
        "live music tonight",
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if conversation.isEmpty {
                            welcomeState
                        } else {
                            conversationView
                            if !picks.isEmpty {
                                picksSection
                            }
                            if !followUps.isEmpty {
                                followUpChips
                            }
                        }
                        if let errorMessage {
                            errorBanner(errorMessage)
                        }
                    }
                    .padding()
                }
                .background(Color(.systemGroupedBackground))

                inputBar
            }
            .navigationTitle("Ask Pulse")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
                if !conversation.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("New") {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            resetConversation()
                        }
                    }
                }
            }
            .onAppear { inputFocused = true }
        }
    }

    // MARK: - Sections

    private var welcomeState: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 36))
                    .foregroundStyle(Color.accentColor.gradient)
                    .accessibilityHidden(true)
                Text("Ask Pulse")
                    .font(.title2.bold())
                Text("Tell me what you're in the mood for and I'll pick 3-5 spots from across Des Moines.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Try one of these:")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        input = suggestion
                        Task { await send() }
                    } label: {
                        HStack {
                            Image(systemName: "wand.and.stars")
                                .foregroundStyle(.tint)
                                .accessibilityHidden(true)
                            Text(suggestion)
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.leading)
                            Spacer()
                            Image(systemName: "arrow.up.right")
                                .foregroundStyle(.secondary)
                                .accessibilityHidden(true)
                        }
                        .padding()
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
                    }
                    .accessibilityLabel(Text("Try: \(suggestion)"))
                }
            }
        }
    }

    private var conversationView: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(conversation) { msg in
                HStack {
                    if msg.role == .user { Spacer(minLength: 32) }
                    Text(msg.content)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            (msg.role == .user ? Color.accentColor.opacity(0.15) : Color(.secondarySystemGroupedBackground)),
                            in: RoundedRectangle(cornerRadius: 14),
                        )
                    if msg.role == .assistant { Spacer(minLength: 32) }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(msg.role == .user ? "You" : "Pulse"): \(msg.content)")
            }
            if isLoading {
                HStack {
                    ProgressView().controlSize(.small)
                    Text("Thinking…")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 4)
            }
        }
    }

    private var picksSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Pulse picks")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .accessibilityAddTraits(.isHeader)
            ForEach(picks) { pick in
                AskPulsePickCard(pick: pick)
            }
            // One clearly-labeled sponsored pick among the picks (IOS-ADS-015).
            if let sponsoredPick {
                SponsoredPickCard(pick: sponsoredPick, surface: .askPulse)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityValue("\(picks.count) picks")
    }

    private var followUpChips: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Want me to try something else?")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
            FlowLayout(spacing: 6) {
                ForEach(followUps, id: \.self) { suggestion in
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        input = suggestion
                        Task { await send() }
                    } label: {
                        Text(suggestion)
                            .font(.footnote.weight(.medium))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.accentColor.opacity(0.15), in: Capsule())
                    }
                    .accessibilityLabel(Text("Follow up: \(suggestion)"))
                }
            }
        }
    }

    private var inputBar: some View {
        HStack(spacing: 8) {
            TextField("date night near downtown…", text: $input, axis: .vertical)
                .lineLimit(1...3)
                .focused($inputFocused)
                .textFieldStyle(.roundedBorder)
                .submitLabel(.send)
                .onSubmit { Task { await send() } }
                .accessibilityLabel("Message Pulse")

            Button {
                Task { await send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
            }
            .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)
            .accessibilityLabel("Send message")
        }
        .padding()
        .background(.bar)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.primary)
            Spacer()
        }
        .padding()
        .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error: \(message)")
    }

    // MARK: - Actions

    private func resetConversation() {
        conversation = []
        picks = []
        followUps = []
        sponsoredPick = nil
        errorMessage = nil
        input = ""
        inputFocused = true
    }

    private func send() async {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isLoading else { return }

        conversation.append(.init(role: .user, content: trimmed))
        input = ""
        isLoading = true
        errorMessage = nil
        sponsoredPick = nil

        do {
            let response = try await AskPulseService.shared.ask(
                messages: conversation,
                userLocation: nil,
            )
            picks = response.picks
            followUps = response.followUpSuggestions
            // Ask the server for one eligible sponsored pick for this intent
            // (free-tier only; nil when nothing matches). IOS-ADS-015.
            if !response.picks.isEmpty {
                sponsoredPick = await SponsoredPickService.shared.pick(for: .askPulse, query: trimmed)
            }
            // Add a synthetic assistant turn that summarises the picks. Picks
            // themselves are rendered as cards below the conversation, so the
            // chat bubble just provides screen-reader-friendly framing.
            let summary = response.picks.isEmpty
                ? "I couldn't find a great match. Want to try a different vibe?"
                : "Here are \(response.picks.count) ideas — see the cards below."
            conversation.append(.init(role: .assistant, content: summary))
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch let AskPulseService.AskPulseError.quotaExceeded {
            errorMessage = "You've hit today's Ask Pulse limit. Upgrade for more queries."
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        } catch {
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
        isLoading = false
    }
}

// MARK: - Pick Card

private struct AskPulsePickCard: View {
    let pick: AskPulseService.Pick

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: iconName)
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
                Text(pick.itemType.rawValue.capitalized)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                NavigationLink(value: pick) {
                    Image(systemName: "chevron.right")
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Open details")
                }
            }
            Text(pick.reason)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .multilineTextAlignment(.leading)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityHint("Tap to open this \(pick.itemType.rawValue) in detail")
    }

    private var iconName: String {
        switch pick.itemType {
        case .event: return "calendar"
        case .restaurant: return "fork.knife"
        case .attraction: return "mountain.2.fill"
        }
    }
}

// MARK: - FlowLayout

/// Minimal HStack-that-wraps used for follow-up chips. Avoids a third-party
/// dependency for what's a one-screen feature.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth.isFinite ? maxWidth : x, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

#Preview {
    AskPulseView()
}
