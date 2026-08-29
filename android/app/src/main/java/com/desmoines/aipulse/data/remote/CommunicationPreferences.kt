package com.desmoines.aipulse.data.remote

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/**
 * The one marketing-consent bag, and the two rules that govern reading and
 * writing it (WEB-LEGAL-012).
 *
 * `profiles.communication_preferences` is the key every sender ultimately gates
 * on: lifecycle-classifier.ts derives `lifecycle_signals.messagingAllowed` from
 * it, and every nurture, re-engagement, churn, milestone and outreach agent
 * reads that. So this column is the opt-out, for all three clients.
 *
 * RULE 1 - ABSENCE MEANS OPTED IN. Every sender tests `!== false`, so a missing
 * key is consent by construction. That is deliberate and settled (AC5), and it
 * has a sharp edge: destroying a stored `false` silently opts the user back in,
 * with nothing failing anywhere. Which leads to:
 *
 * RULE 2 - MERGE, NEVER REPLACE. A PostgREST update of a jsonb column replaces
 * the whole value. This bag is shared - taste_preferences, ui_preferences and
 * the notification keys all live in it - and on web, PreferencesManager wrote it
 * without reading first and deleted the other three writers' keys, marketing
 * consent among them. Any writer here reads first, merges, and fails the write
 * if the read failed. Falling back to an empty bag IS the data-losing write.
 *
 * The helpers below are pure so the rules can be tested without a device, a
 * network or a Supabase client - see CommunicationPreferencesTest.
 */
object CommunicationPreferences {

    /**
     * The email-channel key. Named to match what the web clients write and what
     * lifecycle-classifier.ts reads; marketing-consent-contract.test.ts asserts
     * that writer and reader still agree, and renaming this without renaming it
     * there makes every stored opt-out invisible again.
     */
    const val EMAIL_NOTIFICATIONS = "email_notifications"

    /**
     * The bag with one key set, every other key preserved.
     */
    fun merge(existing: JsonObject, key: String, value: Boolean): JsonObject =
        JsonObject(existing.toMutableMap().apply { put(key, JsonPrimitive(value)) })

    /**
     * Whether mail is allowed for [key].
     *
     * Only an explicit boolean `false` opts out - matching `!== false` on the
     * server rather than approximating it. A missing key, a null, a string or an
     * object all read as opted in, because that is what the senders will do with
     * them, and a client that disagreed with the senders would show a state the
     * user does not actually have.
     */
    fun isOptedIn(bag: JsonObject?, key: String): Boolean {
        val value = bag?.get(key) as? JsonPrimitive ?: return true
        // isString is the whole point of this line. booleanOrNull parses the raw
        // content, so the JSON STRING "false" comes back as false - and `"false"
        // !== false` is true in JS, so the senders would mail that user while
        // this said they had opted out. Only a real JSON boolean counts.
        if (value.isString) return true
        return value.booleanOrNull != false
    }
}
