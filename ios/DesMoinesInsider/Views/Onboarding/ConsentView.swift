import SwiftUI

/// GDPR consent screen shown during onboarding for EU users.
/// Explains what data is collected and why, with opt-in toggles.
struct ConsentView: View {
    @State private var consent = ConsentService.shared
    @State private var locationEnabled = true
    @State private var emailEnabled = true
    @State private var analyticsEnabled = true

    let onComplete: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: "hand.raised.fill")
                            .font(.largeTitle)
                            .foregroundStyle(Color.accentColor)
                            .accessibilityHidden(true)

                        Text("Your Privacy Matters")
                            .font(.title2.bold())

                        Text("We need your consent to collect certain data to provide the best experience. You can change these settings anytime in Settings > Privacy & Data.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top)

                    // Consent toggles
                    VStack(spacing: 16) {
                        consentToggle(
                            icon: "location.fill",
                            title: "Location",
                            description: "Show nearby events, restaurants, and distances. Your location is never shared with third parties.",
                            isOn: $locationEnabled
                        )

                        consentToggle(
                            icon: "envelope.fill",
                            title: "Email",
                            description: "Receive event reminders and weekly digest. You can unsubscribe anytime.",
                            isOn: $emailEnabled
                        )

                        consentToggle(
                            icon: "chart.bar.fill",
                            title: "Analytics",
                            description: "Help us improve the app with anonymous usage data. No personal information is collected.",
                            isOn: $analyticsEnabled
                        )
                    }

                    // Buttons
                    VStack(spacing: 12) {
                        Button {
                            consent.locationConsent = locationEnabled
                            consent.emailConsent = emailEnabled
                            consent.analyticsConsent = analyticsEnabled
                            consent.saveAndComplete()
                            onComplete()
                        } label: {
                            Text("Save Preferences")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.accentColor)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        Button {
                            consent.acceptAll()
                            onComplete()
                        } label: {
                            Text("Accept All")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                    .padding(.top, 8)
                }
                .padding(.horizontal)
            }
            .navigationTitle("Data Privacy")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func consentToggle(
        icon: String,
        title: String,
        description: String,
        isOn: Binding<Bool>
    ) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.accentColor)
                .frame(width: 28)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Toggle("", isOn: isOn)
                .labelsHidden()
                .accessibilityLabel("\(title) data collection")
        }
        .padding()
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
    }
}
