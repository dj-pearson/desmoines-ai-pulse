import SwiftUI

// MARK: - IOS-ADS-015 · Labeled sponsored pick (AI discovery flows)
//
// A clearly-labeled "Sponsored" card used inside Ask Pulse / Surprise Me / Trip
// Planner. Self-contained tracking + presentation so call sites only hand it a
// `SponsoredPick` and a `surface`:
//   • Impression is logged on real viewability (≥50% for ≥1s, IOS-ADS-014) and
//     deduped per session via AdTrackingService.
//   • Tap logs a sponsored click and opens the listing in the in-app browser
//     (Guideline-friendly), mirroring AdBannerView's sponsored handling.
//
// Free-tier gating is owned upstream (SponsoredPickService returns nil for
// premium), so this card simply renders whatever pick it's given.
struct SponsoredPickCard: View {
    let pick: SponsoredPickService.SponsoredPick
    let surface: SponsoredPickService.Surface

    private let service = SponsoredPickService.shared
    @State private var browseTarget: AdTarget?

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            service.logClick(pick, surface: surface)
            if let url = listingURL { browseTarget = AdTarget(url: url) }
        } label: {
            HStack(spacing: 12) {
                thumbnail

                VStack(alignment: .leading, spacing: 4) {
                    Text("Sponsored")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(pick.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text(pick.reason)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.accentColor.opacity(0.25), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .trackAdViewability {
            service.logImpression(pick, surface: surface)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sponsored: \(pick.title). \(pick.reason)")
        .accessibilityHint("Opens this sponsored listing")
        .accessibilityAddTraits(.isLink)
        .sheet(item: $browseTarget) { target in
            NavigationStack {
                WebViewPage(title: "Sponsored", url: target.url)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Done") { browseTarget = nil }
                        }
                    }
            }
        }
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let imageUrl = pick.imageUrl, !imageUrl.isEmpty {
            CachedAsyncImage(url: imageUrl) {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(.systemGray6))
            }
            .frame(width: 56, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        } else {
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.accentColor.opacity(0.12))
                .frame(width: 56, height: 56)
                .overlay {
                    Image(systemName: pick.itemType == "event" ? "calendar" : "fork.knife")
                        .foregroundStyle(.tint)
                }
        }
    }

    /// Canonical web URL for the sponsored listing (public route).
    private var listingURL: URL? {
        let path = pick.itemType == "event" ? "events" : "restaurants"
        return URL(string: "\(Config.siteURL.absoluteString)/\(path)/\(pick.itemId)")
    }
}
