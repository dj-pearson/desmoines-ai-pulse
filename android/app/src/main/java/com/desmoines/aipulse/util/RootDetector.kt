package com.desmoines.aipulse.util

import android.os.Build
import java.io.File

/**
 * Detects common root indicators on Android devices.
 * Mirrors iOS JailbreakDetector.swift — shows a soft warning only, does NOT block app usage.
 *
 * Checks are skipped on emulator to avoid false positives during development.
 */
object RootDetector {

    /**
     * Returns `true` if any root indicators are found.
     * Always returns `false` on emulator.
     */
    val isRooted: Boolean
        get() {
            if (isEmulator) return false
            return checkSuBinary()
                || checkRootManagementApps()
                || checkSuspiciousPaths()
                || checkBuildTags()
                || checkWritableSystemPaths()
        }

    /**
     * Whether the device is running on an emulator.
     */
    private val isEmulator: Boolean
        get() = Build.FINGERPRINT.startsWith("generic")
            || Build.FINGERPRINT.startsWith("unknown")
            || Build.MODEL.contains("google_sdk")
            || Build.MODEL.contains("Emulator")
            || Build.MODEL.contains("Android SDK built for x86")
            || Build.MANUFACTURER.contains("Genymotion")
            || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
            || Build.PRODUCT == "google_sdk"
            || Build.PRODUCT == "sdk_gphone64_arm64"
            || Build.PRODUCT.startsWith("sdk_")
            || Build.HARDWARE.contains("goldfish")
            || Build.HARDWARE.contains("ranchu")

    // MARK: - Checks

    /**
     * Checks if the `su` binary exists in common locations.
     */
    private fun checkSuBinary(): Boolean {
        val paths = arrayOf(
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/su/bin/su",
        )

        for (path in paths) {
            if (File(path).exists()) {
                AppLogger.general.warning("Root indicator: su binary found")
                return true
            }
        }
        return false
    }

    /**
     * Checks for known root management apps (Magisk, SuperSU, Xposed, etc.).
     */
    private fun checkRootManagementApps(): Boolean {
        val packages = arrayOf(
            "com.topjohnwu.magisk",           // Magisk Manager
            "com.koushikdutta.superuser",      // SuperUser
            "com.noshufou.android.su",         // SuperUser (legacy)
            "eu.chainfire.supersu",            // SuperSU
            "com.thirdparty.superuser",        // SuperUser variant
            "de.robv.android.xposed.installer", // Xposed Installer
            "com.saurik.substrate",            // Cydia Substrate
            "com.zachspong.temprootremovejb",  // Root removal spoof
            "com.ramdroid.appquarantine",      // App Quarantine
            "com.amphoras.hidemyroot",         // Hide My Root
            "com.devadvance.rootcloak",        // Root Cloak
        )

        for (pkg in packages) {
            val packageDir = File("/data/data/$pkg")
            if (packageDir.exists()) {
                AppLogger.general.warning("Root indicator: root management app found")
                return true
            }
        }
        return false
    }

    /**
     * Checks for paths commonly created by root tools.
     */
    private fun checkSuspiciousPaths(): Boolean {
        val suspiciousPaths = arrayOf(
            "/system/app/Superuser.apk",
            "/system/etc/init.d",
            "/system/xbin/daemonsu",
            "/system/xbin/busybox",
            "/data/adb/magisk",               // Magisk data directory
            "/cache/magisk.log",
            "/data/adb/modules",              // Magisk modules
        )

        for (path in suspiciousPaths) {
            if (File(path).exists()) {
                AppLogger.general.warning("Root indicator: suspicious path found")
                return true
            }
        }
        return false
    }

    /**
     * Checks if the build was signed with test keys (common on custom ROMs).
     */
    private fun checkBuildTags(): Boolean {
        val tags = Build.TAGS
        if (tags != null && tags.contains("test-keys")) {
            AppLogger.general.warning("Root indicator: test-keys in build tags")
            return true
        }
        return false
    }

    /**
     * Checks if the app can write to system-protected paths.
     * On a non-rooted device this should always fail.
     */
    private fun checkWritableSystemPaths(): Boolean {
        val systemPaths = arrayOf("/system", "/system/bin", "/system/sbin", "/vendor/bin")

        for (path in systemPaths) {
            val dir = File(path)
            if (dir.exists() && dir.canWrite()) {
                AppLogger.general.warning("Root indicator: writable system path detected")
                return true
            }
        }
        return false
    }
}
