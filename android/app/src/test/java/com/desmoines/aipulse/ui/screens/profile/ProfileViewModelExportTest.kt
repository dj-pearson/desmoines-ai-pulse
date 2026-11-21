package com.desmoines.aipulse.ui.screens.profile

import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.util.AnalyticsService
import com.desmoines.aipulse.util.ConsentService
import com.desmoines.aipulse.util.OnboardingPreferences
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * XPLAT-007: Android had no right-of-access path at all. It now calls
 * export-user-data, the same server-side export web is meant to move to, and
 * saves the result where the user chooses.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelExportTest {

    private val testDispatcher = StandardTestDispatcher()

    // The shape export-user-data returns (supabase/functions/export-user-data/index.ts).
    private val export = """
        {"exportedAt":"2026-11-07T12:00:00.000Z","userId":"u1","email":"a@b.c",
         "data":{"profiles":[{"user_id":"u1"}],"content_favorites":[{"id":1}]},
         "tablesConsidered":80,"tablesWithData":2,
         "retentionBasis":{"stripe_invoices":"tax"},"unavailable":[]}
    """.trimIndent()

    private val partial = """
        {"exportedAt":"2026-11-07T12:00:00.000Z","data":{},"tablesConsidered":80,"tablesWithData":0,
         "unavailable":[{"table":"x","code":"42P01","message":"gone"},{"table":"y","message":"denied"}]}
    """.trimIndent()

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm(): ProfileViewModel {
        val authRepository = mockk<AuthRepository>(relaxed = true)
        every { authRepository.sessionStatus } returns null
        val consentService = mockk<ConsentService>(relaxed = true)
        every { consentService.locationConsent } returns MutableStateFlow(false)
        every { consentService.analyticsConsent } returns MutableStateFlow(true)
        return ProfileViewModel(
            authRepository,
            mockk<OnboardingPreferences>(relaxed = true),
            consentService,
            mockk<AnalyticsService>(relaxed = true),
        )
    }

    // MARK: - Classification

    @Test
    fun `a real export is ready and keeps every field`() {
        val outcome = DataExportResponse.classify(200, export)

        val ready = assertInstanceOf(DataExportOutcome.Ready::class.java, outcome)
        assertEquals(2, ready.tablesWithData)
        assertEquals(80, ready.tablesConsidered)
        assertEquals(0, ready.unavailableCount)
        // Saved as the server sent it, only reformatted: nothing is dropped.
        assertTrue(ready.json.contains("\"retentionBasis\""))
        assertTrue(ready.json.contains("\"content_favorites\""))
    }

    @Test
    fun `unreadable tables are counted, not hidden`() {
        val ready = DataExportResponse.classify(200, partial) as DataExportOutcome.Ready

        assertEquals(2, ready.unavailableCount)
    }

    @Test
    fun `an undeployed function is reported as not available`() {
        assertEquals(DataExportOutcome.NotAvailable, DataExportResponse.classify(404, "Not Found"))
    }

    @Test
    fun `a 401 is reported as signed out`() {
        assertEquals(DataExportOutcome.NotSignedIn, DataExportResponse.classify(401, """{"error":"Invalid authentication"}"""))
    }

    @Test
    fun `a 2xx that is not an export is a failure, not a file`() {
        assertEquals(DataExportOutcome.Failed(200), DataExportResponse.classify(200, "not json"))
        assertEquals(DataExportOutcome.Failed(200), DataExportResponse.classify(200, """{"error":"x"}"""))
        assertEquals(DataExportOutcome.Failed(200), DataExportResponse.classify(200, "[]"))
    }

    @Test
    fun `a server error is a failure with its status`() {
        assertEquals(DataExportOutcome.Failed(500), DataExportResponse.classify(500, """{"error":"boom"}"""))
    }

    @Test
    fun `the file name carries the date`() {
        assertEquals("desmoines-insider-data-2026-11-07.json", DataExportResponse.fileName(LocalDate.of(2026, 11, 7)))
    }

    // MARK: - UI state

    @Test
    fun `a ready export waits for the picker and is dropped after saving`() {
        val viewModel = vm()

        viewModel.handleExportResponse(200, export)
        val pending = viewModel.pendingExport.value!!
        assertFalse(pending.pickerShown)

        viewModel.markExportPickerShown()
        assertTrue(viewModel.pendingExport.value!!.pickerShown)

        viewModel.finishExport(DataExportSaveResult.SAVED)
        assertNull(viewModel.pendingExport.value)
        val notice = viewModel.exportNotice.value!!
        assertTrue(notice.contains(pending.fileName))
        assertTrue(notice.contains("2 of the 80"))
        assertFalse(notice.contains("incomplete"))
        assertNull(viewModel.errorMessage.value)
    }

    @Test
    fun `a partial export says it is incomplete`() {
        val viewModel = vm()

        viewModel.handleExportResponse(200, partial)
        viewModel.finishExport(DataExportSaveResult.SAVED)

        assertTrue(viewModel.exportNotice.value!!.contains("incomplete: 2"))
    }

    @Test
    fun `a cancelled save drops the export without a message`() {
        val viewModel = vm()

        viewModel.handleExportResponse(200, export)
        viewModel.finishExport(DataExportSaveResult.CANCELLED)

        assertNull(viewModel.pendingExport.value)
        assertNull(viewModel.exportNotice.value)
        assertNull(viewModel.errorMessage.value)
    }

    @Test
    fun `a failed write is reported`() {
        val viewModel = vm()

        viewModel.handleExportResponse(200, export)
        viewModel.finishExport(DataExportSaveResult.FAILED)

        assertNull(viewModel.pendingExport.value)
        assertEquals(DataExportResponse.SAVE_FAILED_MESSAGE, viewModel.errorMessage.value)
    }

    @Test
    fun `a 404 tells the user where to ask instead`() {
        val viewModel = vm()

        viewModel.handleExportResponse(404, "")

        assertNull(viewModel.pendingExport.value)
        assertEquals(DataExportResponse.NOT_AVAILABLE_MESSAGE, viewModel.errorMessage.value)
        assertTrue(viewModel.errorMessage.value!!.contains(DataExportResponse.PRIVACY_EMAIL))
    }
}
