import SwiftUI

/// The detail content the row already carries and the screen never showed
/// (IOS-DD-EVENTS-21): the AI writeup when it is not already the description,
/// geo_key_facts as a short list, and geo_faq as expandable questions. The web
/// detail page renders all three. Renders nothing when all are empty.
struct EventDetailGoodToKnow: View {
    let event: Event

    /// The writeup, when it adds something. displayDescription prefers the
    /// enhanced description, so an existing writeup was hidden behind it.
    static func insiderTake(for event: Event) -> String? {
        guard let writeup = event.aiWriteup?.trimmingCharacters(in: .whitespacesAndNewlines),
              !writeup.isEmpty,
              writeup != event.displayDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        else { return nil }
        return writeup
    }

    static func keyFacts(for event: Event) -> [String] {
        (event.geoKeyFacts ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    static func faq(for event: Event) -> [EventFAQ] {
        (event.geoFaq ?? []).filter {
            !$0.question.trimmingCharacters(in: .whitespaces).isEmpty
                && !$0.answer.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }

    var body: some View {
        let take = Self.insiderTake(for: event)
        let facts = Self.keyFacts(for: event)
        let questions = Self.faq(for: event)

        if take != nil || !facts.isEmpty || !questions.isEmpty {
            VStack(alignment: .leading, spacing: 18) {
                if let take {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Insider take")
                            .font(.title3.bold())
                            .accessibilityAddTraits(.isHeader)
                        Text(take)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .lineSpacing(4)
                    }
                }

                if !facts.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Good to know")
                            .font(.title3.bold())
                            .accessibilityAddTraits(.isHeader)
                        ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                                    .accessibilityHidden(true)
                                Text(fact)
                                    .font(.subheadline)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }

                if !questions.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Questions")
                            .font(.title3.bold())
                            .accessibilityAddTraits(.isHeader)
                        ForEach(Array(questions.enumerated()), id: \.offset) { _, item in
                            DisclosureGroup {
                                Text(item.answer)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.top, 4)
                            } label: {
                                Text(item.question)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                                    .multilineTextAlignment(.leading)
                            }
                            .padding(.vertical, 6)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
    }
}

#Preview {
    ScrollView {
        EventDetailGoodToKnow(event: .preview)
    }
}
