package com.desmoines.aipulse.util

import java.io.File
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The permissions the app asks for are a decision, not whatever a dependency
 * merges in (AND-OVH-001).
 *
 * firebase-analytics merged com.google.android.gms.permission.AD_ID and the two
 * AdServices permissions into the release manifest. Nothing first-party uses
 * them, and an undeclared AD_ID is a Play Console advertising-ID mismatch. The
 * fix is three tools:node="remove" lines plus two meta-data flags that keep
 * Firebase Analytics off until consent; deleting any one of them brings the
 * problem back with nothing else failing. This test is what fails.
 *
 * READS THE SOURCE MANIFEST, RUNS NO CODE, like DeepLinkManifestParityTest. It
 * cannot see what a library merges in; android-ci.yml greps the merged release
 * manifest for that half.
 */
class ManifestPermissionAllowlistTest {

    private val moduleRoot: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .first { File(it, "src/main/AndroidManifest.xml").exists() }

    private val xml: String by lazy { File(moduleRoot, "src/main/AndroidManifest.xml").readText() }

    /** Strip comments so a permission named in prose does not count as declared. */
    private val xmlWithoutComments: String by lazy { xml.replace(Regex("""<!--[\s\S]*?-->"""), "") }

    private val usesPermissionTags: List<String> by lazy {
        Regex("""<uses-permission\b[\s\S]*?/>""").findAll(xmlWithoutComments).map { it.value }.toList()
    }

    private fun nameOf(tag: String): String? =
        Regex("""android:name="([^"]+)"""").find(tag)?.groupValues?.get(1)

    private fun isRemoval(tag: String) = tag.contains("""tools:node="remove"""")

    @Test
    fun `the manifest declares the tools namespace`() {
        assertTrue(
            xmlWithoutComments.contains("""xmlns:tools="http://schemas.android.com/tools""""),
            "AndroidManifest.xml lost xmlns:tools, so tools:node=\"remove\" no longer parses.",
        )
    }

    @Test
    fun `advertising permissions are removed from the merged manifest`() {
        val removed = usesPermissionTags.filter(::isRemoval).mapNotNull(::nameOf).toSet()
        val missing = REMOVED - removed
        assertTrue(
            missing.isEmpty(),
            "AndroidManifest.xml no longer strips $missing. firebase-analytics merges these back " +
                "into the release build, and nothing in the app uses them.",
        )
    }

    @Test
    fun `analytics and ad id collection start disabled`() {
        val application = Regex("""<application\b[\s\S]*</application>""").find(xmlWithoutComments)?.value
        assertTrue(application != null, "no <application> element in AndroidManifest.xml")
        for (flag in DISABLED_META_DATA) {
            val declared = Regex(
                """<meta-data\s+android:name="${Regex.escape(flag)}"\s+android:value="false"\s*/>""",
            ).containsMatchIn(application!!)
            assertTrue(
                declared,
                "<application> must carry <meta-data android:name=\"$flag\" android:value=\"false\" />. " +
                    "Without it Firebase collects before the user's consent is applied.",
            )
        }
    }

    @Test
    fun `every requested permission is on the allowlist`() {
        val requested = usesPermissionTags.filterNot(::isRemoval).mapNotNull(::nameOf).toSet()
        val unexpected = requested - ALLOWED
        assertTrue(
            unexpected.isEmpty(),
            "AndroidManifest.xml requests $unexpected, which is not on the allowlist. If the app " +
                "really needs it, add it to ALLOWED here with the reason, and update the Play " +
                "Console data-safety form.",
        )
    }

    private companion object {
        val REMOVED = setOf(
            "com.google.android.gms.permission.AD_ID",
            "android.permission.ACCESS_ADSERVICES_AD_ID",
            "android.permission.ACCESS_ADSERVICES_ATTRIBUTION",
        )

        val DISABLED_META_DATA = listOf(
            "firebase_analytics_collection_enabled",
            "google_analytics_adid_collection_enabled",
        )

        /**
         * What the source manifest declares today (each has a comment there
         * saying why), plus USE_BIOMETRIC, which androidx.biometric merges in
         * for BiometricLockController and which may be declared directly.
         */
        val ALLOWED = setOf(
            "android.permission.INTERNET",
            "android.permission.ACCESS_NETWORK_STATE",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.ACCESS_COARSE_LOCATION",
            "android.permission.POST_NOTIFICATIONS",
            "android.permission.RECEIVE_BOOT_COMPLETED",
            "android.permission.VIBRATE",
            "android.permission.USE_BIOMETRIC",
        )
    }
}
