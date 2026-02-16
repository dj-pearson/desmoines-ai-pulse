//
//  DesMoinesInsiderUITests.swift
//  DesMoinesInsiderUITests
//
//  XCUITest suite for automated App Store screenshot generation via Fastlane Snapshot.
//
//  Each test method navigates to a key screen and captures a screenshot.
//  Screenshots are saved with descriptive names that map to App Store listing slots.
//
//  Usage:
//    fastlane ios screenshots       # Run via Fastlane (recommended)
//    make screenshots               # Run via Makefile
//
//  The tests assume the app launches in a "UI testing" mode where:
//    - Onboarding is skipped (hasCompletedOnboarding = true)
//    - Supabase is configured with placeholder credentials
//    - The app shows the main tab view immediately
//

import XCTest

@MainActor
final class DesMoinesInsiderUITests: XCTestCase {

    var app: XCUIApplication!

    // MARK: - Setup

    override func setUpWithError() throws {
        continueAfterFailure = true

        app = XCUIApplication()

        // Skip onboarding for screenshot tests
        app.launchArguments += ["--uitesting"]
        app.launchArguments += ["-hasCompletedOnboarding", "YES"]

        // Configure Fastlane snapshot helper
        setupSnapshot(app)

        app.launch()

        // Dismiss any system alerts (e.g. location permission) that may appear
        addUIInterruptionMonitor(withDescription: "System Alert") { alert in
            let allowButton = alert.buttons["Allow While Using App"]
            if allowButton.exists {
                allowButton.tap()
                return true
            }
            let allowOnceButton = alert.buttons["Allow Once"]
            if allowOnceButton.exists {
                allowOnceButton.tap()
                return true
            }
            let dontAllowButton = alert.buttons["Don't Allow"]
            if dontAllowButton.exists {
                dontAllowButton.tap()
                return true
            }
            return false
        }

        // Wait for the app to fully load (tab bar should appear)
        let tabBar = app.tabBars.firstMatch
        let launched = tabBar.waitForExistence(timeout: 15)
        if !launched {
            NSLog("Warning: Tab bar not found within timeout — app may still be loading")
        }
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Screenshot Tests

    /// Screenshot 1: Home feed with events and restaurants
    func test01_HomeScreen() throws {
        // Ensure we're on the Home tab
        navigateToTab("Home")

        // Wait for content to load
        waitForContentToLoad()

        snapshot("01_HomeScreen")
    }

    /// Screenshot 2: Restaurants/Dining tab
    func test02_RestaurantsScreen() throws {
        navigateToTab("Dining")

        waitForContentToLoad()

        snapshot("02_Restaurants")
    }

    /// Screenshot 3: Search & Discovery
    func test03_SearchScreen() throws {
        navigateToTab("Search")

        waitForContentToLoad()

        snapshot("03_Search")
    }

    /// Screenshot 4: Interactive Map
    func test04_MapScreen() throws {
        navigateToTab("Map")

        // Tap the app to trigger any pending interruption monitors (e.g. location dialog)
        app.tap()

        // Wait for content to load (loading overlay to disappear) + map tile rendering
        waitForContentToLoad()

        snapshot("04_Map")
    }

    /// Screenshot 5: Favorites / Saved items
    func test05_FavoritesScreen() throws {
        navigateToTab("Saved")

        waitForContentToLoad()

        snapshot("05_Favorites")
    }

    /// Screenshot 6: Profile / Settings
    func test06_ProfileScreen() throws {
        navigateToTab("Profile")

        waitForContentToLoad()

        snapshot("06_Profile")
    }

    /// Screenshot 7: Event Detail view (tap first event from Home)
    func test07_EventDetail() throws {
        // Go to Home tab first
        navigateToTab("Home")

        waitForContentToLoad()

        // Try to tap the first event card in the list.
        // Events are rendered as buttons in a LazyVStack.
        let scrollView = app.scrollViews.firstMatch
        if scrollView.exists {
            // Scroll down to find event cards past the featured/restaurants sections
            scrollView.swipeUp()
            sleep(1)
        }

        // Look for any tappable cell/button that could be an event card
        let firstEvent = app.buttons.matching(
            NSPredicate(format: "isEnabled == true")
        ).element(boundBy: 0)

        if firstEvent.exists {
            firstEvent.tap()
            sleep(2)
            snapshot("07_EventDetail")
        } else {
            // Fall back: just screenshot whatever we have
            snapshot("07_EventDetail")
        }
    }

    /// Screenshot 8: Restaurant Detail view
    func test08_RestaurantDetail() throws {
        navigateToTab("Dining")

        waitForContentToLoad()

        // Tap the first restaurant card
        let firstRestaurant = app.buttons.matching(
            NSPredicate(format: "isEnabled == true")
        ).element(boundBy: 0)

        if firstRestaurant.exists {
            firstRestaurant.tap()
            sleep(2)
            snapshot("08_RestaurantDetail")
        } else {
            snapshot("08_RestaurantDetail")
        }
    }

    // MARK: - Helpers

    /// Navigate to a tab by name, handling various iOS tab bar layouts.
    ///
    /// On iPhone with 6+ tabs, iOS may place extra tabs behind a "More" button.
    /// This helper tries multiple strategies:
    /// 1. Direct tab bar button match
    /// 2. Partial/case-insensitive label match (for iOS version differences)
    /// 3. "More" tab navigation (for 6+ tabs on iPhone)
    @discardableResult
    private func navigateToTab(_ name: String) -> Bool {
        // Strategy 1: Direct tab bar button by exact label
        let directButton = app.tabBars.buttons[name]
        if directButton.waitForExistence(timeout: 3) {
            directButton.tap()
            return true
        }

        // Strategy 2: Partial label match (handles "Saved Tab", "Saved, tab", etc.)
        let partialMatch = app.tabBars.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] %@", name)
        ).firstMatch
        if partialMatch.waitForExistence(timeout: 2) {
            partialMatch.tap()
            return true
        }

        // Strategy 3: Navigate through "More" tab (iPhone with 6+ tabs)
        let moreButton = app.tabBars.buttons["More"]
        if moreButton.waitForExistence(timeout: 2) {
            moreButton.tap()
            sleep(1)

            // Look for the tab name in the More list (table cells or buttons)
            let moreCell = app.tables.staticTexts[name]
            if moreCell.waitForExistence(timeout: 3) {
                moreCell.tap()
                return true
            }

            // Also try cells directly
            let moreButton2 = app.cells.staticTexts[name]
            if moreButton2.waitForExistence(timeout: 2) {
                moreButton2.tap()
                return true
            }

            // Try partial match in More list
            let morePartial = app.tables.staticTexts.matching(
                NSPredicate(format: "label CONTAINS[c] %@", name)
            ).firstMatch
            if morePartial.waitForExistence(timeout: 2) {
                morePartial.tap()
                return true
            }
        }

        NSLog("Warning: Could not find tab '\(name)' — taking screenshot of current screen")
        return false
    }

    /// Wait for the main content to load (loading spinners to disappear).
    private func waitForContentToLoad() {
        // Give the view time to load data
        sleep(3)

        // Check if a loading indicator exists and wait for it to disappear
        let spinner = app.activityIndicators.firstMatch
        if spinner.exists {
            let disappeared = NSPredicate(format: "exists == false")
            expectation(for: disappeared, evaluatedWith: spinner, handler: nil)
            waitForExpectations(timeout: 15, handler: nil)
        }
    }
}
