import SwiftUI

// MARK: - IOS-IA-003 · Unified content-card system
//
// One card layer for the whole app. Events, restaurants, attractions, and
// (soon) articles / hotels / deals all map to a single `ContentCardData`
// value type and render through `ContentCard` in one of four variants:
//
//   • .featured  — hero card for Home rails (image + scrim + title below)
//   • .compact   — small vertical card for Home rails
//   • .standard  — full-width vertical card for list tabs (Events)
//   • .listRow   — horizontal row for list tabs / Search (Dining, Attractions)
//
// Every variant shares the same affordances — favorite toggle, sponsored
// badge (IOS-ADS-011), and premium / VIP badge — and every variant has a
// matching `ContentCardSkeleton` so loading never collapses or shifts layout.
//
// The bespoke EventCardView / RestaurantCardView / AttractionCardView /
// Featured / Compact cards are now thin wrappers that build a `ContentCardData`
// and delegate here, so the visual logic lives in exactly one place.

// MARK: - Normalized card model

/// A single meta line (icon + text), e.g. "clock · Fri, Jun 6" or "mappin · East Village".
struct CardMetaLine: Hashable {
    let icon: String
    let text: String
}

/// A small inline pill, e.g. "FREE", "$$", "★ 4.8", "Open".
/// Always carries an icon so colour is never the only differentiator
/// (Differentiate Without Color Alone).
struct CardPill: Identifiable, Hashable {
    let id = UUID()
    let icon: String?
    let text: String
    let tint: Color
    var filled: Bool = true
    /// When set, only the icon takes this colour and the text is `.primary`.
    /// System yellow or green text on white is far below 4.5:1
    /// (IOS-DD-RESTAURANTS-12).
    var iconTint: Color? = nil

    static func == (lhs: CardPill, rhs: CardPill) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// What kind of content a card represents, so the shared favorite button can
/// route to the right FavoritesService method.
enum FavoritableKind {
    case event, restaurant, attraction

    var favoriteKind: FavoriteKind {
        switch self {
        case .event: return .event
        case .restaurant: return .restaurant
        case .attraction: return .attraction
        }
    }
}

/// The favorite affordance. `.managed` self-toggles through FavoritesService
/// (used by list/search cards); `.external` defers to a parent-owned binding
/// (used where the screen already tracks favorite state + its own toast).
enum CardFavorite {
    case managed(kind: FavoritableKind, id: String, title: String)
    case external(isFavorited: Bool, name: String, onToggle: () -> Void)
}

/// Normalized data every card variant renders from. Models produce one of
/// these via `cardData` (see extensions at the bottom of this file).
struct ContentCardData {
    let id: String
    let title: String
    let imageUrl: String?

    /// Placeholder shown while the image loads / when there is no image.
    var placeholderIcon: String = "photo"
    var placeholderTint: Color = .gray

    /// Optional event-style gradient category badge overlaid on the image
    /// (featured / standard variants only).
    var categoryOverlay: EventCategory?

    var metaPrimary: CardMetaLine?
    var metaSecondary: CardMetaLine?

    /// Event date for the standalone day/month badge on the standard variant.
    var dateBadge: Date?

    var pills: [CardPill] = []
    var urgency: String?

    var isFeatured = false
    var isPremium = false
    var isSponsored = false

    /// "Best Of" winner badge label (e.g. "Best Pizza"), shown on the card when
    /// this entity is the current #1 in a voting category (IOS-PARITY-005).
    var awardBadge: String?

    var favorite: CardFavorite?

    /// Full VoiceOver description covering everything visible on the card.
    var accessibilityLabel: String = ""
}

// MARK: - ContentCard

struct ContentCard: View {
    enum Variant { case featured, compact, standard, listRow }

    let data: ContentCardData
    var variant: Variant = .standard

    /// When true the card is purely visual (its tap + label live on a wrapping
    /// NavigationLink, as in Home rails), so we hide it from VoiceOver and omit
    /// the nested favorite button.
    var decorative: Bool = false

    @Binding var toast: ToastMessage?
    /// Whether the host passed a toast binding. Without one, favorite
    /// feedback goes to AppToastCenter (IOS-DD-SAVED-15).
    private let hasToastBinding: Bool

    init(
        _ data: ContentCardData,
        variant: Variant = .standard,
        decorative: Bool = false,
        toast: Binding<ToastMessage?>? = nil
    ) {
        self.data = data
        self.variant = variant
        self.decorative = decorative
        self._toast = toast ?? .constant(nil)
        self.hasToastBinding = toast != nil
    }

    var body: some View {
        Group {
            switch variant {
            case .featured: featured
            case .compact:  compact
            case .standard: standard
            case .listRow:  listRow
            }
        }
        // IOS-ADS-011: elevated amber ring on sponsored listings (mirrors the
        // web's `ring-2 ring-amber-400`). The "Sponsored" badge is rendered by
        // `image(...)` so the treatment is clearly labeled, never disguised.
        .overlay {
            if data.isSponsored {
                RoundedRectangle(cornerRadius: sponsoredCornerRadius)
                    .strokeBorder(Color.orange.opacity(0.65), lineWidth: 2)
                    .allowsHitTesting(false)
            }
        }
        .modifier(CardAccessibility(decorative: decorative, label: accessibilityLabel))
    }

    /// Prefixes "Sponsored" / the award so the paid placement and Best-Of win are
    /// announced (the visual badges are dropped from the combined element).
    private var accessibilityLabel: String {
        var prefix = ""
        if data.isSponsored { prefix += "Sponsored. " }
        if let award = data.awardBadge { prefix += "\(award) winner. " }
        return prefix + data.accessibilityLabel
    }

    /// Outer corner radius per variant, so the sponsored ring hugs the card edge.
    private var sponsoredCornerRadius: CGFloat {
        switch variant {
        case .featured: return 14
        case .compact:  return 12
        case .standard: return 18
        case .listRow:  return 16
        }
    }

    // MARK: Image

    @ViewBuilder
    private func image(width: CGFloat?, height: CGFloat, corner: CGFloat, scrim: Bool) -> some View {
        ZStack(alignment: .topLeading) {
            CachedAsyncImage(url: data.imageUrl) {
                ZStack {
                    Rectangle().fill(data.placeholderTint.opacity(0.15).gradient)
                    Image(systemName: data.placeholderIcon)
                        .font(.system(size: height > 130 ? 36 : 24))
                        .foregroundStyle(data.placeholderTint.opacity(0.4))
                }
                .accessibilityHidden(true)
            }
            .frame(maxWidth: width ?? .infinity, maxHeight: height)
            .frame(height: height)
            .modifier(ScrimModifier(enabled: scrim))
            .clipShape(RoundedRectangle(cornerRadius: corner))

            // Top-leading overlay stack: category + sponsored / premium badges.
            VStack(alignment: .leading, spacing: 4) {
                if let category = data.categoryOverlay {
                    CategoryBadge(category: category, size: .small)
                }
                if data.isSponsored { SponsoredBadge() }
                if data.isPremium { VipGoldBadge() }
                if let award = data.awardBadge { AwardBadge(label: award) }
            }
            .padding(8)
        }
    }

    // MARK: Favorite

    @ViewBuilder
    private func favoriteButton(style: CardFavoriteButton.Style) -> some View {
        if !decorative, let favorite = data.favorite {
            CardFavoriteButton(favorite: favorite, style: style, toast: $toast, hasToastBinding: hasToastBinding)
        }
    }

    // MARK: Pills row

    @ViewBuilder
    private func pillsRow(limit: Int) -> some View {
        let shown = Array(data.pills.prefix(limit))
        if !shown.isEmpty || data.urgency != nil || data.isFeatured {
            HStack(spacing: 6) {
                ForEach(shown) { PillView(pill: $0) }
                Spacer(minLength: 0)
                // White bold text on a filled capsule, as EventDetailHeader
                // does: orange caption text on white was about 2.2:1
                // (IOS-DD-EVENTS-25).
                if let urgency = data.urgency {
                    Label(urgency, systemImage: "clock.badge.exclamationmark")
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(PremiumTokens.urgencyFill, in: Capsule())
                }
                if data.isFeatured {
                    Label("Featured", systemImage: "star.fill")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(PremiumTokens.urgencyFill, in: Capsule())
                }
            }
        }
    }

    @ViewBuilder
    private func meta(_ line: CardMetaLine?) -> some View {
        if let line {
            Label(line.text, systemImage: line.icon)
                .appText(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    // MARK: - Variant: featured (Home hero rail, 260 wide)

    private var featured: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topTrailing) {
                image(width: 260, height: 150, corner: 14, scrim: true)
                    .glassCard(cornerRadius: 14, material: .regularMaterial, elevation: PremiumTokens.elevation4)
                favoriteButton(style: .overlay).padding(10)
            }
            // "Happening now" / "Today" on the rail cards too, so the Tonight
            // rail says which shows are already on (IOS-DD-EVENTS-18). Bottom
            // leading: the top-leading corner already holds the category,
            // sponsored and award badges.
            .overlay(alignment: .bottomLeading) {
                if let urgency = data.urgency {
                    Text(urgency)
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(PremiumTokens.urgencyFill, in: Capsule())
                        .padding(10)
                        .accessibilityHidden(true)
                }
            }

            Text(data.title)
                .appText(.bodyEmphasized)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            HStack(spacing: 4) {
                meta(data.metaPrimary)
                Spacer(minLength: 0)
                if let first = data.pills.first { PillView(pill: first) }
            }
        }
        .frame(width: 260)
    }

    // MARK: - Variant: compact (Home rail, 180 wide)

    private var compact: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topTrailing) {
                image(width: 180, height: 110, corner: 12, scrim: false)
                favoriteButton(style: .overlay).padding(8)
            }
            // Only events carry urgency; the Dashboard "Coming up" strip
            // uses this variant for them (IOS-DD-SAVED-26).
            .overlay(alignment: .bottomLeading) {
                if let urgency = data.urgency {
                    Text(urgency)
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(PremiumTokens.urgencyFill, in: Capsule())
                        .padding(8)
                        .accessibilityHidden(true)
                }
            }

            Text(data.title)
                .appText(.bodyEmphasized)
                .lineLimit(1)

            HStack(spacing: 6) {
                meta(data.metaPrimary)
                Spacer(minLength: 0)
                if let first = data.pills.first { PillView(pill: first) }
            }
        }
        .frame(width: 180)
    }

    // MARK: - Variant: standard (Events list, full width)

    private var standard: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topTrailing) {
                image(width: nil, height: 180, corner: 0, scrim: false)

                VStack(alignment: .trailing, spacing: 6) {
                    favoriteButton(style: .overlay)
                    Spacer(minLength: 0)
                    if let date = data.dateBadge {
                        CardDateBadge(date: date).accessibilityHidden(true)
                    }
                }
                .padding(10)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(data.title)
                    .appText(.subtitle)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                meta(data.metaPrimary)
                meta(data.metaSecondary)
                pillsRow(limit: 3)
            }
            .padding(14)
        }
        .glassCard(cornerRadius: 18, material: .regularMaterial, elevation: PremiumTokens.elevation4)
    }

    // MARK: - Variant: listRow (Dining / Attractions / Search)

    private var listRow: some View {
        HStack(spacing: 14) {
            image(width: 100, height: 100, corner: 12, scrim: false)
                .frame(width: 100)

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    Text(data.title)
                        .appText(.bodyEmphasized)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    favoriteButton(style: .inline)
                }
                meta(data.metaPrimary)
                pillsRow(limit: 3)
                meta(data.metaSecondary)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .glassCard(cornerRadius: 16, material: .regularMaterial, elevation: PremiumTokens.elevation4)
    }
}

// MARK: - Accessibility wrapper

/// Hides decorative cards (label lives on the wrapping link) or exposes a
/// combined label + a focusable favorite child for standalone cards.
private struct CardAccessibility: ViewModifier {
    let decorative: Bool
    let label: String

    func body(content: Content) -> some View {
        if decorative {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityHidden(true)
        } else {
            content
                .accessibilityElement(children: .contain)
                .accessibilityLabel(label)
        }
    }
}

// MARK: - Scrim modifier (only featured cards get the legibility gradient)

private struct ScrimModifier: ViewModifier {
    let enabled: Bool
    func body(content: Content) -> some View {
        if enabled {
            content.overlay(PremiumTokens.imageScrim)
        } else {
            content
        }
    }
}

// MARK: - Pill view

private struct PillView: View {
    let pill: CardPill

    var body: some View {
        Group {
            if let icon = pill.icon, let iconTint = pill.iconTint {
                Label {
                    Text(pill.text).foregroundStyle(.primary)
                } icon: {
                    Image(systemName: icon).foregroundStyle(iconTint)
                }
            } else if let icon = pill.icon {
                Label(pill.text, systemImage: icon)
            } else {
                Text(pill.text)
            }
        }
        .appText(.caption)
        .foregroundStyle(pill.tint)
        .lineLimit(1)
        .padding(.horizontal, pill.filled ? 8 : 0)
        .padding(.vertical, pill.filled ? 3 : 0)
        .background {
            if pill.filled {
                Capsule().fill(pill.tint.opacity(0.12))
            }
        }
    }
}

// MARK: - Sponsored badge (IOS-ADS-011, FTC-compliant labeling)

struct SponsoredBadge: View {
    var body: some View {
        Text("Sponsored")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.25), lineWidth: 0.5))
            .accessibilityLabel("Sponsored content")
    }
}

// MARK: - Best-Of award badge (IOS-PARITY-005)

/// Small "trophy + category" badge for the current #1 in a Best-Of category.
/// Overlaid on the card image so wins surface across the unified card system.
struct AwardBadge: View {
    let label: String

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 9, weight: .bold))
                .accessibilityHidden(true)
            Text(label)
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(
            LinearGradient(colors: [Color(red: 0.98, green: 0.75, blue: 0.14),
                                    Color(red: 0.96, green: 0.55, blue: 0.11)],
                           startPoint: .leading, endPoint: .trailing),
            in: Capsule()
        )
        .accessibilityLabel("\(label) winner")
    }
}

// MARK: - Shared favorite button

@MainActor
struct CardFavoriteButton: View {
    enum Style { case overlay, inline }

    let favorite: CardFavorite
    var style: Style = .inline
    @Binding var toast: ToastMessage?
    /// False when the card was built with the default `.constant(nil)`.
    var hasToastBinding = true

    @State private var favorites = FavoritesService.shared
    @State private var auth = AuthService.shared
    @State private var burst = false

    /// A save for this card is on the network; the heart dims and further
    /// taps are ignored (IOS-DD-SAVED-05).
    private var isInFlight: Bool {
        guard case .managed(let kind, let id, _) = favorite else { return false }
        return favorites.isInFlight(kind: kind.favoriteKind, id: id)
    }

    private var isFavorited: Bool {
        switch favorite {
        case .external(let isFav, _, _):
            return isFav
        case .managed(let kind, let id, _):
            switch kind {
            case .event:      return favorites.isFavorited(id)
            case .restaurant: return favorites.isRestaurantFavorited(id)
            case .attraction: return favorites.isAttractionFavorited(id)
            }
        }
    }

    private var name: String {
        switch favorite {
        case .external(_, let name, _): return name
        case .managed(_, _, let title): return title
        }
    }

    var body: some View {
        Button(action: tapped) {
            HeartBurstView(isFavorited: isFavorited, burst: $burst) {
                Image(systemName: isFavorited ? "heart.fill" : "heart")
                    .font(style == .overlay ? .body.weight(.semibold) : .body)
                    .foregroundStyle(heartColor)
                    .frame(width: style == .overlay ? 36 : 28,
                           height: style == .overlay ? 36 : 28)
                    .background {
                        if style == .overlay {
                            Circle().fill(.ultraThinMaterial)
                        }
                    }
                    .opacity(isInFlight ? 0.5 : 1)
            }
        }
        .buttonStyle(.plain)
        // ≥44pt tap target without growing the visible heart (IOS-AUDIT-UX-002).
        .minHitTarget()
        .accessibilityLabel(isFavorited ? "Remove \(name) from saved" : "Save \(name)")
        // Expose saved/not-saved state to VoiceOver (IOS-AUDIT-UX-001) so it
        // announces the toggle without re-reading the action verb.
        .accessibilityValue(isFavorited ? "Saved" : "Not saved")
        .accessibilityAddTraits(isFavorited ? .isSelected : [])
    }

    private var heartColor: Color {
        if isFavorited { return .red }
        return style == .overlay ? .white : .secondary
    }

    private func tapped() {
        switch favorite {
        case .external(_, _, let onToggle):
            if !isFavorited { burst.toggle() }
            onToggle()
        case .managed(let kind, let id, _):
            // Guests get sign-in, not a celebration and then an error
            // (IOS-DD-SAVED-15).
            guard auth.isAuthenticated else {
                NotificationCenter.default.post(name: .favoritesSignInRequired, object: nil)
                return
            }
            guard !favorites.isInFlight(kind: kind.favoriteKind, id: id) else { return }
            let wasFavorited = isFavorited
            Task {
                do {
                    let nowSaved: Bool
                    switch kind {
                    case .event:      nowSaved = try await favorites.toggleFavorite(eventId: id)
                    case .restaurant: nowSaved = try await favorites.toggleRestaurantFavorite(restaurantId: id)
                    case .attraction: nowSaved = try await favorites.toggleFavoriteAttraction(attractionId: id)
                    }
                    // The burst plays once the save has landed, not before.
                    // It carries its own haptic; a second one here doubled it.
                    if nowSaved && !wasFavorited {
                        burst.toggle()
                    }
                    show(nowSaved
                        ? .success("Saved!", icon: "heart.fill")
                        : .info("Removed from saved", icon: "heart"))
                } catch {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                    // The favorites cap shows the upsell paywall app-wide
                    // (IOS-SUB-011); skip the redundant error toast for it.
                    if !FavoritesService.isLimitReached(error) {
                        show(.error(error.localizedDescription, icon: "exclamationmark.triangle"))
                    }
                }
            }
        }
    }

    /// Cards built without a toast binding (Search, saved-search results,
    /// Attractions) used to drop every message; those go to the app-wide
    /// toast instead (IOS-DD-SAVED-15).
    private func show(_ message: ToastMessage) {
        if hasToastBinding {
            toast = message
        } else {
            AppToastCenter.shared.show(message)
        }
    }
}

// MARK: - Date badge (event standard variant)

private struct CardDateBadge: View {
    let date: Date

    @ScaledMetric(relativeTo: .caption2) private var labelSize: CGFloat = 9
    @ScaledMetric(relativeTo: .title3)  private var daySize: CGFloat   = 18
    @ScaledMetric private var badgeWidth: CGFloat  = 48
    @ScaledMetric private var badgeHeight: CGFloat = 52

    var body: some View {
        VStack(spacing: 1) {
            Text(date.formatted(DesMoinesTime.style(.dateTime.weekday(.short))).uppercased())
                .font(.system(size: labelSize, weight: .bold))
                .foregroundStyle(Color.accentColor)
            Text(date.formatted(DesMoinesTime.style(.dateTime.day())))
                .font(.system(size: daySize, weight: .bold))
                .foregroundStyle(.primary)
            Text(date.formatted(DesMoinesTime.style(.dateTime.month(.abbreviated))).uppercased())
                .font(.system(size: labelSize, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(width: badgeWidth, height: badgeHeight)
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Unified skeletons (one per variant)

struct ContentCardSkeleton: View {
    let variant: ContentCard.Variant

    init(_ variant: ContentCard.Variant) { self.variant = variant }

    var body: some View {
        switch variant {
        case .featured:
            VStack(alignment: .leading, spacing: 8) {
                Skeleton.block(height: 150, radius: 14).frame(width: 260)
                Skeleton.bar(width: 200)
                Skeleton.bar(width: 120, height: 12)
            }
            .frame(width: 260)
            .accessibilityHidden(true)

        case .compact:
            VStack(alignment: .leading, spacing: 8) {
                Skeleton.block(height: 110, radius: 12).frame(width: 180)
                Skeleton.bar(width: 140)
                Skeleton.bar(width: 90, height: 12)
            }
            .frame(width: 180)
            .accessibilityHidden(true)

        case .standard:
            VStack(alignment: .leading, spacing: 0) {
                Skeleton.block(height: 180, radius: 0)
                VStack(alignment: .leading, spacing: 8) {
                    Skeleton.bar(height: 18).padding(.trailing, 40)
                    Skeleton.bar(width: 160, height: 12)
                    Skeleton.bar(width: 120, height: 12)
                    Skeleton.bar(width: 60, height: 22, radius: 10)
                }
                .padding(14)
            }
            .glassCard(cornerRadius: 18, material: .regularMaterial, elevation: PremiumTokens.elevation4)
            .accessibilityHidden(true)

        case .listRow:
            HStack(spacing: 14) {
                Skeleton.block(height: 100, radius: 12).frame(width: 100)
                VStack(alignment: .leading, spacing: 6) {
                    Skeleton.bar(height: 16)
                    Skeleton.bar(width: 90, height: 12)
                    Skeleton.bar(width: 60, height: 10)
                    Skeleton.bar(width: 120, height: 10)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .glassCard(cornerRadius: 16, material: .regularMaterial, elevation: PremiumTokens.elevation4)
            .accessibilityHidden(true)
        }
    }
}

// MARK: - Model adapters

extension Event {
    var cardData: ContentCardData {
        var pills: [CardPill] = []
        if isFree {
            pills.append(CardPill(icon: "ticket", text: "FREE", tint: .green))
        } else if let price, !price.isEmpty {
            pills.append(CardPill(icon: "ticket", text: price, tint: .blue))
        }

        var data = ContentCardData(
            id: id,
            title: title,
            imageUrl: imageUrl,
            placeholderIcon: eventCategory.icon,
            placeholderTint: eventCategory.color,
            categoryOverlay: eventCategory,
            dateBadge: parsedDate,
            pills: pills,
            urgency: urgencyLabel,
            isFeatured: isFeatured == true,
            favorite: .managed(kind: .event, id: id, title: title),
            accessibilityLabel: eventCardAccessibilityLabel
        )
        data.isSponsored = isActivelySponsored
        if let date = parsedDate {
            data.metaPrimary = CardMetaLine(icon: "clock", text: cardDateText(date))
        }
        data.metaSecondary = CardMetaLine(icon: "mappin", text: displayLocation)
        return data
    }

    /// The card's date line in Des Moines time, with " - Time TBA" instead of
    /// a placeholder time (IOS-DD-EVENTS-05). Internal so the Saved rows and
    /// the shared plan text use it too (IOS-DD-SAVED-11).
    func cardDateText(_ date: Date) -> String {
        let day = DesMoinesTime.style(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
        guard hasSpecificTime else { return date.formatted(day) + " - Time TBA" }
        return date.formatted(DesMoinesTime.style(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()))
            + DesMoinesTime.zoneSuffix(at: date)
    }

    /// Full label for the standalone (standard) card.
    private var eventCardAccessibilityLabel: String {
        var parts: [String] = [title]
        if let date = parsedDate {
            if hasSpecificTime {
                parts.append(date.formatted(DesMoinesTime.style(.dateTime.weekday(.wide).month(.wide).day().hour().minute()))
                    + (DesMoinesTime.deviceDiffersFromCentral(at: date) ? " Central time" : ""))
            } else {
                parts.append(date.formatted(DesMoinesTime.style(.dateTime.weekday(.wide).month(.wide).day())) + ", time to be announced")
            }
        }
        parts.append(displayLocation)
        if isFree { parts.append("Free event") }
        else if let price, !price.isEmpty { parts.append(price) }
        if isFeatured == true { parts.append("Featured event") }
        if let urgency = urgencyLabel { parts.append(urgency) }
        return parts.joined(separator: ". ")
    }
}

extension Restaurant {
    var cardData: ContentCardData {
        var pills: [CardPill] = []
        if let price = priceRange, !price.isEmpty {
            pills.append(CardPill(icon: nil, text: price, tint: .secondary, filled: false))
        }
        if let rating {
            pills.append(CardPill(icon: "star.fill", text: String(format: "%.1f", rating), tint: .primary, filled: false, iconTint: .yellow))
        }
        if let pill = statusPill {
            pills.append(pill)
        }

        var data = ContentCardData(
            id: id,
            title: name,
            imageUrl: imageUrl,
            placeholderIcon: "fork.knife",
            placeholderTint: .orange,
            pills: pills,
            favorite: .managed(kind: .restaurant, id: id, title: name),
            accessibilityLabel: cardAccessibilityLabel
        )
        data.isSponsored = isActivelySponsored
        data.awardBadge = BestOfWinners.shared.winnerLabel(forEntityId: id)
        if let cuisine, !cuisine.isEmpty {
            data.metaPrimary = CardMetaLine(icon: "fork.knife", text: cuisine)
        }
        if !displayLocation.isEmpty {
            data.metaSecondary = CardMetaLine(icon: "mappin", text: displayLocation)
        }
        return data
    }

    /// Lifecycle first (New / opening date / Closed), else the hours line
    /// (IOS-DD-RESTAURANTS-01 / 06). Nothing when the hours are unknown: a
    /// wrong "Open" costs more trust than a missing one. Internal so the Saved
    /// row shows the same status (IOS-DD-SAVED-27).
    var statusPill: CardPill? {
        switch lifecycle {
        case .newlyOpened:
            return CardPill(icon: "sparkles", text: "New", tint: .primary, filled: false, iconTint: .orange)
        case .openingSoon:
            return CardPill(icon: "calendar", text: openingLabel ?? "Opening soon", tint: .primary, filled: false, iconTint: .orange)
        case .closedPermanently:
            return CardPill(icon: "xmark.octagon", text: "Closed", tint: .primary, filled: false, iconTint: .red)
        case .open, .closedTemporarily:
            break
        }
        let status = openStatus()
        guard let line = status.line else { return nil }
        let icon: String
        let tint: Color
        switch status {
        case .open:
            icon = "clock.badge.checkmark"; tint = .green
        case .closingSoon:
            icon = "clock.badge.exclamationmark"; tint = .orange
        case .closed:
            icon = "clock.badge.xmark"; tint = .red
        case .unknown:
            return nil
        }
        return CardPill(icon: icon, text: line, tint: .primary, filled: false, iconTint: tint)
    }
}

extension Attraction {
    var cardData: ContentCardData {
        var pills: [CardPill] = []
        // Free only when the row says so; null is unknown (IOS-DD-BROWSE-09).
        if isFree == true {
            pills.append(CardPill(icon: "gift", text: "Free", tint: .primary, filled: false, iconTint: .green))
        }
        if let rating {
            pills.append(CardPill(icon: "star.fill", text: String(format: "%.1f", rating), tint: .yellow, filled: false))
        }
        if let pill = openStatusPill {
            pills.append(pill)
        }

        var data = ContentCardData(
            id: id,
            title: name,
            imageUrl: imageUrl,
            placeholderIcon: attractionType.icon,
            placeholderTint: .purple,
            pills: pills,
            isFeatured: isFeatured == true,
            favorite: .managed(kind: .attraction, id: id, title: name),
            accessibilityLabel: compactCardAccessibilityLabel
        )
        data.awardBadge = BestOfWinners.shared.winnerLabel(forEntityId: id)
        // The paid placement is labelled like Event and Restaurant (IOS-DD-BROWSE-09).
        data.isSponsored = isActivelySponsored
        data.metaPrimary = CardMetaLine(icon: attractionType.icon, text: typeLabel)
        if let location, !location.isEmpty {
            data.metaSecondary = CardMetaLine(icon: "mappin", text: location)
        }
        return data
    }

    /// The stored type when it is not one of the nine known ones ("Park/Art"),
    /// instead of "Other".
    var typeLabel: String {
        let raw = type.trimmingCharacters(in: .whitespacesAndNewlines)
        if attractionType == .other, !raw.isEmpty { return raw }
        return attractionType.displayName
    }

    /// Today's hours as a pill, styled like the restaurant one; nothing when
    /// unknown (IOS-DD-BROWSE-10).
    var openStatusPill: CardPill? {
        let status = openStatus()
        guard let line = status.line else { return nil }
        switch status {
        case .open:
            return CardPill(icon: "clock.badge.checkmark", text: line, tint: .primary, filled: false, iconTint: .green)
        case .closingSoon:
            return CardPill(icon: "clock.badge.exclamationmark", text: line, tint: .primary, filled: false, iconTint: .orange)
        case .closed:
            return CardPill(icon: "clock.badge.xmark", text: line, tint: .primary, filled: false, iconTint: .red)
        case .unknown:
            return nil
        }
    }
}

#Preview {
    ScrollView {
        VStack(spacing: 16) {
            ScrollView(.horizontal) {
                HStack(spacing: 14) {
                    ContentCard(Event.preview.cardData, variant: .featured, decorative: true)
                    ContentCardSkeleton(.featured)
                }
                .padding(.horizontal)
            }
            ContentCard(Event.preview.cardData, variant: .standard)
            ContentCardSkeleton(.standard)
            ContentCard(Restaurant.preview.cardData, variant: .listRow)
            ContentCard(Attraction.preview.cardData, variant: .listRow)
            ContentCardSkeleton(.listRow)
        }
        .padding()
    }
}
