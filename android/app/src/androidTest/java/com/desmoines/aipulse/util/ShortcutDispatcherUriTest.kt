package com.desmoines.aipulse.util

import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * ShortcutDispatcher against real Uri parsing (AND-AUDIT-014 AC4).
 *
 * ShortcutDispatcherTest already exists as a JVM test and it MOCKS Uri: it stubs
 * scheme, host and getQueryParameter directly. That is a legitimate way to test
 * the `when (uri.host)` dispatch, and it is why this file is not a duplicate -
 * everything the mock supplies is the half that was never tested. The shipped
 * shortcut in res/xml/shortcuts.xml is
 *
 *     com.desmoines.aipulse://ask-pulse?q=What%27s%20good%20in%20Des%20Moines%20tonight%3F
 *
 * and whether that string becomes the sentence a user sees pre-filled in Ask
 * Pulse is decided entirely by android.net.Uri, which a mock replaces.
 *
 * Uri.parse returns null under unitTests.isReturnDefaultValues, so these cannot
 * be JVM tests: they would assert on nulls and pass.
 */
@RunWith(AndroidJUnit4::class)
class ShortcutDispatcherUriTest {

    /** The exact URI the launcher shortcut ships. Kept in sync by ShortcutManifestParityTest. */
    private val shippedAskPulse =
        "com.desmoines.aipulse://ask-pulse?q=What%27s%20good%20in%20Des%20Moines%20tonight%3F"

    private fun dispatch(url: String): ShortcutDispatcher.Pending? {
        val dispatcher = ShortcutDispatcher()
        val handled = dispatcher.handleIntent(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        return if (handled) dispatcher.consume() else null
    }

    @Test
    fun theShippedShortcutArrivesAsAReadableSentence() {
        // The percent-encoding is the point: %27 -> apostrophe, %20 -> space,
        // %3F -> question mark. If this ever regressed the user would see the
        // raw encoding pre-filled in the chat box.
        assertEquals(
            ShortcutDispatcher.Pending.AskPulse("What's good in Des Moines tonight?"),
            dispatch(shippedAskPulse),
        )
    }

    @Test
    fun theOtherTwoShippedShortcutsCarryNoFilters() {
        assertEquals(
            ShortcutDispatcher.Pending.FindRestaurants(cuisine = null, area = null, openNow = false),
            dispatch("com.desmoines.aipulse://find-restaurants"),
        )
        assertEquals(
            ShortcutDispatcher.Pending.FindEvents(category = null, datePreset = null),
            dispatch("com.desmoines.aipulse://find-events"),
        )
    }

    @Test
    fun filtersRoundTripThroughRealPercentEncoding() {
        assertEquals(
            ShortcutDispatcher.Pending.FindRestaurants(cuisine = "café", area = "East Village", openNow = true),
            dispatch("com.desmoines.aipulse://find-restaurants?cuisine=caf%C3%A9&area=East%20Village&openNow=true"),
        )
    }

    @Test
    fun blankFiltersBecomeNullRatherThanEmptyStrings() {
        // A blank filter that survived as "" would narrow a search to nothing.
        assertEquals(
            ShortcutDispatcher.Pending.FindEvents(category = null, datePreset = null),
            dispatch("com.desmoines.aipulse://find-events?category=%20%20&datePreset="),
        )
    }

    @Test
    fun openNowIsOnlyTrueForTheExactLowercaseWord() {
        // toBooleanStrictOrNull is case-sensitive. Asserted rather than assumed,
        // because an Assistant App Action sending "True" would silently drop the
        // filter and the user would get every restaurant instead of open ones.
        fun openNow(v: String) =
            (dispatch("com.desmoines.aipulse://find-restaurants?openNow=$v") as ShortcutDispatcher.Pending.FindRestaurants).openNow

        assertTrue(openNow("true"))
        assertFalse(openNow("True"))
        assertFalse(openNow("TRUE"))
        assertFalse(openNow("1"))
        assertFalse(openNow("yes"))
    }

    @Test
    fun aPlusIsDecodedAsASpace() {
        // MEASURED, and it contradicted what I expected. `+` is form encoding
        // rather than URI encoding, so the reasonable guess is that Uri leaves
        // it alone - and Android's getQueryParameter converts it anyway
        // (UriCodec.decode with convertPlus = true). Written down here because a
        // mocked Uri cannot express either answer, and the difference is whether
        // an Assistant query arrives as a sentence or with plus signs in it.
        assertEquals(
            ShortcutDispatcher.Pending.AskPulse("live music"),
            dispatch("com.desmoines.aipulse://ask-pulse?q=live+music"),
        )
    }

    @Test
    fun anAskPulseLinkWithNoQueryIsStillHandled() {
        assertEquals(
            ShortcutDispatcher.Pending.AskPulse(""),
            dispatch("com.desmoines.aipulse://ask-pulse"),
        )
    }

    @Test
    fun anOpaqueUriIsRejectedRatherThanThrowing() {
        // Without the "//" this is an opaque URI: host is null, and
        // getQueryParameter would throw UnsupportedOperationException if the
        // host check did not come first.
        assertEquals(null, dispatch("com.desmoines.aipulse:ask-pulse?q=x"))
    }

    @Test
    fun aForeignSchemeAndAnUnknownHostAreBothRejected() {
        assertEquals(null, dispatch("com.example.other://ask-pulse?q=x"))
        assertEquals(null, dispatch("com.desmoines.aipulse://find-hotels?q=x"))
    }
}
