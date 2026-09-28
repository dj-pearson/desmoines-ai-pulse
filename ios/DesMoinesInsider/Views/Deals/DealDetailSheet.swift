import SwiftUI
import UIKit

/// Everything about one deal (IOS-DD-GUIDES-12): what it is, the terms, when
/// it runs, the code to copy or the screen to show, and a way to the business.
/// The card only had room for the title and schedule, and description, terms
/// and end date were decoded but never shown.
///
/// Claiming records a redemption through DealsService.claimDeal, only when
/// signed in: increment_deal_redemption no longer counts anonymous calls
/// (20261015000004, IOS-DD-GUIDES-14). No redemption count or "verified"
/// badge is shown, matching the web DealCard.
struct DealDetailSheet: View {
    let deal: Deal
    /// Opens the related listing. Returns false when it couldn't be resolved.
    /// Nil when the deal has no listing to open.
    let onOpenBusiness: (() async -> Bool)?

    @Environment(\.dismiss) private var dismiss
    @State private var claimed = false
    @State private var showInstructions = false
    @State private var isOpening = false
    @State private var openError: String?
    @State private var toast: ToastMessage?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    headline
                    details
                    redeemSection
                    businessSection
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Deal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .toastOverlay(message: $toast)
        }
    }

    // MARK: - Sections

    private var headline: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(deal.valueLabel)
                    .font(.subheadline.weight(.bold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color(red: 0.86, green: 0.14, blue: 0.47), in: Capsule())
                    .foregroundStyle(.white)
                if deal.isFeaturedDeal { FeaturedDealBadge() }
            }
            Text(deal.title)
                .font(.title2.bold())
                .fixedSize(horizontal: false, vertical: true)
            Text(deal.businessName)
                .font(.headline)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var details: some View {
        if let description = deal.description, !description.isEmpty {
            Text(description)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
        }
        if deal.scheduleText != nil || deal.validityText != nil {
            section("When") {
                if let schedule = deal.scheduleText {
                    Label(schedule, systemImage: "clock")
                }
                if let validity = deal.validityText {
                    Label(validity, systemImage: "calendar")
                }
                if deal.isActiveNow() {
                    Label("Active now", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }
        }
        if let terms = deal.terms?.trimmingCharacters(in: .whitespacesAndNewlines), !terms.isEmpty {
            section("Terms") {
                Text(terms)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private var redeemSection: some View {
        if let code = deal.code?.trimmingCharacters(in: .whitespacesAndNewlines), !code.isEmpty {
            codeBlock(code)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Button {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    claimOnce()
                    showInstructions = true
                } label: {
                    Label("Use this deal", systemImage: "tag.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                if showInstructions {
                    Text("Show this screen at \(deal.businessName)")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(12)
                        .background(Color.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private func codeBlock(_ code: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Code")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(code)
                .font(.system(.title, design: .monospaced).weight(.bold))
                .textSelection(.enabled)
                .accessibilityLabel("Code \(code)")
            Button {
                UIPasteboard.general.string = code
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                toast = .success("Code copied", icon: "doc.on.doc.fill")
                claimOnce()
            } label: {
                Label("Copy code", systemImage: "doc.on.doc")
                    .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.bordered)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder
    private var businessSection: some View {
        if let onOpenBusiness {
            VStack(alignment: .leading, spacing: 6) {
                Button {
                    Task { await openBusiness(onOpenBusiness) }
                } label: {
                    HStack {
                        Label("Go to \(deal.businessName)", systemImage: "arrow.up.forward.square")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        if isOpening { ProgressView().controlSize(.small) }
                    }
                    .padding(.vertical, 10)
                }
                .disabled(isOpening)
                if let openError {
                    Label(openError, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
        }
    }

    // MARK: - Helpers

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .accessibilityAddTraits(.isHeader)
            content()
                .font(.subheadline)
        }
    }

    /// Records one redemption per sheet, only when signed in.
    private func claimOnce() {
        guard !claimed, AuthService.shared.isAuthenticated else { return }
        claimed = true
        let id = deal.id
        Task { await DealsService.shared.claimDeal(id: id) }
    }

    private func openBusiness(_ open: () async -> Bool) async {
        isOpening = true
        openError = nil
        let ok = await open()
        isOpening = false
        if !ok {
            openError = "Couldn't open \(deal.businessName). It may no longer be listed."
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }
}

/// An editorial pick. Not "Sponsored": nobody paid for it (IOS-DD-GUIDES-13).
struct FeaturedDealBadge: View {
    var body: some View {
        Label("Featured", systemImage: "sparkles")
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .foregroundStyle(.orange)
            .background(Color.orange.opacity(0.12), in: Capsule())
    }
}

#Preview {
    DealDetailSheet(deal: .preview, onOpenBusiness: nil)
}
