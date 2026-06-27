package com.desmoines.aipulse.ui.screens.articles

import com.desmoines.aipulse.data.model.Article
import com.desmoines.aipulse.data.remote.ArticlesQuery
import com.desmoines.aipulse.data.remote.ArticlesResponse
import com.desmoines.aipulse.data.repository.ArticlesRepository
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ArticlesViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: ArticlesRepository

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        coEvery { repository.fetchCategories() } returns Result.success(listOf("Food", "Music"))
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun article(id: String) = Article(id = id, title = "Article $id")

    private fun page(ids: List<String>, hasMore: Boolean) =
        ArticlesResponse(ids.map(::article), totalCount = if (hasMore) 100 else ids.size, hasMore = hasMore)

    private fun vm() = ArticlesViewModel(repository)

    @Test
    fun `load populates the first page and categories`() = runTest(testDispatcher) {
        coEvery { repository.fetchArticles(any()) } returns Result.success(page(listOf("a", "b"), hasMore = true))
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(listOf("a", "b"), state.articles.map { it.id })
        assertEquals(listOf("Food", "Music"), state.categories)
        assertTrue(state.hasMore)
        assertFalse(state.isLoading)
    }

    @Test
    fun `loadMore appends the next page at the running offset`() = runTest(testDispatcher) {
        coEvery { repository.fetchArticles(match { it.offset == 0 }) } returns Result.success(page(listOf("a", "b"), hasMore = true))
        coEvery { repository.fetchArticles(match { it.offset == 2 }) } returns Result.success(page(listOf("c"), hasMore = false))
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.loadMore()
        advanceUntilIdle()

        assertEquals(listOf("a", "b", "c"), viewModel.uiState.value.articles.map { it.id })
        assertFalse(viewModel.uiState.value.hasMore)
    }

    @Test
    fun `selecting a category refetches with that filter`() = runTest(testDispatcher) {
        coEvery { repository.fetchArticles(any()) } returns Result.success(page(listOf("a"), hasMore = false))
        val viewModel = vm()
        advanceUntilIdle()

        var lastQuery: ArticlesQuery? = null
        coEvery { repository.fetchArticles(any()) } answers {
            lastQuery = firstArg()
            Result.success(page(listOf("food1"), hasMore = false))
        }
        viewModel.onCategorySelected("Food")
        advanceUntilIdle()

        assertEquals("Food", viewModel.uiState.value.selectedCategory)
        assertEquals("Food", lastQuery?.category)
        assertEquals(listOf("food1"), viewModel.uiState.value.articles.map { it.id })
    }

    @Test
    fun `fetch failure keeps loaded content and shows a retry banner`() = runTest(testDispatcher) {
        coEvery { repository.fetchArticles(match { it.offset == 0 }) } returns Result.success(page(listOf("a", "b"), hasMore = true))
        val viewModel = vm()
        advanceUntilIdle()

        coEvery { repository.fetchArticles(match { it.offset == 2 }) } returns Result.failure(RuntimeException("boom"))
        viewModel.loadMore()
        advanceUntilIdle()

        // Loaded content retained; error surfaced.
        assertEquals(listOf("a", "b"), viewModel.uiState.value.articles.map { it.id })
        assertNotNull(viewModel.uiState.value.errorMessage)
    }
}
