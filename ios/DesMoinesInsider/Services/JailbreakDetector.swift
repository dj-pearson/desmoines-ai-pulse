import Foundation
import UIKit
import os
import Darwin

/// Detects common jailbreak indicators on the device.
///
/// ADVISORY ONLY (IOS-AUDIT-SEC-005). Every check here is best-effort and
/// trivially bypassed by mainstream tooling (Shadow, Liberty Lite, SSLKillSwitch,
/// etc.). The result MUST NOT gate any security control — certificate pinning,
/// Keychain access, and premium entitlement are all enforced independently of
/// this. It only drives a soft, non-blocking warning (per App Store guidelines),
/// and is skipped entirely on Simulator to avoid false positives in development.
enum JailbreakDetector {

    /// Returns `true` if any jailbreak indicators are found. Best-effort and
    /// bypassable — see the type doc. Always returns `false` on Simulator.
    static var isJailbroken: Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        return checkSuspiciousPaths()
            || checkSuspiciousURLSchemes()
            || checkWritableSystemPaths()
            || checkDynamicLibraries()
            || checkForkRestriction()
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

    /// Non-string-matched signal (IOS-AUDIT-SEC-005): a correctly sandboxed iOS
    /// app is denied `fork()`; if the call succeeds the sandbox has been
    /// compromised (a strong jailbreak indicator). The child exits immediately
    /// and the parent reaps it. Still advisory and bypassable.
    private static func checkForkRestriction() -> Bool {
        let pid = fork()
        if pid < 0 {
            // fork() denied by the sandbox — expected on a stock device.
            return false
        }
        if pid == 0 {
            // Child process: terminate without running any app logic.
            _exit(0)
        }
        // Parent: reap the child so we don't leak a zombie.
        var status: Int32 = 0
        waitpid(pid, &status, 0)
        AppLogger.general.warning("Jailbreak indicator: fork() not restricted by sandbox")
        return true
    }
}
