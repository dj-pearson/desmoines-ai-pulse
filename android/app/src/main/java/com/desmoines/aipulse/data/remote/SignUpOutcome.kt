package com.desmoines.aipulse.data.remote

import io.github.jan.supabase.postgrest.exception.PostgrestRestException

/**
 * What an email sign-up actually produced (AND-OVH-003).
 *
 * Sign-up used to be Result<Unit>, and a null session after signUpWith threw
 * NoUser. With email confirmation on, a null session is the normal answer:
 * GoTrue created the account and mailed a link. The user then saw an error
 * for an account that existed, and trying again told them the email was
 * already registered.
 */
sealed interface SignUpOutcome {

    /** A session came back; the user is signed in. */
    data object SignedIn : SignUpOutcome

    /** The account exists but has no session until the emailed link is opened. */
    data class ConfirmationRequired(val email: String) : SignUpOutcome

    companion object {

        /** Postgres unique_violation, which PostgREST passes through as `code`. */
        const val UNIQUE_VIOLATION = "23505"

        /**
         * Decide the outcome once signUpWith has returned.
         *
         * [sessionUserId] is the id of the signed-in user, or null when sign-up
         * left no session. With no session there is no profile insert: the
         * request would go out as anon and RLS would refuse it, so the row is
         * left to handle_new_user, which reads the same names and interests
         * from the sign-up metadata.
         *
         * With a session the client insert stays, because the trigger
         * migration (20261004000001) is not verified live in prod. When the
         * trigger did run, the insert collides with its row; that collision
         * means the profile exists, so it counts as success. Any other insert
         * failure is still a failure.
         */
        suspend fun resolve(
            email: String,
            sessionUserId: String?,
            insertProfile: suspend (userId: String) -> Unit,
        ): SignUpOutcome {
            val userId = sessionUserId ?: return ConfirmationRequired(email)
            try {
                insertProfile(userId)
            } catch (e: Exception) {
                if (!isUniqueViolation(e)) throw e
            }
            return SignedIn
        }

        fun isUniqueViolation(error: Throwable): Boolean =
            (error as? PostgrestRestException)?.code == UNIQUE_VIOLATION
    }
}
