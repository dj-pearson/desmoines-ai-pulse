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
        let homeTab = app.tabBars.buttons["Home"]
        if homeTab.exists {
            homeTab.tap()
        }

        // Wait for content to load
        waitForContentToLoad()

        snapshot("01_HomeScreen")
    }

    /// Screenshot 2: Restaurants/Dining tab
    func test02_RestaurantsScreen() throws {
        let diningTab = app.tabBars.buttons["Dining"]
        XCTAssertTrue(diningTab.waitForExistence(timeout: 5), "Dining tab should exist")
        diningTab.tap()

        waitForContentToLoad()

        snapshot("02_Restaurants")
    }

    /// Screenshot 3: Search & Discovery
    func test03_SearchScreen() throws {
        let searchTab = app.tabBars.buttons["Search"]
        XCTAssertTrue(searchTab.waitForExistence(timeout: 5), "Search tab should exist")
        searchTab.tap()

        waitForContentToLoad()

        snapshot("03_Search")
    }

    /// Screenshot 4: Interactive Map
    func test04_MapScreen() throws {
        let mapTab = app.tabBars.buttons["Map"]
        XCTAssertTrue(mapTab.waitForExistence(timeout: 5), "Map tab should exist")
        mapTab.tap()

        // Give the map extra time to render tiles
        sleep(3)

        snapshot("04_Map")
    }

    /// Screenshot 5: Favorites / Saved items
    func test05_FavoritesScreen() throws {
        let savedTab = app.tabBars.buttons["Saved"]
        XCTAssertTrue(savedTab.waitForExistence(timeout: 5), "Saved tab should exist")
        savedTab.tap()

        waitForContentToLoad()

        snapshot("05_Favorites")
    }

    /// Screenshot 6: Profile / Settings
    func test06_ProfileScreen() throws {
        let profileTab = app.tabBars.buttons["Profile"]
        XCTAssertTrue(profileTab.waitForExistence(timeout: 5), "Profile tab should exist")
        profileTab.tap()

        waitForContentToLoad()

        snapshot("06_Profile")
    }

    /// Screenshot 7: Event Detail view (tap first event from Home)
    func test07_EventDetail() throws {
        // Go to Home tab first
        let homeTab = app.tabBars.buttons["Home"]
        if homeTab.exists {
            homeTab.tap()
        }

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
        let diningTab = app.tabBars.buttons["Dining"]
        if diningTab.exists {
            diningTab.tap()
        }

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
