import Foundation
import UIKit
import os

/// Detects common jailbreak indicators on the device.
///
/// Shows a soft warning only — does NOT block app usage (per App Store guidelines).
/// Checks are skipped entirely on Simulator to avoid false positives during development.
enum JailbreakDetector {

    /// Returns `true` if any jailbreak indicators are found.
    /// Always returns `false` on Simulator.
    static var isJailbroken: Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        return checkSuspiciousPaths()
            || checkSuspiciousURLSchemes()
            || checkWritableSystemPaths()
            || checkDynamicLibraries()
        #endif
    }

    // MARK: - Checks

    /// Checks for files commonly installed by jailbreak tools.
    private static func checkSuspiciousPaths() -> Bool {
        let suspiciousPaths = [
            "/Applications/Cydia.app",
            "/Applications/Sileo.app",
            "/Applications/Zebra.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash",
            "/usr/sbin/sshd",
            "/etc/apt",
            "/var/lib/cydia",
            "/var/lib/apt",
            "/private/var/stash",
            "/usr/bin/ssh",
            "/usr/libexec/sftp-server",
        ]

        for path in suspiciousPaths {
            if FileManager.default.fileExists(atPath: path) {
                AppLogger.general.warning("Jailbreak indicator: suspicious path found")
                return true
            }
        }
        return false
    }

    /// Checks if jailbreak-related URL schemes can be opened.
    private static func checkSuspiciousURLSchemes() -> Bool {
        let schemes = ["cydia://", "sileo://", "zbra://"]

        for scheme in schemes {
            if let url = URL(string: scheme),
               UIApplication.shared.canOpenURL(url) {
                AppLogger.general.warning("Jailbreak indicator: suspicious URL scheme available")
                return true
            }
        }
        return false
    }

    /// Checks if the app can write to system-protected paths.
    /// On a non-jailbroken device this should always fail.
    private static func checkWritableSystemPaths() -> Bool {
        let testPath = "/private/jailbreak_test_\(UUID().uuidString)"
        do {
            try "test".write(toFile: testPath, atomically: true, encoding: .utf8)
            // If we get here, the write succeeded — device is jailbroken
            try? FileManager.default.removeItem(atPath: testPath)
            AppLogger.general.warning("Jailbreak indicator: writable system path detected")
            return true
        } catch {
            return false
        }
    }

    /// Checks for injected dynamic libraries commonly used by jailbreak tweaks.
    private static func checkDynamicLibraries() -> Bool {
        let suspiciousLibs = [
            "SubstrateLoader",
            "SSLKillSwitch",
            "MobileSubstrate",
            "TweakInject",
            "CydiaSubstrate",
            "libcycript",
        ]

        let count = _dyld_image_count()
        for i in 0..<count {
            guard let name = _dyld_get_image_name(i) else { continue }
            let imageName = String(cString: name)
            for lib in suspiciousLibs {
                if imageName.contains(lib) {
                    AppLogger.general.warning("Jailbreak indicator: suspicious dylib loaded")
                    return true
                }
            }
        }
        return false
    }
}
