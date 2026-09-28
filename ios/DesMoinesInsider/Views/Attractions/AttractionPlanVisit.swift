import SwiftUI

/// "Plan your visit" on attraction detail (IOS-DD-BROWSE-10): today's status,
/// the weekly hours (or the free-text summary), the facts the row states, and
/// accessibility notes. Every part renders only when its column says
/// something; an attraction with none of them shows nothing at all.
struct AttractionPlanVisitSection: View {
    let attraction: Attraction
    var now: Date = Date()

    private var rows: [AttractionHours.Row] {
        attraction.hours.map { AttractionHours.weeklyRows($0, now: now) } ?? []
    }

    private var summary: String? {
        guard let text = attraction.hoursSummary?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else { return nil }
        return text
    }

    private var notes: String? {
        guard let text = attraction.accessibilityNotes?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else { return nil }
        return text
    }

    private struct Fact: Hashable {
        let icon: String
        let text: String
    }

    private var facts: [Fact] {
        var out: [Fact] = []
        if let free = attraction.isFree {
            out.append(free ? Fact(icon: "gift", text: "Free admission") : Fact(icon: "ticket", text: "Paid admission"))
        }
        if attraction.isKidFriendly == true {
            out.append(Fact(icon: "figure.and.child.holdinghands", text: "Good for kids"))
        }
        if let indoor = attraction.isIndoor {
            out.append(indoor ? Fact(icon: "house", text: "Indoor") : Fact(icon: "sun.max", text: "Outdoor"))
        }
        return out
    }

    private var hasContent: Bool {
        attraction.openStatus(at: now).line != nil || !rows.isEmpty || summary != nil || !facts.isEmpty || notes != nil
    }

    var body: some View {
        if hasContent {
            VStack(alignment: .leading, spacing: 12) {
                Text("Plan your visit")
                    .appText(.title)
                    .accessibilityAddTraits(.isHeader)
                statusLine
                hoursBlock
                factPills
                notesBlock
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
    }

    @ViewBuilder
    private var statusLine: some View {
        if let pill = attraction.openStatusPill {
            HStack(spacing: 6) {
                if let icon = pill.icon {
                    Image(systemName: icon)
                        .foregroundStyle(pill.iconTint ?? .secondary)
                        .accessibilityHidden(true)
                }
                Text(pill.text)
                    .appText(.bodyEmphasized)
            }
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder
    private var hoursBlock: some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(rows, id: \.label) { row in
                    HStack {
                        Text(row.label)
                        Spacer()
                        Text(row.text ?? "Not listed")
                            .foregroundStyle(row.text == nil ? .secondary : .primary)
                    }
                    .appText(row.isToday ? .bodyEmphasized : .bodySmall)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(row.label)\(row.isToday ? ", today" : ""): \(row.text ?? "hours not listed")")
                }
                Text("Times are Des Moines (Central) time.")
                    .appText(.caption)
                    .foregroundStyle(.secondary)
            }
        } else if let summary {
            Label(summary, systemImage: "clock")
                .appText(.bodySmall)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var factPills: some View {
        if !facts.isEmpty {
            HStack(spacing: 8) {
                ForEach(facts, id: \.self) { fact in
                    Label(fact.text, systemImage: fact.icon)
                        .appText(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
            }
        }
    }

    @ViewBuilder
    private var notesBlock: some View {
        if let notes {
            VStack(alignment: .leading, spacing: 4) {
                Text("Accessibility")
                    .appText(.bodyEmphasized)
                    .accessibilityAddTraits(.isHeader)
                Text(notes)
                    .appText(.bodySmall)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
