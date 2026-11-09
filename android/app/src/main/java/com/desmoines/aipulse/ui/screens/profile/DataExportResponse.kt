package com.desmoines.aipulse.ui.screens.profile

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import java.time.LocalDate

/**
 * Right of access on Android (XPLAT-007, Android half).
 *
 * The export is assembled server-side by export-user-data, which walks the same
 * PURGE_TABLES + RETAINED_TABLES list the deletion path uses, so access and
 * erasure cannot drift. The client does no assembly of its own on purpose: a
 * client-side walk goes through RLS, and a table the user cannot select from
 * answers [] rather than an error, which would hand the user a legal-rights
 * document full of false "you have no data here" entries.
 *
 * The function answers 404 until it is deployed (edge-deploy-baseline.json).
 * That case gets its own outcome so the app can say so and point at the
 * privacy address, instead of reporting a generic failure.
 */
sealed interface DataExportOutcome {
    /** The export decoded; [json] is the pretty-printed document to save. */
    data class Ready(
        val json: String,
        val tablesWithData: Int?,
        val tablesConsidered: Int?,
        /** Tables the server could not read. Non-zero means the copy is incomplete. */
        val unavailableCount: Int,
    ) : DataExportOutcome

    /** 404: the function is not deployed yet. */
    data object NotAvailable : DataExportOutcome

    /** 401: the session is gone or invalid. */
    data object NotSignedIn : DataExportOutcome

    /** Anything else, including a 2xx whose body is not an export. */
    data class Failed(val status: Int) : DataExportOutcome
}

/** A decoded export waiting for the user to pick where it goes. */
data class PendingDataExport(
    val json: String,
    val fileName: String,
    val tablesWithData: Int?,
    val tablesConsidered: Int?,
    val unavailableCount: Int,
    /** Set once the system file picker has been opened, so recomposition does not open a second one. */
    val pickerShown: Boolean = false,
)

/** How the save step ended. */
enum class DataExportSaveResult { SAVED, CANCELLED, FAILED }

object DataExportResponse {

    const val MIME_TYPE = "application/json"

    const val PRIVACY_EMAIL = "privacy@desmoinesinsider.com"

    const val NOT_AVAILABLE_MESSAGE =
        "Data export isn't available in the app yet. Email $PRIVACY_EMAIL from the address on your " +
            "account and we'll send you a copy of your data."

    const val NOT_SIGNED_IN_MESSAGE =
        "Your session has expired. Sign in again, then export your data."

    const val SAVE_FAILED_MESSAGE =
        "Your data was downloaded but could not be saved to that location. Try again and pick a different folder."

    private val reader = Json { ignoreUnknownKeys = true }
    private val writer = Json { prettyPrint = true }

    fun classify(status: Int, body: String): DataExportOutcome {
        when (status) {
            404 -> return DataExportOutcome.NotAvailable
            401 -> return DataExportOutcome.NotSignedIn
        }
        if (status !in 200..299) return DataExportOutcome.Failed(status)

        val root = runCatching { reader.parseToJsonElement(body) }.getOrNull() as? JsonObject
            ?: return DataExportOutcome.Failed(status)
        // Both fields are always present in a real export (export-user-data/index.ts).
        // A 2xx without them is not something to hand the user as their data.
        if (root["data"] !is JsonObject || root["exportedAt"] !is JsonPrimitive) {
            return DataExportOutcome.Failed(status)
        }

        return DataExportOutcome.Ready(
            json = writer.encodeToString(JsonElement.serializer(), root),
            tablesWithData = (root["tablesWithData"] as? JsonPrimitive)?.intOrNull,
            tablesConsidered = (root["tablesConsidered"] as? JsonPrimitive)?.intOrNull,
            unavailableCount = (root["unavailable"] as? JsonArray)?.size ?: 0,
        )
    }

    fun fileName(today: LocalDate = LocalDate.now()): String = "desmoines-insider-data-$today.json"

    /**
     * What to tell the user once the file is saved. An export that could not
     * read some tables says so: a copy that is quietly incomplete is the defect
     * the web export had for months.
     */
    fun savedMessage(export: PendingDataExport): String {
        val counts = if (export.tablesWithData != null && export.tablesConsidered != null) {
            " It includes data from ${export.tablesWithData} of the ${export.tablesConsidered} places we store account data."
        } else {
            ""
        }
        val gap = if (export.unavailableCount > 0) {
            " This copy is incomplete: ${export.unavailableCount} of those places could not be read. They are " +
                "listed under \"unavailable\" in the file; email $PRIVACY_EMAIL if you need them."
        } else {
            ""
        }
        return "Your data was saved to ${export.fileName}.$counts$gap"
    }
}
