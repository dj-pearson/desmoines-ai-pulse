//
//  SnapshotHelper.swift
//  Fastlane Snapshot Helper
//
//  Based on fastlane snapshot SnapshotHelper.
//  See: https://docs.fastlane.tools/actions/snapshot/
//
//  This file bridges XCUITest with Fastlane's snapshot tool.
//  It captures screenshots and saves them with device/locale metadata
//  so Fastlane can collect and organize them for App Store Connect.
//

import Foundation
import XCTest

var deviceLanguage = ""
var locale = ""

func setupSnapshot(_ app: XCUIApplication, waitForAnimations: Bool = true) {
    Snapshot.setupSnapshot(app, waitForAnimations: waitForAnimations)
}

func snapshot(_ name: String, waitForLoadingIndicator: Bool = true) {
    if waitForLoadingIndicator {
        Snapshot.snapshot(name, waitForLoadingIndicator: waitForLoadingIndicator)
    } else {
        Snapshot.snapshot(name)
    }
}

enum Snapshot {

    static var app: XCUIApplication!
    static var cacheDirectory: URL!
    static var screenshotsDirectory: URL? {
        return cacheDirectory
    }

    static func setupSnapshot(_ app: XCUIApplication, waitForAnimations: Bool = true) {
        Snapshot.app = app

        do {
            // The simulator app's container where we write screenshots.
            let cacheDir = try getCacheDirectory()
            Snapshot.cacheDirectory = cacheDir

            // Read language and locale from the Fastlane-created config files.
            setLanguage(app)
            setLocale(app)
            setLaunchArguments(app)
        } catch {
            NSLog("Snapshot: Error setting up — \(error)")
        }
    }

    static func setLanguage(_ app: XCUIApplication) {
        guard let cacheDirectory = self.cacheDirectory else { return }

        let path = cacheDirectory.appendingPathComponent("language.txt")

        do {
            let trimCharacterSet = CharacterSet.whitespacesAndNewlines
            deviceLanguage = try String(contentsOf: path, encoding: .utf8)
                .trimmingCharacters(in: trimCharacterSet)
            app.launchArguments += ["-AppleLanguages", "(\(deviceLanguage))"]
        } catch {
            NSLog("Snapshot: Couldn't detect language — \(error)")
        }
    }

    static func setLocale(_ app: XCUIApplication) {
        guard let cacheDirectory = self.cacheDirectory else { return }

        let path = cacheDirectory.appendingPathComponent("locale.txt")

        do {
            let trimCharacterSet = CharacterSet.whitespacesAndNewlines
            locale = try String(contentsOf: path, encoding: .utf8)
                .trimmingCharacters(in: trimCharacterSet)
        } catch {
            NSLog("Snapshot: Couldn't detect locale — \(error)")
        }

        if locale.isEmpty && !deviceLanguage.isEmpty {
            locale = Locale(identifier: deviceLanguage).identifier
        }

        if !locale.isEmpty {
            app.launchArguments += ["-AppleLocale", "\"\(locale)\""]
        }
    }

    static func setLaunchArguments(_ app: XCUIApplication) {
        guard let cacheDirectory = self.cacheDirectory else { return }

        let path = cacheDirectory.appendingPathComponent("snapshot-launch_arguments.txt")

        if let argsString = try? String(contentsOf: path, encoding: .utf8) {
            let trimCharacterSet = CharacterSet.whitespacesAndNewlines
            let lines = argsString.components(separatedBy: .newlines)
            let args = lines
                .map { $0.trimmingCharacters(in: trimCharacterSet) }
                .filter { !$0.isEmpty }

            app.launchArguments += args
        }

        app.launchArguments += ["FASTLANE_SNAPSHOT"]
    }

    static func snapshot(_ name: String, waitForLoadingIndicator: Bool = false) {
        if waitForLoadingIndicator {
            waitForLoadingIndicatorToDisappear()
        }

        NSLog("Snapshot: Taking screenshot '\(name)'")

        sleep(1) // Allow UI to settle

        let screenshot = XCUIScreen.main.screenshot()
        guard var cacheDir = self.cacheDirectory else {
            NSLog("Snapshot: cacheDirectory is nil — falling back to XCTAttachment")
            let attachment = XCTAttachment(screenshot: screenshot)
            attachment.name = name
            attachment.lifetime = .keepAlways
            return
        }

        // Add locale subdirectory
        let localePath = locale.isEmpty ? "en-US" : locale
        cacheDir = cacheDir.appendingPathComponent(localePath)

        do {
            try FileManager.default.createDirectory(
                at: cacheDir,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            NSLog("Snapshot: Error creating directory — \(error)")
        }

        let fileURL = cacheDir.appendingPathComponent("\(name).png")
        do {
            try screenshot.pngRepresentation.write(to: fileURL)
            NSLog("Snapshot: Saved screenshot to \(fileURL.path)")
        } catch {
            NSLog("Snapshot: Error writing screenshot — \(error)")
        }
    }

    static func waitForLoadingIndicatorToDisappear() {
        let query = XCUIApplication().statusBars
            .children(matching: .other)
            .element(boundBy: 1)
            .children(matching: .other)

        // Wait up to 20 seconds for loading indicator to disappear
        let start = Date()
        while Date().timeIntervalSince(start) < 20 {
            if query.count <= 4 { break }
            sleep(1)
        }
    }

    static func getCacheDirectory() throws -> URL {
        // Use the standard caches directory within the app's container
        let cachesURL = FileManager.default.urls(
            for: .cachesDirectory,
            in: .userDomainMask
        ).first!

        let snapshotDir = cachesURL.appendingPathComponent("snapshots")

        try FileManager.default.createDirectory(
            at: snapshotDir,
            withIntermediateDirectories: true,
            attributes: nil
        )

        return snapshotDir
    }
}
