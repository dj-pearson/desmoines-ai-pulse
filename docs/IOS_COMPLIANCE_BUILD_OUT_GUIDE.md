# iOS App Compliance Build-Out Guide

**Last Updated**: February 17, 2026
**Purpose**: Development guide for making the Des Moines Insider iOS app fully compliant with Apple App Store Review Guidelines
**Audience**: Developers building out the native iOS app

---

## Table of Contents

1. [Gap Analysis — What Exists vs. What's Missing](#1-gap-analysis)
2. [Account Deletion (Required)](#2-account-deletion)
3. [StoreKit 2 Subscriptions (Required for IAP)](#3-storekit-2-subscriptions)
4. [Accessibility (Required)](#4-accessibility)
5. [Privacy & Permissions](#5-privacy--permissions)
6. [App Tracking Transparency](#6-app-tracking-transparency)
7. [Offline & Error States](#7-offline--error-states)
8. [Minimum Functionality Threshold](#8-minimum-functionality-threshold)
9. [Native UI Polish](#9-native-ui-polish)
10. [Settings & Legal Pages](#10-settings--legal-pages)
11. [Push Notifications](#11-push-notifications)
12. [Deep Linking & Universal Links](#12-deep-linking--universal-links)
13. [Performance & Stability](#13-performance--stability)
14. [TestFlight Beta Testing](#14-testflight-beta-testing)
15. [Implementation Priority & Timeline](#15-implementation-priority--timeline)

---

## 1. Gap Analysis

### What Already Exists (✅)

| Feature | Location | Status |
|---------|----------|--------|
| SwiftUI native app structure | `ios/DesMoinesInsider/` | Complete |
| Events feed + detail view | `Views/Home/`, `Views/EventDetail/` | Complete |
| Restaurant list + detail | `Views/Restaurants/` | Complete |
| Attractions | `Views/Attractions/` | Complete |
| Interactive MapKit map | `Views/Map/` | Complete |
| Unified search | `Views/Search/` | Complete |
| Favorites management | `Views/Favorites/`, `Services/FavoritesService.swift` | Complete |
| User profile + edit | `Views/Profile/ProfileView.swift` | Complete |
| Settings page | `Views/Profile/SettingsView.swift` | Basic |
| Auth (Email + Apple Sign-In) | `Views/Auth/`, `Services/AuthService.swift` | Complete |
| Onboarding flow | `Views/Onboarding/OnboardingView.swift` | Complete |
| Supabase backend integration | `Services/SupabaseService.swift` | Complete |
| Privacy Policy link (in-app) | `SettingsView.swift` → web link | Complete |
| Terms of Service link | `SettingsView.swift` → web link | Complete |
| Contact Support link | `SettingsView.swift` → mailto link | Complete |
| Location service | `Services/LocationService.swift` | Complete |
| Config with feature flags | `Configuration/Config.swift` | Complete |
| CI/CD (GitHub Actions) | `.github/workflows/ios-native-*.yml` | Complete |
| Fastlane for release | `ios/fastlane/` | Complete |
| App Store metadata draft | `ios/metadata/app_store_metadata.md` | Complete |
| UI Tests for screenshots | `ios/DesMoinesInsiderUITests/` | Complete |
| Export compliance flag | `ITSAppUsesNonExemptEncryption = false` | Set |

### What's Missing or Incomplete (❌)

| Requirement | Priority | Effort | Section |
|-------------|----------|--------|---------|
| **Account deletion flow** | P0 — BLOCKER | Medium | §2 |
| **StoreKit 2 subscriptions** (Apple IAP) | P0 — BLOCKER | Large | §3 |
| **Restore Purchases** button | P0 — BLOCKER | Small | §3 |
| **Subscription management UI** | P0 — BLOCKER | Medium | §3 |
| **VoiceOver accessibility audit** | P1 — HIGH | Medium | §4 |
| **Dynamic Type support** | P1 — HIGH | Medium | §4 |
| **Reduce Motion support** | P1 — HIGH | Small | §4 |
| **App Tracking Transparency** (if tracking) | P1 — HIGH | Small | §6 |
| **Offline empty states** | P1 — HIGH | Medium | §7 |
| **Network error handling** | P1 — HIGH | Medium | §7 |
| **Loading states polish** | P2 — MEDIUM | Small | §9 |
| **Pull-to-refresh on all lists** | P2 — MEDIUM | Small | §9 |
| **Haptic feedback** | P2 — MEDIUM | Small | §9 |
| **Push notifications** | P2 — MEDIUM | Large | §11 |
| **Deep / Universal Links** | P2 — MEDIUM | Medium | §12 |
| **Performance profiling** | P2 — MEDIUM | Medium | §13 |
| **Rate/Review prompt** | P3 — LOW | Small | §9 |

---

## 2. Account Deletion (Required)

**Apple Requirement**: Apps that support account creation MUST allow users to initiate account deletion from within the app. Deletion must be at least as easy as account creation.

**Current State**: The app has Sign In and Sign Out but NO account deletion flow.

### Implementation Plan

#### 2.1 Add Delete Account Button to ProfileView

**File**: `ios/DesMoinesInsider/Views/Profile/ProfileView.swift`

Add a "Delete Account" button in the authenticated content section, below Sign Out:

```swift
// In the "App Section" of authenticatedContent
Section {
    // ... existing Settings, Website, Sign Out buttons ...

    Button(role: .destructive) {
        viewModel.showDeleteConfirmation = true
    } label: {
        Label("Delete Account", systemImage: "trash")
            .foregroundStyle(.red)
    }
}
.alert("Delete Account?", isPresented: $viewModel.showDeleteConfirmation) {
    Button("Cancel", role: .cancel) {}
    Button("Delete My Account", role: .destructive) {
        Task { await viewModel.deleteAccount() }
    }
} message: {
    Text("This will permanently delete your account, favorites, and all associated data. This action cannot be undone.")
}
```

#### 2.2 Add Delete Account Logic to ProfileViewModel

```swift
// ProfileViewModel additions
@Published var showDeleteConfirmation = false

func deleteAccount() async {
    do {
        // 1. Call Supabase Edge Function to delete user data
        try await SupabaseService.shared.client.functions.invoke(
            "delete-user-account",
            options: .init(body: ["confirm": true])
        )
        // 2. Sign out locally
        try await AuthService.shared.signOut()
    } catch {
        errorMessage = "Failed to delete account. Please contact support."
    }
}
```

#### 2.3 Create Supabase Edge Function (if not exists)

**File**: `supabase/functions/delete-user-account/index.ts`

```typescript
// Delete all user data: favorites, profile, interactions
// Then call supabase.auth.admin.deleteUser(userId)
```

#### 2.4 Acceptance Criteria

- [ ] "Delete Account" button visible in Profile when signed in
- [ ] Confirmation alert clearly states consequences
- [ ] Deletion removes: profile, favorites, interactions, auth account
- [ ] After deletion, user is returned to guest state
- [ ] Works for both email and Apple Sign-In accounts
- [ ] Response time < 5 seconds

---

## 3. StoreKit 2 Subscriptions (Required for IAP)

**Apple Requirement**: Digital content/subscriptions accessed within the app MUST use Apple's In-App Purchase system. You cannot use Stripe or external payment links for digital goods consumed in-app.

**Current State**: Subscriptions are handled via Stripe on web. The iOS app needs a parallel StoreKit 2 implementation.

### 3.1 Architecture Decision

| Approach | Pros | Cons |
|----------|------|------|
| **StoreKit 2 only (iOS)** | Simplest, Apple-compliant | Need to sync entitlements with Supabase |
| **RevenueCat SDK** | Handles receipt validation, cross-platform sync | Third-party dependency, cost |
| **StoreKit 2 + server validation** | Full control, no third-party | More server-side work |

**Recommended**: StoreKit 2 native + server-side receipt validation via a Supabase Edge Function.

### 3.2 Apple App Store Connect Setup

Create these products in App Store Connect → In-App Purchases:

| Reference Name | Product ID | Type | Price |
|----------------|-----------|------|-------|
| Insider Monthly | `com.desmoines.aipulse.insider.monthly` | Auto-Renewable | $4.99/mo |
| Insider Yearly | `com.desmoines.aipulse.insider.yearly` | Auto-Renewable | $49.99/yr |
| VIP Monthly | `com.desmoines.aipulse.vip.monthly` | Auto-Renewable | $12.99/mo |
| VIP Yearly | `com.desmoines.aipulse.vip.yearly` | Auto-Renewable | $129.99/yr |

**Subscription Group**: "Des Moines Insider Premium"

Subscription hierarchy (highest to lowest):
1. VIP Yearly
2. VIP Monthly
3. Insider Yearly
4. Insider Monthly

### 3.3 StoreKit 2 Service

**Create**: `ios/DesMoinesInsider/Services/StoreKitService.swift`

```swift
import StoreKit

@Observable
final class StoreKitService {
    static let shared = StoreKitService()

    private(set) var products: [Product] = []
    private(set) var purchasedProductIDs: Set<String> = []
    private(set) var currentSubscription: Product.SubscriptionInfo.Status?

    private let productIDs: Set<String> = [
        "com.desmoines.aipulse.insider.monthly",
        "com.desmoines.aipulse.insider.yearly",
        "com.desmoines.aipulse.vip.monthly",
        "com.desmoines.aipulse.vip.yearly"
    ]

    private var transactionListener: Task<Void, Error>?

    init() {
        transactionListener = listenForTransactions()
        Task { await loadProducts() }
        Task { await updatePurchasedProducts() }
    }

    func loadProducts() async {
        do {
            products = try await Product.products(for: productIDs)
                .sorted { $0.price < $1.price }
        } catch {
            print("Failed to load products: \(error)")
        }
    }

    func purchase(_ product: Product) async throws -> Transaction? {
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await updatePurchasedProducts()
            await transaction.finish()
            // Sync with Supabase backend
            await syncEntitlementToBackend(transaction: transaction)
            return transaction
        case .pending:
            return nil
        case .userCancelled:
            return nil
        @unknown default:
            return nil
        }
    }

    func restorePurchases() async {
        try? await AppStore.sync()
        await updatePurchasedProducts()
    }

    // Determine current tier
    var currentTier: String {
        if purchasedProductIDs.contains(where: { $0.contains("vip") }) {
            return "vip"
        } else if purchasedProductIDs.contains(where: { $0.contains("insider") }) {
            return "insider"
        }
        return "free"
    }

    // MARK: - Private

    private func listenForTransactions() -> Task<Void, Error> {
        Task.detached {
            for await result in Transaction.updates {
                let transaction = try self.checkVerified(result)
                await self.updatePurchasedProducts()
                await transaction.finish()
            }
        }
    }

    private func updatePurchasedProducts() async {
        var purchased: Set<String> = []
        for await result in Transaction.currentEntitlements {
            if let transaction = try? checkVerified(result) {
                purchased.insert(transaction.productID)
            }
        }
        purchasedProductIDs = purchased
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }

    private func syncEntitlementToBackend(transaction: Transaction) async {
        // Call Supabase Edge Function to record the subscription
        // Pass the transaction ID, product ID, and original transaction ID
        do {
            try await SupabaseService.shared.client.functions.invoke(
                "verify-apple-receipt",
                options: .init(body: [
                    "transactionId": String(transaction.id),
                    "productId": transaction.productID,
                    "originalTransactionId": String(transaction.originalID)
                ])
            )
        } catch {
            print("Failed to sync entitlement: \(error)")
        }
    }

    enum StoreError: Error {
        case failedVerification
    }
}
```

### 3.4 Subscription UI View

**Create**: `ios/DesMoinesInsider/Views/Subscription/SubscriptionView.swift`

```swift
import SwiftUI
import StoreKit

struct SubscriptionView: View {
    @State private var store = StoreKitService.shared
    @State private var isPurchasing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    Text("Unlock Premium Features")
                        .font(.title2.bold())

                    // Current tier badge
                    currentTierBadge

                    // Product cards
                    ForEach(store.products, id: \.id) { product in
                        SubscriptionProductCard(
                            product: product,
                            isPurchased: store.purchasedProductIDs.contains(product.id),
                            onPurchase: { await purchaseProduct(product) }
                        )
                    }

                    // Restore purchases
                    Button("Restore Purchases") {
                        Task { await store.restorePurchases() }
                    }
                    .font(.footnote)
                    .padding(.top, 8)

                    // Legal text
                    legalText
                }
                .padding()
            }
            .navigationTitle("Premium")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var currentTierBadge: some View {
        // Show current tier
    }

    private var legalText: some View {
        Text("Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Manage subscriptions in Settings > Apple ID > Subscriptions.")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
    }

    private func purchaseProduct(_ product: Product) async {
        isPurchasing = true
        defer { isPurchasing = false }
        do {
            _ = try await store.purchase(product)
        } catch {
            // Handle error
        }
    }
}
```

### 3.5 Server-Side Receipt Validation

**Create**: `supabase/functions/verify-apple-receipt/index.ts`

This Edge Function should:
1. Receive the transaction ID and product ID from the iOS app
2. Verify the transaction with Apple's App Store Server API v2
3. Update the `user_subscriptions` table with the Apple subscription status
4. Return the entitlement to the client

### 3.6 Manage Subscription Link

Add a "Manage Subscription" button that opens Apple's subscription management:

```swift
// In SubscriptionView or SettingsView
if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
    Link("Manage Subscription", destination: url)
}
```

### 3.7 Acceptance Criteria

- [ ] Products load from App Store Connect
- [ ] Purchase flow works (sandbox testing)
- [ ] Entitlements sync to Supabase backend
- [ ] Gated features unlock after purchase
- [ ] "Restore Purchases" button works
- [ ] "Manage Subscription" link opens Apple settings
- [ ] Legal text about auto-renewal displayed
- [ ] Subscription status persists across app launches

---

## 4. Accessibility (Required)

Apple may reject apps with poor accessibility, and it's a key quality signal.

### 4.1 VoiceOver Audit

Review every interactive element across all screens and ensure:

```swift
// Every tappable element needs a label
Button { ... } label: {
    Image(systemName: "heart")
}
.accessibilityLabel("Add to favorites")
.accessibilityHint("Double-tap to save this event to your favorites")

// Images need descriptions
AsyncImage(url: event.imageURL)
    .accessibilityLabel("Photo of \(event.title)")

// Custom components need traits
HStack { ... }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Event: \(event.title), \(event.formattedDate)")
    .accessibilityAddTraits(.isButton)
```

### Screens to Audit

| Screen | Key Elements to Label |
|--------|-----------------------|
| Home | Event cards, category filter chips, date presets, featured carousel |
| Event Detail | Favorite button, share button, calendar button, map pin |
| Restaurants | Filter chips, sort selector, restaurant cards, rating stars |
| Search | Search field, tab switcher, result cards |
| Map | Map pins, bottom sheet, annotation callouts |
| Favorites | Remove button, empty state |
| Profile | Edit fields, save button, sign out, delete account |
| Onboarding | Page indicators, next/skip buttons, interest chips |
| Subscription | Product cards, purchase buttons, restore button |

### 4.2 Dynamic Type

Ensure all text uses SwiftUI's built-in scalable fonts:

```swift
// ✅ GOOD — scales with Dynamic Type
Text("Event Title")
    .font(.headline)

Text("Description")
    .font(.body)

// ❌ BAD — fixed size, won't scale
Text("Title")
    .font(.system(size: 18))
```

**Audit**: Search for `.font(.system(size:` across all Swift files and replace with semantic fonts where possible.

### 4.3 Color Contrast

Ensure all text meets WCAG AA minimum contrast ratios:
- Normal text: 4.5:1
- Large text (18pt+ / 14pt+ bold): 3:1

Use Xcode's Accessibility Inspector to verify.

### 4.4 Reduce Motion

```swift
// Respect the user's Reduce Motion setting
@Environment(\.accessibilityReduceMotion) var reduceMotion

withAnimation(reduceMotion ? nil : .spring()) {
    // animate
}
```

### 4.5 Acceptance Criteria

- [ ] Every screen navigable with VoiceOver
- [ ] All buttons/controls have accessibility labels
- [ ] Dynamic Type works at all sizes (test with Accessibility Inspector)
- [ ] No text cut off at largest Dynamic Type size
- [ ] Reduce Motion respected for all animations
- [ ] Color contrast ≥ 4.5:1 for all text

---

## 5. Privacy & Permissions

### 5.1 Location Permission

Already set in Info.plist. Verify the description is clear and specific:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Des Moines Insider uses your location to show nearby events, restaurants, and attractions on the map.</string>
```

**Key Rule**: Only request location when the user taps the map or a "Near Me" feature — never on app launch.

### 5.2 Camera Permission (if profile photos)

If supporting camera for profile photos:

```xml
<key>NSCameraUsageDescription</key>
<string>Des Moines Insider uses the camera to take a profile photo.</string>
```

### 5.3 Photo Library Permission (if profile photos)

```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>Des Moines Insider accesses your photos to set a profile picture.</string>
```

### 5.4 Push Notification Permission

If implementing push notifications:

```xml
<key>NSUserNotificationsUsageDescription</key>
<string>Des Moines Insider sends notifications about upcoming events you've favorited and local happenings.</string>
```

Request permission only after explaining the value (not on first launch).

### 5.5 Privacy Manifest

**File**: `ios/DesMoinesInsider/Resources/PrivacyInfo.xcprivacy`

Required by Apple for apps using certain APIs. Create if it doesn't exist:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeName</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePreciseLocation</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyTracking</key>
    <false/>
</dict>
</plist>
```

---

## 6. App Tracking Transparency

**Rule**: If you track users across other companies' apps/websites, you MUST show the ATT prompt.

**Des Moines Insider's situation**: We do NOT track users across other apps. Supabase analytics is first-party. Unless you add a third-party ad SDK or cross-app analytics, **ATT is NOT required**.

If tracking is added in the future:

```swift
import AppTrackingTransparency

func requestTrackingPermission() {
    ATTrackingManager.requestTrackingAuthorization { status in
        switch status {
        case .authorized:
            // Enable analytics
        default:
            // Disable tracking
        }
    }
}
```

Add to Info.plist:
```xml
<key>NSUserTrackingUsageDescription</key>
<string>We use this to improve your event and restaurant recommendations.</string>
```

---

## 7. Offline & Error States

Apple rejects apps that show blank screens or crash when offline. Every data-loading screen needs three states: loading, content, and error/empty.

### 7.1 Network Status Monitor

**Create**: `ios/DesMoinesInsider/Services/NetworkMonitor.swift`

```swift
import Network

@Observable
final class NetworkMonitor {
    static let shared = NetworkMonitor()
    private(set) var isConnected = true
    private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.isConnected = path.status == .satisfied
            }
        }
        monitor.start(queue: DispatchQueue(label: "NetworkMonitor"))
    }
}
```

### 7.2 Offline Banner Component

```swift
struct OfflineBanner: View {
    @State private var network = NetworkMonitor.shared

    var body: some View {
        if !network.isConnected {
            HStack {
                Image(systemName: "wifi.slash")
                Text("No internet connection")
                    .font(.footnote.weight(.medium))
            }
            .foregroundStyle(.white)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(Color.orange)
        }
    }
}
```

### 7.3 Empty & Error States for Each Screen

```swift
// Reusable empty state
struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: icon)
        } description: {
            Text(message)
        } actions: {
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}

// Usage in EventsView
if events.isEmpty && !isLoading {
    if !NetworkMonitor.shared.isConnected {
        EmptyStateView(
            icon: "wifi.slash",
            title: "No Connection",
            message: "Check your internet and try again.",
            actionTitle: "Retry",
            action: { Task { await loadEvents() } }
        )
    } else {
        EmptyStateView(
            icon: "calendar",
            title: "No Events Found",
            message: "Try adjusting your filters or check back later."
        )
    }
}
```

### 7.4 Screens Needing States

| Screen | Loading | Empty | Error/Offline |
|--------|---------|-------|---------------|
| Home / Events | ✅ Skeleton | ❌ NEEDS | ❌ NEEDS |
| Event Detail | ✅ Spinner | N/A | ❌ NEEDS |
| Restaurants | ✅ Skeleton | ❌ NEEDS | ❌ NEEDS |
| Attractions | ✅ Skeleton | ❌ NEEDS | ❌ NEEDS |
| Search | ✅ | ❌ NEEDS | ❌ NEEDS |
| Map | ✅ | ❌ NEEDS | ❌ NEEDS |
| Favorites | ✅ | Partial | ❌ NEEDS |

---

## 8. Minimum Functionality Threshold

**Apple Guideline 4.2**: Apps should not be simple web wrappers. The app must provide meaningful native functionality.

### Des Moines Insider Already Passes Because:

- ✅ Native SwiftUI (not WebView)
- ✅ MapKit integration (native maps, not WebView)
- ✅ Offline state handling (once implemented)
- ✅ Native navigation (NavigationStack, TabView)
- ✅ Apple Sign-In integration
- ✅ Local storage (favorites sync, @AppStorage)
- ✅ Onboarding flow
- ✅ Native search with keyboard optimization

### Additional Native Features to Strengthen the Case

| Feature | Difficulty | Impact |
|---------|-----------|--------|
| Calendar integration (EventKit) | Small | High — "Add to Calendar" on event detail |
| Share sheet (UIActivityViewController) | Small | Medium — share events natively |
| Spotlight search indexing | Medium | Medium — events searchable from iOS search |
| Widgets (WidgetKit) | Large | High — today's events on home screen |
| Haptic feedback on interactions | Small | Low — polish |

### Quick Win: Add to Calendar

```swift
import EventKit

func addToCalendar(event: AppEvent) {
    let store = EKEventStore()
    store.requestWriteOnlyAccessToEvents { granted, error in
        guard granted else { return }
        let calendarEvent = EKEvent(eventStore: store)
        calendarEvent.title = event.title
        calendarEvent.startDate = event.date
        calendarEvent.endDate = event.date.addingTimeInterval(3600 * 2)
        calendarEvent.location = event.location
        calendarEvent.notes = event.description
        calendarEvent.calendar = store.defaultCalendarForNewEvents
        try? store.save(calendarEvent, span: .thisEvent)
    }
}
```

---

## 9. Native UI Polish

### 9.1 Pull-to-Refresh

Add `.refreshable` to all list/scroll views:

```swift
List(events) { event in
    EventRow(event: event)
}
.refreshable {
    await viewModel.refresh()
}
```

### 9.2 Haptic Feedback

```swift
import UIKit

// On favorite toggle
UIImpactFeedbackGenerator(style: .medium).impactOccurred()

// On successful action
UINotificationFeedbackGenerator().notificationOccurred(.success)

// On selection change
UISelectionFeedbackGenerator().selectionChanged()
```

### 9.3 In-App Review Prompt

```swift
import StoreKit

// After 3+ sessions and 1+ favorites
func requestReviewIfAppropriate() {
    let launchCount = UserDefaults.standard.integer(forKey: "launchCount")
    let favoriteCount = UserDefaults.standard.integer(forKey: "favoriteCount")

    if launchCount >= 3 && favoriteCount >= 1 {
        if let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
            AppStore.requestReview(in: scene)
        }
    }
}
```

### 9.4 Dark Mode

Verify all screens look correct in both light and dark mode. Use SwiftUI semantic colors:

```swift
Color.primary          // adapts automatically
Color(.systemBackground)
Color(.secondarySystemBackground)
Color(.secondaryLabel)
```

### 9.5 Safe Area Handling

Ensure content respects safe areas (notch, Dynamic Island, home indicator):

```swift
.safeAreaInset(edge: .bottom) {
    // Bottom action bar
}
```

---

## 10. Settings & Legal Pages

### 10.1 Enhance SettingsView

The current SettingsView is basic. Add these sections:

```swift
Section("Account") {
    if AuthService.shared.isAuthenticated {
        NavigationLink("Subscription") {
            SubscriptionView()
        }
        Button("Restore Purchases") {
            Task { await StoreKitService.shared.restorePurchases() }
        }
    }
}

Section("About") {
    // ... existing links ...

    // Add explicit in-app links (not just web links)
    NavigationLink("Privacy Policy") {
        WebView(url: Config.siteURL.appendingPathComponent("privacy-policy"))
    }
    NavigationLink("Terms of Service") {
        WebView(url: Config.siteURL.appendingPathComponent("terms"))
    }

    // Rate the app
    Button("Rate Des Moines Insider") {
        if let url = URL(string: "https://apps.apple.com/app/idXXXXXXXXXX?action=write-review") {
            UIApplication.shared.open(url)
        }
    }
}

Section("Data & Privacy") {
    if AuthService.shared.isAuthenticated {
        Button(role: .destructive) {
            showDeleteConfirmation = true
        } label: {
            Label("Delete Account", systemImage: "trash")
                .foregroundStyle(.red)
        }
    }
}
```

### 10.2 Simple In-App WebView (for legal pages)

```swift
import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        WKWebView()
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.load(URLRequest(url: url))
    }
}
```

---

## 11. Push Notifications

**Current State**: Config flag exists (`enablePushNotifications = false`). APNs integration is scaffolded but not active.

### Implementation Steps

1. Enable Push Notifications capability in Xcode
2. Register for remote notifications in `DesMoinesInsiderApp.swift`
3. Send device token to Supabase
4. Create Supabase Edge Function for sending via APNs
5. Request permission only after user saves first favorite

### When to Request Permission

```swift
// GOOD: After a meaningful action
func onFirstFavorite() {
    // Show a custom pre-prompt explaining the value
    showNotificationExplainer = true
}

// In the explainer view:
// "Get reminders before your favorited events start?"
// [Enable Notifications] [Not Now]
```

---

## 12. Deep Linking & Universal Links

Enable sharing links that open directly in the app.

### 12.1 Associated Domains

Add to entitlements:
```
applinks:desmoinesinsider.com
```

### 12.2 Apple App Site Association

Host at `https://desmoinesinsider.com/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["TEAMID.com.desmoines.aipulse"],
        "paths": ["/events/*", "/restaurants/*", "/attractions/*"]
      }
    ]
  }
}
```

### 12.3 Handle Incoming Links

```swift
// In DesMoinesInsiderApp.swift
.onOpenURL { url in
    // Parse URL and navigate to appropriate view
    DeepLinkHandler.shared.handle(url)
}
```

---

## 13. Performance & Stability

### 13.1 Pre-Submission Testing

- [ ] Test on oldest supported device (iPhone with iOS 17)
- [ ] Test on latest device (iPhone 16 Pro / Pro Max)
- [ ] Test with slow network (Network Link Conditioner)
- [ ] Test with no network → ensure graceful degradation
- [ ] Test rotation (if applicable) and multitasking on iPad
- [ ] Profile with Instruments: Leaks, Time Profiler, Network
- [ ] Memory usage stays under 200MB in normal use
- [ ] No retain cycles (check Instruments Leaks)
- [ ] Cold launch time < 2 seconds

### 13.2 Image Loading

Ensure images load efficiently and show placeholders:

```swift
AsyncImage(url: imageURL) { phase in
    switch phase {
    case .success(let image):
        image.resizable().aspectRatio(contentMode: .fill)
    case .failure:
        Image(systemName: "photo")
            .foregroundStyle(.secondary)
    case .empty:
        ProgressView()
    @unknown default:
        EmptyView()
    }
}
```

### 13.3 Pagination

Ensure all lists use proper pagination and don't load everything at once:

```swift
// Trigger next page load when reaching the end
.onAppear {
    if event == viewModel.events.last {
        Task { await viewModel.loadMore() }
    }
}
```

---

## 14. TestFlight Beta Testing

Before submitting to App Review:

1. **Internal Testing**: Upload build → Test with team (up to 25 testers)
2. **External Testing**: Submit for Beta App Review → Test with broader group (up to 10,000)
3. **Gather Feedback**: Fix crashes and UX issues
4. **Minimum 1 week** of beta testing recommended

### TestFlight Submission

```bash
# Via GitHub Actions
# Actions > "iOS Native Release - TestFlight" > Run workflow

# Via Fastlane
cd ios/
make beta
```

---

## 15. Implementation Priority & Timeline

### Phase 1: BLOCKERS (Must have for submission) — ~2-3 weeks

| Task | Effort | Owner |
|------|--------|-------|
| Account deletion flow (§2) | 3 days | iOS dev |
| StoreKit 2 service + products (§3.1-3.3) | 5 days | iOS dev |
| Subscription UI view (§3.4) | 3 days | iOS dev |
| Server receipt validation edge function (§3.5) | 2 days | Backend dev |
| Restore Purchases (§3.6) | 1 day | iOS dev |
| Privacy manifest (§5.5) | 1 day | iOS dev |

### Phase 2: HIGH PRIORITY (Rejection risk if missing) — ~1-2 weeks

| Task | Effort | Owner |
|------|--------|-------|
| VoiceOver audit + labels (§4.1) | 3 days | iOS dev |
| Dynamic Type audit (§4.2) | 2 days | iOS dev |
| Reduce Motion support (§4.4) | 1 day | iOS dev |
| Offline/error states on all screens (§7) | 3 days | iOS dev |
| Network monitor + offline banner (§7.1-7.2) | 1 day | iOS dev |

### Phase 3: POLISH (Improve quality, lower rejection risk) — ~1 week

| Task | Effort | Owner |
|------|--------|-------|
| Pull-to-refresh all lists (§9.1) | 1 day | iOS dev |
| Haptic feedback (§9.2) | 0.5 day | iOS dev |
| Enhanced Settings view (§10.1) | 1 day | iOS dev |
| In-app WebView for legal pages (§10.2) | 0.5 day | iOS dev |
| Add to Calendar (§8) | 1 day | iOS dev |
| In-app review prompt (§9.3) | 0.5 day | iOS dev |
| Dark mode verification (§9.4) | 0.5 day | iOS dev |

### Phase 4: POST-LAUNCH (v1.1+) — Future

| Task | Priority |
|------|----------|
| Push notifications (§11) | Medium |
| Universal Links (§12) | Medium |
| Spotlight search indexing | Low |
| WidgetKit (today's events) | Low |
| iPad optimization | Low |

---

## Quick Reference: Common Rejection Reasons & How We Address Them

| Rejection Reason | Our Mitigation |
|------------------|----------------|
| Crashes during review | Thorough TestFlight testing, Instruments profiling |
| Missing account deletion | §2 — Delete Account in Profile |
| Using external payments for digital goods | §3 — StoreKit 2 for iOS subscriptions |
| Poor accessibility | §4 — VoiceOver, Dynamic Type, Reduce Motion |
| Missing privacy disclosures | §5 — PrivacyInfo.xcprivacy + nutrition label |
| Blank screen when offline | §7 — Offline states on all screens |
| Minimal functionality / web wrapper | N/A — Full native SwiftUI app |
| Misleading metadata | Metadata matches real UI (see submission doc) |
| Permission prompt without explanation | §5 — All permission strings explain "why" |
| Missing Restore Purchases | §3.6 — Restore button in subscription UI + settings |

---

## File Reference

| What to Create / Modify | Path |
|--------------------------|------|
| Account deletion in ProfileView | `ios/DesMoinesInsider/Views/Profile/ProfileView.swift` |
| Account deletion in ProfileViewModel | `ios/DesMoinesInsider/ViewModels/ProfileViewModel.swift` |
| StoreKit service (new) | `ios/DesMoinesInsider/Services/StoreKitService.swift` |
| Subscription view (new) | `ios/DesMoinesInsider/Views/Subscription/SubscriptionView.swift` |
| Network monitor (new) | `ios/DesMoinesInsider/Services/NetworkMonitor.swift` |
| Offline banner (new) | `ios/DesMoinesInsider/Views/Components/OfflineBanner.swift` |
| Empty state component (new) | `ios/DesMoinesInsider/Views/Components/EmptyStateView.swift` |
| WebView for legal pages (new) | `ios/DesMoinesInsider/Views/Components/WebView.swift` |
| Privacy manifest (new/verify) | `ios/DesMoinesInsider/Resources/PrivacyInfo.xcprivacy` |
| Settings view (enhance) | `ios/DesMoinesInsider/Views/Profile/SettingsView.swift` |
| Delete account edge function (new) | `supabase/functions/delete-user-account/index.ts` |
| Apple receipt verification (new) | `supabase/functions/verify-apple-receipt/index.ts` |
| App Store Connect products | Configure in App Store Connect dashboard |
