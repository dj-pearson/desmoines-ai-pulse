import SwiftUI

/// The week's hours from hours_json (IOS-DD-RESTAURANTS-10), today in bold.
/// Renders nothing when the row has no weekday descriptions.
struct RestaurantDetailHours: View {
    let restaurant: Restaurant

    var body: some View {
        let rows = restaurant.hoursJson?.weekdayDescriptions ?? []
        if !rows.isEmpty {
            let today = Self.todayName()
            VStack(alignment: .leading, spacing: 8) {
                Text("Hours")
                    .font(.title3.bold())
                    .accessibilityAddTraits(.isHeader)

                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    let isToday = row.hasPrefix(today)
                    Text(row)
                        .font(.subheadline.weight(isToday ? .semibold : .regular))
                        .foregroundStyle(isToday ? .primary : .secondary)
                        .accessibilityLabel(isToday ? "Today, \(row)" : row)
                }

                Text("Hours from Google" + (DesMoinesTime.deviceDiffersFromCentral() ? ", in Central time" : ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal)
            .padding(.top, 4)
        }
    }

    /// Today's English weekday name in Des Moines, the prefix Google's
    /// weekdayDescriptions use ("Monday: 11:00 AM - 10:00 PM").
    static func todayName(at date: Date = Date()) -> String {
        let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        let weekday = DesMoinesTime.calendar.component(.weekday, from: date)
        return names[(weekday - 1 + 7) % 7]
    }
}

#Preview {
    RestaurantDetailHours(restaurant: .preview)
}
