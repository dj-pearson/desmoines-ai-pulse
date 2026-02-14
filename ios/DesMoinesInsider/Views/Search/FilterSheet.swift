import SwiftUI

/// Filter sheet for events on the home screen.
struct FilterSheet: View {
    @Binding var selectedCategory: EventCategory?
    @Binding var selectedDatePreset: DateFilterPreset?
    @Binding var showFeaturedOnly: Bool
    var onClear: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // Category
                Section("Category") {
                    ForEach(EventCategory.allCases) { category in
                        Button {
                            selectedCategory = selectedCategory == category ? nil : category
                        } label: {
                            HStack {
                                Image(systemName: category.icon)
                                    .foregroundStyle(category.color)
                                    .frame(width: 24)
                                Text(category.displayName)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if selectedCategory == category {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Color.accentColor)
                                        .fontWeight(.semibold)
                                }
                            }
                        }
                    }
                }

                // Date
                Section("When") {
                    ForEach(DateFilterPreset.allCases) { preset in
                        Button {
                            selectedDatePreset = selectedDatePreset == preset ? nil : preset
                        } label: {
                            HStack {
                                Text(preset.rawValue)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if selectedDatePreset == preset {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Color.accentColor)
                                        .fontWeight(.semibold)
                                }
                            }
                        }
                    }
                }

                // Options
                Section("Options") {
                    Toggle("Featured Events Only", isOn: $showFeaturedOnly)
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Clear") {
                        onClear()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
}

#Preview {
    FilterSheet(
        selectedCategory: .constant(.music),
        selectedDatePreset: .constant(.today),
        showFeaturedOnly: .constant(false),
        onClear: {}
    )
}
