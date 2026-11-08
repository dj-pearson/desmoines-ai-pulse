import SwiftUI

/// One annual event series, the native /events/series/<slug> page
/// (IOS-AUDIT-FEAT-046, src/pages/EventSeriesPage.tsx): the series name and
/// blurb, this year's dates or "<year> date not announced yet", then past
/// years newest first.
///
/// Rows push `Event` values, so it must sit in a NavigationStack that
/// registers `Event` (DeepLinkResolverView does). A row opens with the Event
/// the series read already carries, never a fetch by id: an archived past
/// edition is linked on the web, and `fetchEvent(id:)` refuses archived rows,
/// so a re-read would say the listing is gone. A row the stale sweep hid has
/// no page on the web either and is plain text here.
struct EventSeriesView: View {
    @State private var viewModel: EventSeriesViewModel

    init(def: EventSeriesDef) {
        _viewModel = State(wrappedValue: EventSeriesViewModel(def: def))
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(viewModel.def.name).font(.title.bold())
                    Text(viewModel.def.about).font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
            }
            content
        }
        .listStyle(.insetGrouped)
        .navigationTitle(viewModel.def.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: viewModel.shareURL) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }
        }
        .refreshable { await viewModel.load() }
        .task { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        if let schedule = viewModel.schedule {
            Section(viewModel.currentHeading ?? "") {
                if let current = schedule.current {
                    editionRows(current)
                } else if let year = schedule.unannouncedYear {
                    Text("\(EventSeriesSchedule.unannouncedLabel(year)). The date shows here once the organiser publishes it.")
                        .foregroundStyle(.secondary)
                }
            }
            ForEach(schedule.past) { edition in
                Section {
                    editionRows(edition)
                } header: {
                    Text(String(edition.year))
                } footer: {
                    Text(editionSummary(edition))
                }
            }
        } else if viewModel.isLoading {
            Section {
                ProgressView("Loading dates...")
                    .frame(maxWidth: .infinity)
            }
        } else if viewModel.loadError != nil {
            Section {
                ContentUnavailableView {
                    Label("Couldn't load the dates", systemImage: "wifi.exclamationmark")
                } description: {
                    Text("Check your connection and try again.")
                } actions: {
                    Button("Try Again") { Task { await viewModel.load() } }
                }
                .reloadOnReconnect(if: true) { await viewModel.load() }
            }
        }
    }

    /// "Friday, October 2, 2026, Water Works Park": the web's past-year line.
    private func editionSummary(_ edition: SeriesEdition) -> String {
        let dates = EventSeriesSchedule.editionDateLabel(edition)
        return edition.venues.isEmpty ? dates : "\(dates), \(edition.venues.joined(separator: " and "))"
    }

    @ViewBuilder
    private func editionRows(_ edition: SeriesEdition) -> some View {
        ForEach(edition.instances) { instance in
            if instance.linkId != nil {
                NavigationLink(value: instance.row.event) { instanceLine(instance) }
            } else {
                instanceLine(instance)
            }
        }
    }

    private func instanceLine(_ instance: SeriesInstance) -> some View {
        let event = instance.row.event
        let when = EventSeriesSchedule.dayWords(instance.day, pattern: "EEE, MMM d")
        let place = [event.venue, event.location]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
        let time = event.hasSpecificTime
            ? event.parsedDate?.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: DesMoinesTime.timeZone))
            : nil
        let detail = [time, place].compactMap { $0 }.joined(separator: " - ")
        return VStack(alignment: .leading, spacing: 2) {
            Text("\(when): \(event.title)").font(.body.weight(.medium))
            if !detail.isEmpty {
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}
