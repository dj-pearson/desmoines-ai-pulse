import SwiftUI

// MARK: - Save Search button (IOS-PARITY-008)

/// Toolbar button that saves the current search. Owns the name sheet, the
/// paywall and the sign-in sheet; the host (SearchView) owns the toast, which
/// a toolbar item cannot reliably show (IOS-DD-SEARCH-11). Free users still
/// see it and hit the contextual paywall.
struct SaveSearchButton: View {
    let query: String
    let tab: String?
    let parsed: ParsedSearch
    let hadEventResults: Bool
    @Binding var toast: ToastMessage?

    @State private var model = SavedSearchesViewModel.shared
    @State private var route: Route?
    /// What to present once the current sheet is gone. Flipping one sheet off
    /// and another on in the same transaction drops the second
    /// (IOS-DD-SEARCH-11).
    @State private var afterDismiss: Route?
    @State private var limitAfterDismiss = false
    @State private var showLimit = false
    @State private var limitValue = 0
    @State private var confirmRemove = false

    enum Route: String, Identifiable {
        case name, paywall, signIn
        var id: String { rawValue }
    }

    private var existing: SavedSearch? { model.existing(for: query) }

    var body: some View {
        Button(action: tapped) {
            Image(systemName: existing != nil ? "bookmark.fill" : "bookmark")
        }
        .accessibilityLabel(existing.map { "Saved search: \($0.name)" } ?? "Save this search")
        .sheet(item: $route, onDismiss: presentNext) { route in
            sheet(for: route)
        }
        .confirmationDialog("Remove this saved search?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove saved search", role: .destructive) { Task { await remove() } }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Saved search limit reached", isPresented: $showLimit) {
            if StoreKitService.shared.currentTier != .vip {
                Button("Upgrade to VIP") { route = .paywall }
            }
            Button("OK", role: .cancel) {}
        } message: {
            Text("You've saved \(limitValue) searches, your plan's limit. Remove one from your Dashboard to save this one.")
        }
        .task { await model.load() }
    }

    @ViewBuilder
    private func sheet(for route: Route) -> some View {
        switch route {
        case .name:
            SaveSearchSheet(defaultName: query) { name in await save(name) }
        case .paywall:
            PaywallView(context: .savedSearches)
        case .signIn:
            NavigationStack {
                AuthView(isModal: true)
                    .navigationTitle("Sign in to save searches")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
    }

    private func tapped() {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        if existing != nil {
            confirmRemove = true
        } else if !model.isAuthenticated {
            route = .signIn
        } else if !StoreKitService.shared.hasFeature(.saveSearches) {
            route = .paywall
        } else {
            route = .name
        }
    }

    private func presentNext() {
        if limitAfterDismiss {
            limitAfterDismiss = false
            showLimit = true
        }
        guard let next = afterDismiss else { return }
        afterDismiss = nil
        route = next
    }

    private func save(_ name: String) async {
        let outcome = await model.saveCurrentSearch(
            query: query,
            tab: tab,
            name: name,
            parsed: parsed,
            hadEventResults: hadEventResults
        )
        switch outcome {
        case .success:
            toast = .success("Search saved", icon: "bookmark.fill")
            route = nil
        case .duplicate:
            toast = .info("You've already saved this search", icon: "bookmark.fill")
            route = nil
        case .needsUpgrade:
            afterDismiss = .paywall
            route = nil
        case .notAuthenticated:
            afterDismiss = .signIn
            route = nil
        case .limitReached(let n):
            limitValue = n
            limitAfterDismiss = true
            route = nil
        case .notEligible, .failure:
            // Dismissed so the toast, which SearchView draws under the sheet,
            // is actually seen.
            toast = .error("Couldn't save search", icon: "exclamationmark.triangle")
            route = nil
        }
    }

    private func remove() async {
        guard let search = existing else { return }
        if await model.delete(search) {
            toast = .info("Removed", icon: "bookmark.slash")
        } else {
            toast = .error(model.errorMessage ?? "Couldn't remove that saved search.")
        }
    }
}

/// Name-your-search sheet.
private struct SaveSearchSheet: View {
    let defaultName: String
    let onSave: (String) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var saving = false

    /// Seeded here rather than in onAppear (IOS-AUDIT-UX-059).
    ///
    /// onAppear ran `if name.isEmpty { name = defaultName }`, which fires again
    /// whenever the sheet reappears - so a user who deliberately cleared the
    /// field got the default typed back in underneath them. State that belongs
    /// to a view's identity belongs in its initializer.
    init(defaultName: String, onSave: @escaping (String) async -> Void) {
        self.defaultName = defaultName
        self.onSave = onSave
        _name = State(initialValue: String(defaultName.prefix(SavedSearchesViewModel.maxNameLength)))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name this search") {
                    TextField("e.g. Free weekend events", text: $name)
                }
                Section {
                    // Alerts are a nightly email for event searches
                    // (IOS-DD-SEARCH-10); this used to promise notifications.
                    Text("Save \"\(defaultName)\" to jump back in anytime. Event searches can email you new matches each night.")
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
        }
    }
}

// MARK: - Saved searches manage list (used in Dashboard)

/// Renders the user's saved searches with alert toggles, delete, and a tap that
/// deep-links to the live results. Loading, error, empty and locked states
/// included so the Dashboard section is never a dead end (IOS-DD-SEARCH-12).
struct SavedSearchesList: View {
    @State private var model = SavedSearchesViewModel.shared
    @State private var showPaywall = false
    @State private var pendingDelete: SavedSearch?
    @State private var showLimit = false
    @State private var limitValue = 0
    @State private var toast: ToastMessage?

    var body: some View {
        content
            .sheet(isPresented: $showPaywall) { PaywallView(context: .customAlerts) }
            .confirmationDialog(
                "Delete \"\(pendingDelete?.name ?? "")\"?",
                isPresented: deleteDialogShown,
                titleVisibility: .visible,
                presenting: pendingDelete
            ) { search in
                Button("Delete", role: .destructive) { Task { await delete(search) } }
                Button("Cancel", role: .cancel) {}
            }
            .alert("Alert limit reached", isPresented: $showLimit) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("You're using all \(limitValue) alerts on your plan. Turn one off to add another.")
            }
            .toastOverlay(message: $toast)
            // Keyed on the user so switching accounts reloads rather than
            // showing the previous account's rows.
            .task(id: AuthService.shared.currentUser?.id) { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        if !model.isAuthenticated {
            hint("Sign in to save searches and get alerts for new matches.")
        } else if model.isLoading && model.savedSearches.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        } else if model.errorMessage != nil && model.savedSearches.isEmpty {
            errorRow
        } else if model.savedSearches.isEmpty {
            hint("Save a search from the Search tab to jump back to it. Event searches can email you new matches.")
        } else {
            VStack(spacing: 8) {
                ForEach(model.savedSearches) { search in
                    row(search)
                }
            }
            .padding(.horizontal)
        }
    }

    private var errorRow: some View {
        HStack {
            Text("Couldn't load your saved searches.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
            Button("Try again") { Task { await model.load() } }
                .font(.footnote.weight(.semibold))
                .minHitTarget()
        }
        .padding(.horizontal)
    }

    private var deleteDialogShown: Binding<Bool> {
        Binding(
            get: { pendingDelete != nil },
            set: { if !$0 { pendingDelete = nil } }
        )
    }

    private func row(_ search: SavedSearch) -> some View {
        HStack(spacing: 12) {
            NavigationLink(value: search) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(search.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(1)
                    Text(subtitle(search)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .buttonStyle(.plain)

            alertControl(search)

            Button(role: .destructive) {
                pendingDelete = search
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

    /// The bell, only where the nightly email can deliver (IOS-DD-SEARCH-10).
    @ViewBuilder
    private func alertControl(_ search: SavedSearch) -> some View {
        if search.isAlertEligible || search.promotesToEventList {
            Button {
                Task { await toggle(search) }
            } label: {
                Image(systemName: search.alertsEnabled ? "bell.fill" : "bell")
                    .foregroundStyle(search.alertsEnabled ? Color.accentColor : .secondary)
            }
            .buttonStyle(.plain)
            // 44pt targets so the bell and the destructive trash aren't
            // mis-tapped against each other or the row link (IOS-AUDIT-UX-044).
            .minHitTarget()
            .accessibilityLabel("Email alerts for \(search.name)")
            .accessibilityValue(search.alertsEnabled ? "On" : "Off")
            .accessibilityAddTraits(.isToggle)
        } else {
            Text("Alerts cover event searches")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 96)
        }
    }

    /// The words, or for a web search saved with filters only, the filters.
    private func subtitle(_ search: SavedSearch) -> String {
        if !search.query.isEmpty { return "\"\(search.query)\"" }
        let labels = search.structuredFilters.chips.map(\.label)
        return labels.isEmpty ? "Saved on the web" : labels.joined(separator: ", ")
    }

    private func toggle(_ search: SavedSearch) async {
        let enabling = !search.alertsEnabled
        let outcome = await model.toggleAlert(search)
        switch outcome {
        case .success:
            HapticFeedback.shared.selection()
            toast = enabling
                ? .success("We'll email you new matching events each night", icon: "envelope.fill")
                : .info("Alerts off for \(search.name)", icon: "bell.slash")
        case .needsUpgrade:
            showPaywall = true
        case .limitReached(let n):
            limitValue = n
            showLimit = true
        case .notEligible:
            toast = .info("Alerts cover event searches")
        case .notAuthenticated:
            toast = .error("Sign in to turn on alerts")
        case .duplicate:
            break
        case .failure:
            toast = .error(model.errorMessage ?? "Couldn't update the alert.")
        }
    }

    private func delete(_ search: SavedSearch) async {
        if await model.delete(search) {
            toast = .info("Deleted \(search.name)", icon: "trash")
        } else {
            toast = .error(model.errorMessage ?? "Couldn't delete that saved search.")
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)
    }
}
