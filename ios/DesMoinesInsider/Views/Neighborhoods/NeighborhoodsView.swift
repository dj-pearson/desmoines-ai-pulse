import SwiftUI

/// Neighborhoods hub (IOS-PARITY-006). Lists Des Moines areas/suburbs; tapping
/// one opens a curated detail with dining, attractions, and events in that
/// neighborhood (plus a "nearby" location integration).
struct NeighborhoodsView: View {
    var ownsNavigationStack: Bool = true

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Explore Des Moines by neighborhood — find the dining, attractions, and events that define each area.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
                    .padding(.top, 4)

                LazyVStack(spacing: 12) {
                    ForEach(Neighborhood.all) { neighborhood in
                        NavigationLink(value: neighborhood) {
                            row(neighborhood)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
            .padding(.bottom, 24)
        }
        .navigationTitle("Neighborhoods")
        .navigationBarTitleDisplayMode(.large)
        .navigationDestination(for: Neighborhood.self) { NeighborhoodDetailView(neighborhood: $0) }
    }

    private func row(_ neighborhood: Neighborhood) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "building.2.fill")
                    .foregroundStyle(Color.accentColor)
                Text(neighborhood.name)
                    .font(.headline)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            Text(neighborhood.blurb)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            if !neighborhood.highlights.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(neighborhood.highlights, id: \.self) { highlight in
                            Text(highlight)
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color(.tertiarySystemFill), in: Capsule())
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(neighborhood.name). \(neighborhood.blurb)")
        .accessibilityHint("Opens the neighborhood guide")
    }
}

#Preview {
    NeighborhoodsView()
}
