import SwiftUI

// MARK: - Save Search button (IOS-PARITY-008)

/// Toolbar button that saves the current search. Self-contained: owns the name
/// sheet + paywall + toast, so the host (SearchView) just drops it in. Free
/// users still see it and hit the contextual paywall.
struct SaveSearchButton: View {
    let query: String
    let tab: String?

    @State private var model = SavedSearchesViewModel.shared
    @State private var showSheet = false
    @State private var showPaywall = false
    @State private var toast: ToastMessage?

    var body: some View {
        Button {
            guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return }
            if !model.isAuthenticated || !StoreKitService.shared.hasFeature(.saveSearches) {
                showPaywall = true
            } else {
                showSheet = true
            }
        } label: {
            Image(systemName: "bookmark")
        }
        .accessibilityLabel("Save this search")
        .sheet(isPresented: $showSheet) {
            SaveSearchSheet(defaultName: query) { name in
                let outcome = await model.saveCurrentSearch(query: query, tab: tab, name: name)
                switch outcome {
                case .success:
                    toast = .success("Search saved", icon: "bookmark.fill")
                    showSheet = false
                case .needsUpgrade, .limitReached:
                    showSheet = false
                    showPaywall = true
                case .notAuthenticated:
                    showSheet = false
                case .failure:
                    toast = .error("Couldn't save search", icon: "exclamationmark.triangle")
                }
            }
        }
        .sheet(isPresented: $showPaywall) {
            PaywallView(context: .savedSearches)
        }
        .toastOverlay(message: $toast)
        .task { await model.load() }
    }
}

/// Name-your-search sheet.
private struct SaveSearchSheet: View {
    let defaultName: String
    let onSave: (String) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Name this search") {
                    TextField("e.g. Free weekend events", text: $name)
                }
                Section {
                    Text("Save the search “\(defaultName)” to jump back in anytime — and turn on alerts to get notified about new matches.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Save Search")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Cancel is disabled while saving: dismissing mid-write leaves
                // the save running against a sheet that is gone, so the user
                // sees neither a success nor the error (IOS-AUDIT-UX-053).
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Save") {
                            saving = true
                            // Trim before saving and block empty/whitespace-only
                            // names so we don't create an unlabeled search
                            // (IOS-AUDIT-UX-044).
                            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                            Task { await onSave(trimmed); saving = false }
                        }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .onAppear { if name.isEmpty { name = defaultName } }
        }
    }
}

// MARK: - Saved searches manage list (used in Dashboard)

/// Renders the user's saved searches with alert toggles, delete, and a tap that
/// deep-links to the live results. Empty/locked states included so the
/// Dashboard section is never a dead end.
struct SavedSearchesList: View {
    @State private var model = SavedSearchesViewModel.shared
    @State private var showPaywall = false

    var body: some View {
        Group {
            if !model.isAuthenticated {
                hint("Sign in to save searches and get alerts for new matches.")
            } else if model.savedSearches.isEmpty {
                hint("Save a search from the Search tab to get alerts when new matches are added.")
            } else {
                VStack(spacing: 8) {
                    ForEach(model.savedSearches) { search in
                        row(search)
                    }
                }
                .padding(.horizontal)
            }
        }
        .sheet(isPresented: $showPaywall) { PaywallView(context: .customAlerts) }
        .task { await model.load() }
    }

    private func row(_ search: SavedSearch) -> some View {
        HStack(spacing: 12) {
            NavigationLink(value: search) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(search.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(1)
                    Text("“\(search.query)”").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .buttonStyle(.plain)

            Button {
                Task {
                    let outcome = await model.toggleAlert(search)
                    if outcome == .needsUpgrade { showPaywall = true }
                }
            } label: {
                Image(systemName: search.alertsEnabled ? "bell.fill" : "bell")
                    .foregroundStyle(search.alertsEnabled ? Color.accentColor : .secondary)
            }
            .buttonStyle(.plain)
            // 44pt targets so the bell and the destructive trash aren't
            // mis-tapped against each other or the row link (IOS-AUDIT-UX-044).
            .minHitTarget()
            .accessibilityLabel(search.alertsEnabled ? "Alerts on for \(search.name)" : "Turn on alerts for \(search.name)")

            Button(role: .destructive) {
                Task { await model.delete(search) }
            } label: {
                Image(systemName: "trash").foregroundStyle(.red)
            }
            .buttonStyle(.plain)
            .minHitTarget()
            .accessibilityLabel("Delete \(search.name)")
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)
    }
}
