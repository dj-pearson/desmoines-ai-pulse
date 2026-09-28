import SwiftUI
import CoreLocation

/// Chat-style conversational discovery surface. Calls the discover-chat
/// edge function and renders 3-5 picks with a one-line "why" caption per
/// card. Reachable from the prominent search-bar entry on HomeView and
/// from the Search tab.
///
/// IOS-DISCOVER-2026-001.
struct AskPulseView: View {
    /// Optional query to prefill and auto-submit on appear — used by the Siri
    /// "Ask Pulse" intent so it reaches the chat, not keyword search (FEAT-028).
    var initialQuery: String? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var service = AskPulseService.shared
    @State private var auth = AuthService.shared
    @State private var input: String = ""
    /// Each assistant turn carries its own picks, so earlier cards stay put
    /// when a follow-up is sent (IOS-DD-DISCOVER-16).
    @State private var conversation: [AskPulseService.ChatMessage] = []
    @State private var followUps: [String] = []
    /// At most one labeled sponsored pick (IOS-ADS-015), server-eligible + free-tier only.
    @State private var sponsoredPick: SponsoredPickService.SponsoredPick?
    /// Support resources when the server answered a crisis (IOS-DD-DISCOVER-13).
    @State private var crisisResources: [AskPulseService.CrisisResource]?
    @State private var isLoading = false
    @State private var errorMessage: String?
    /// Today's questions are used, or AI is paused. A quota block holds until
    /// the screen is reopened (IOS-DD-DISCOVER-14).
    @State private var limit: AskPulseService.AskPulseError?
    @State private var showSignIn = false
    @State private var showPaywall = false
    @FocusState private var inputFocused: Bool

    private let bottomAnchorID = "askPulseBottom"

    private let suggestions: [String] = [
        "date night, walkable, under $60",
        "something fun with the kids tomorrow afternoon",
        "quiet patio for a meeting",
        "live music tonight",
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                transcript
                inputBar
            }
            .navigationTitle("Ask Pulse")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: AskPulseService.Pick.self) { pick in
                AskPulsePickDetailView(pick: pick)
            }
            .toolbar { toolbarContent }
            .onAppear {
                // Guests see a sign-in card, not a keyboard for a composer
                // they cannot use.
                if auth.isAuthenticated { inputFocused = true }
            }
            .task { await runInitialQuery() }
            // A 401 with a session present (an expired token) sets
            // .signInRequired, which swaps the composer for the sign-in card.
            // isAuthenticated does not change on re-sign-in, so clear the block
            // here or the card never goes away.
            .sheet(isPresented: $showSignIn, onDismiss: {
                if auth.isAuthenticated, limit == .signInRequired { limit = nil }
            }) {
                NavigationStack { AuthView(isModal: true) }
            }
            .sheet(isPresented: $showPaywall) {
                PaywallView(context: .askPulse)
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
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

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if conversation.isEmpty {
                        welcomeState
                    } else {
                        conversationView
                        if let crisisResources {
                            CrisisResourcesCard(resources: crisisResources)
                        }
                        if !followUps.isEmpty {
                            followUpChips
                        }
                    }
                    if let limit {
                        limitBanner(limit)
                    }
                    if let errorMessage {
                        errorBanner(errorMessage)
                    }
                    // Scroll anchor so the newest message / typing indicator /
                    // picks scroll into view after a send (IOS-AUDIT-UX-022).
                    Color.clear.frame(height: 1).id(bottomAnchorID)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .onChange(of: conversation.count) { _, _ in scrollToBottom(proxy) }
            .onChange(of: isLoading) { _, _ in scrollToBottom(proxy) }
        }
    }

    // MARK: - Sections

    private var welcomeState: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 36))
                    .foregroundStyle(Color.accentColor)
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
                    suggestionButton(suggestion)
                }
            }
        }
    }

    private func suggestionButton(_ suggestion: String) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            // A guest's tap opens sign-in rather than a 401.
            guard auth.isAuthenticated else {
                showSignIn = true
                return
            }
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

    /// Every turn, with each assistant turn's picks under its bubble. The
    /// sponsored pick belongs to the latest answer only.
    private var conversationView: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(conversation) { msg in
                ChatBubble(
                    text: msg.content,
                    role: msg.role == .user ? .user : .assistant,
                    embedded: true
                )
                if msg.role == .assistant, !msg.picks.isEmpty {
                    picksSection(msg.picks, showsSponsored: msg.id == conversation.last?.id)
                }
            }
            if isLoading {
                TypingIndicator(embedded: true)
            }
        }
    }

    private func picksSection(_ picks: [AskPulseService.Pick], showsSponsored: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(picks) { pick in
                AskPulsePickCard(pick: pick)
            }
            // One clearly-labeled sponsored pick among the picks (IOS-ADS-015).
            if showsSponsored, let sponsoredPick {
                SponsoredPickCard(pick: sponsoredPick, surface: .askPulse)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Pulse picks")
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
                    .disabled(isSendBlocked)
                    .accessibilityLabel(Text("Follow up: \(suggestion)"))
                }
            }
        }
    }

    /// Messages remaining today.
    ///
    /// AskPulseService has recorded `lastUsage` on every response since it was
    /// written and nothing displayed it, so the first a user learned about the
    /// limit was hitting it - the quotaExceeded error below was the entire UI
    /// for this (IOS-AUDIT-UX-060).
    @ViewBuilder
    private var quotaLabel: some View {
        if let usage = service.lastUsage {
            Text(usage.remaining.displayString)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .accessibilityLabel("Pulse messages: \(usage.remaining.displayString)")
        }
    }

    @ViewBuilder
    private var inputBar: some View {
        if auth.isAuthenticated && limit != .signInRequired {
            VStack(spacing: 4) {
                quotaLabel
                composer
            }
        } else {
            signInCard
        }
    }

    /// discover-chat needs an account, and a guest used to get the raw
    /// 401 text (IOS-DD-DISCOVER-14).
    private var signInCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sign in to ask Pulse. Free accounts get 5 questions a day.")
                .font(.subheadline)
                .foregroundStyle(.primary)
            Button {
                showSignIn = true
            } label: {
                Text("Sign in")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .background(.bar)
    }

    private var isSendBlocked: Bool {
        if case .quota? = limit { return true }
        return isLoading
    }

    private var composer: some View {
        VStack(alignment: .trailing, spacing: 2) {
            HStack(spacing: 8) {
                TextField("date night near downtown...", text: $input, axis: .vertical)
                    .lineLimit(1...3)
                    .focused($inputFocused)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.send)
                    .onSubmit { Task { await send() } }
                    .accessibilityLabel("Message Pulse")
                    // Capped at 500. The server clamps at 2000, and anything
                    // past a question is prompt-stuffing (IOS-DD-DISCOVER-16).
                    .onChange(of: input) { _, newValue in
                        if newValue.count > AskPulseService.maxInputLength {
                            input = String(newValue.prefix(AskPulseService.maxInputLength))
                        }
                    }

                Button {
                    Task { await send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                }
                .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSendBlocked)
                .accessibilityLabel("Send message")
            }
            if input.count >= 400 {
                Text("\(input.count)/\(AskPulseService.maxInputLength)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("\(input.count) of \(AskPulseService.maxInputLength) characters")
            }
        }
        .padding()
        .background(.bar)
    }

    @ViewBuilder
    private func limitBanner(_ limit: AskPulseService.AskPulseError) -> some View {
        switch limit {
        case .quota(let upgradeHint, _):
            VStack(alignment: .leading, spacing: 8) {
                errorBanner(limit.errorDescription ?? "")
                // Only when there is a tier to move to; VIP gets no upsell.
                if upgradeHint != nil {
                    Button("See plans") { showPaywall = true }
                        .buttonStyle(.bordered)
                }
            }
        case .paused, .notConfigured, .signInRequired, .server:
            errorBanner(limit.errorDescription ?? "")
        }
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

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.25)) {
            proxy.scrollTo(bottomAnchorID, anchor: .bottom)
        }
    }

    private func runInitialQuery() async {
        // Auto-run a Siri/Shortcuts-provided query once (FEAT-028).
        guard let initialQuery, conversation.isEmpty else { return }
        let q = initialQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        input = String(q.prefix(AskPulseService.maxInputLength))
        if auth.isAuthenticated { await send() }
    }

    private func resetConversation() {
        conversation = []
        followUps = []
        sponsoredPick = nil
        crisisResources = nil
        errorMessage = nil
        // A quota block outlives "New"; a pause or server error does not.
        if case .quota? = limit {} else { limit = nil }
        input = ""
        inputFocused = true
    }

    /// Where the user is, when they have allowed it. It was always nil, so
    /// "near me" meant nothing (IOS-DD-DISCOVER-16).
    private var currentLocation: (Double, Double)? {
        let location = LocationService.shared
        guard LocationService.isAuthorized(location.authorizationStatus),
              let here = location.userLocation else { return nil }
        return (here.coordinate.latitude, here.coordinate.longitude)
    }

    private func send() async {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSendBlocked else { return }
        guard auth.isAuthenticated else {
            showSignIn = true
            return
        }

        let userTurn = AskPulseService.ChatMessage(role: .user, content: String(trimmed.prefix(AskPulseService.maxInputLength)))
        conversation.append(userTurn)
        input = ""
        isLoading = true
        errorMessage = nil
        sponsoredPick = nil
        crisisResources = nil

        do {
            let response = try await AskPulseService.shared.ask(
                messages: conversation,
                userLocation: currentLocation,
            )
            if response.crisis == true {
                handleCrisis(response)
            } else {
                await handleAnswer(response, query: trimmed)
            }
        } catch {
            // Take the unanswered question back out, so the history holds
            // only answered turns and the text can be sent again.
            conversation.removeAll { $0.id == userTurn.id }
            input = trimmed
            if let pulseError = error as? AskPulseService.AskPulseError {
                handle(pulseError)
            } else {
                errorMessage = error.localizedDescription
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
        }
        isLoading = false
    }

    private func handleAnswer(_ response: AskPulseService.Response, query: String) async {
        followUps = response.followUpSuggestions
        // The bubble frames the cards for VoiceOver; the model is sent the
        // names and ids instead, so a follow-up has something to refer to.
        let summary = response.picks.isEmpty
            ? "I couldn't find a great match. Want to try a different vibe?"
            : "Here are \(response.picks.count) ideas."
        conversation.append(.init(
            role: .assistant,
            content: summary,
            picks: response.picks,
            modelContent: AskPulseService.modelSummary(response.picks)
        ))
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        // Ask the server for one eligible sponsored pick for this intent
        // (free-tier only; nil when nothing matches). IOS-ADS-015.
        if !response.picks.isEmpty {
            sponsoredPick = await SponsoredPickService.shared.pick(for: .askPulse, query: query)
        }
    }

    /// The server heard distress. Show its message and the support lines, no
    /// picks, no follow-ups, no sponsored card, and no success haptic
    /// (IOS-DD-DISCOVER-13).
    private func handleCrisis(_ response: AskPulseService.Response) {
        followUps = []
        sponsoredPick = nil
        crisisResources = response.resources ?? []
        conversation.append(.init(
            role: .assistant,
            content: response.message ?? CrisisResourcesCard.fallbackMessage
        ))
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }

    private func handle(_ error: AskPulseService.AskPulseError) {
        switch error {
        case .signInRequired, .quota, .paused:
            limit = error
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .server, .notConfigured:
            errorMessage = error.errorDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }
}

// MARK: - Crisis resources

/// Support lines from a crisis response (IOS-DD-DISCOVER-13). The call and
/// text buttons are built here from the national 988 number rather than from
/// the server's `contact` prose, which is not a dialable string.
struct CrisisResourcesCard: View {
    let resources: [AskPulseService.CrisisResource]

    static let fallbackMessage = "It sounds like you're going through something hard. You don't have to handle it alone. You can reach someone right now:"

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(resources, id: \.self) { resource in
                VStack(alignment: .leading, spacing: 2) {
                    Text(resource.name)
                        .font(.subheadline.weight(.semibold))
                    Text(resource.contact)
                        .font(.subheadline)
                    if let description = resource.description {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
            }
            HStack(spacing: 10) {
                crisisLink("Call 988", systemImage: "phone.fill", url: "tel:988", label: "Call the 988 Suicide and Crisis Lifeline")
                crisisLink("Text 988", systemImage: "message.fill", url: "sms:988", label: "Text the 988 Suicide and Crisis Lifeline")
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func crisisLink(_ title: String, systemImage: String, url: String, label: String) -> some View {
        if let target = URL(string: url) {
            Link(destination: target) {
                Label(title, systemImage: systemImage)
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .accessibilityLabel(label)
        }
    }
}

// MARK: - Pick Card

/// The whole card opens the pick; only the chevron did. It now shows what the
/// server knows about the row - picture, name, when and where - instead of
/// just the type and the reason (IOS-DD-DISCOVER-16).
private struct AskPulsePickCard: View {
    let pick: AskPulseService.Pick

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            NavigationLink(value: pick) {
                content
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens this \(pick.itemType.rawValue)")

            if let url = pick.shareURL {
                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up")
                        .foregroundStyle(.secondary)
                        .minHitTarget()
                }
                .accessibilityLabel("Share \(pick.displayTitle)")
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private var content: some View {
        HStack(alignment: .top, spacing: 12) {
            if let imageUrl = pick.imageUrl {
                CachedAsyncImage(url: imageUrl) {
                    Color(.systemGray5)
                }
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Image(systemName: iconName)
                        .foregroundStyle(.tint)
                        .accessibilityHidden(true)
                    Text(pick.displayTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                }
                if let meta = pick.metaLine {
                    Text(meta)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(pick.reason)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var iconName: String {
        switch pick.itemType {
        case .event: return "calendar"
        case .restaurant: return "fork.knife"
        case .attraction: return "mountain.2.fill"
        }
    }
}

extension AskPulseService.Pick {
    /// The name, or the type when an older server sent none.
    var displayTitle: String {
        if let title, !title.isEmpty { return title }
        return itemType.rawValue.capitalized
    }

    /// Event: Des Moines day and time, then the venue. Restaurant: cuisine and
    /// price. Nil when the server sent neither.
    var metaLine: String? {
        var parts: [String] = []
        switch itemType {
        case .event:
            if let date = DateParser.parse(startsAt) {
                let style = DesMoinesTime.style(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute())
                parts.append(date.formatted(style))
            }
            if let venue, !venue.isEmpty { parts.append(venue) }
        case .restaurant:
            if let cuisine, !cuisine.isEmpty { parts.append(cuisine) }
            if let priceRange, !priceRange.isEmpty { parts.append(priceRange) }
        case .attraction:
            break
        }
        return parts.isEmpty ? nil : parts.joined(separator: " - ")
    }

    var shareURL: URL? {
        let section: String
        switch itemType {
        case .event: section = "events"
        case .restaurant: section = "restaurants"
        case .attraction: section = "attractions"
        }
        return Config.siteURL.appendingPathComponent(section).appendingPathComponent(itemId)
    }
}

// MARK: - Pick Detail Resolver

/// Resolves an Ask Pulse pick (which carries only an item type + id) to its
/// full model and shows the matching detail screen, mirroring the deep-link
/// resolver's loading/failed phases so the card's chevron never dead-ends
/// (IOS-AUDIT-FEAT-018).
private struct AskPulsePickDetailView: View {
    let pick: AskPulseService.Pick

    @State private var phase: Phase = .loading

    private enum Phase {
        case loading
        case failed
        case event(Event)
        case restaurant(Restaurant)
        case attraction(Attraction)
    }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed:
                EmptyStateView(
                    icon: "exclamationmark.triangle",
                    title: "Couldn't Load",
                    message: "This pick couldn't be opened. It may have been removed or you're offline.",
                    actionTitle: "Try Again",
                    action: { Task { await resolve() } }
                )
            case .event(let event):
                EventDetailView(event: event)
            case .restaurant(let restaurant):
                RestaurantDetailView(restaurant: restaurant)
            case .attraction(let attraction):
                AttractionDetailView(attraction: attraction)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await resolve() }
    }

    private func resolve() async {
        phase = .loading
        do {
            switch pick.itemType {
            case .event:
                phase = .event(try await EventsService.shared.fetchEvent(id: pick.itemId))
            case .restaurant:
                phase = .restaurant(try await RestaurantsService.shared.fetchRestaurant(id: pick.itemId))
            case .attraction:
                phase = .attraction(try await AttractionsService.shared.fetchAttraction(id: pick.itemId))
            }
        } catch {
            phase = .failed
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
