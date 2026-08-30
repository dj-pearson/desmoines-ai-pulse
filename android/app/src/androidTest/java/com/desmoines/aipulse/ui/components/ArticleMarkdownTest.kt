package com.desmoines.aipulse.ui.components

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Rendering-layer coverage for [ArticleMarkdown]. Block parsing is already
 * covered by MarkdownParserTest as a JVM unit test; these run on a device
 * because they exercise composition, semantics and link hit-testing.
 */
@RunWith(AndroidJUnit4::class)
class ArticleMarkdownTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun render(content: String, onLinkClick: (String) -> Unit = {}) {
        composeRule.setContent {
            DesMoinesInsiderTheme {
                ArticleMarkdown(content = content, onLinkClick = onLinkClick)
            }
        }
    }

    @Test
    fun rendersHeadingsAndParagraphs() {
        render("# Des Moines\n\nA paragraph of article body copy.")

        composeRule.onNodeWithText("Des Moines").assertIsDisplayed()
        composeRule.onNodeWithText("A paragraph of article body copy.").assertIsDisplayed()
    }

    @Test
    fun rendersBulletAndOrderedListItems() {
        render("- Bulleted item\n\n1. Numbered item")

        composeRule.onNodeWithText("Bulleted item").assertIsDisplayed()
        composeRule.onNodeWithText("Numbered item").assertIsDisplayed()
    }

    @Test
    fun stripsInlineEmphasisMarkers() {
        render("Text with **bold** and *italic* and `code` spans.")

        composeRule.onNodeWithText("Text with bold and italic and code spans.").assertIsDisplayed()
    }

    /**
     * Guards the ClickableText -> LinkAnnotation migration: the link has to stay
     * clickable and still hand the caller the raw URL, since the caller is what
     * enforces https-only opening.
     */
    @Test
    fun clickingALinkDispatchesItsUrl() {
        val clicked = mutableListOf<String>()
        render("[Visit the site](https://desmoinesinsider.com/events)") { clicked += it }

        composeRule.onNodeWithText("Visit the site").performClick()

        assertEquals(listOf("https://desmoinesinsider.com/events"), clicked)
    }

    @Test
    fun rendersLinkLabelWithoutMarkdownSyntax() {
        render("See [our events page](https://desmoinesinsider.com/events) for more.")

        composeRule.onNodeWithText("See our events page for more.").assertIsDisplayed()
    }

    @Test
    fun rendersUnparseableContentRatherThanNothing() {
        // A stray, unterminated link should degrade to literal text, never vanish.
        render("Dangling [label without a target")

        composeRule.onNodeWithText("Dangling [label without a target").assertIsDisplayed()
    }
}
