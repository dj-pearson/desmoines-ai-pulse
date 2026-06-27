package com.desmoines.aipulse.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.util.markdown.MarkdownBlock
import com.desmoines.aipulse.util.markdown.MarkdownParser

private const val LINK_TAG = "URL"

/**
 * Renders article markdown natively (ANDP-031). Parse failures fall back to
 * plain text so content is never lost. Links are dispatched via [onLinkClick]
 * (the caller enforces safe https-only opening).
 */
@Composable
fun ArticleMarkdown(
    content: String,
    onLinkClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val blocks = rememberBlocks(content)
    Column(modifier = modifier) {
        if (blocks == null) {
            // Fallback: never lose content on a parser error.
            Text(content, style = MaterialTheme.typography.bodyLarge)
        } else {
            blocks.forEach { block ->
                MarkdownBlockView(block, onLinkClick)
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun rememberBlocks(content: String): List<MarkdownBlock>? =
    androidx.compose.runtime.remember(content) {
        runCatching { MarkdownParser.parse(content) }.getOrNull()
    }

@Composable
private fun MarkdownBlockView(block: MarkdownBlock, onLinkClick: (String) -> Unit) {
    when (block) {
        is MarkdownBlock.Heading -> Text(
            text = inline(block.text),
            style = headingStyle(block.level),
            fontWeight = FontWeight.Bold,
        )
        is MarkdownBlock.Paragraph -> LinkableText(inline(block.text), MaterialTheme.typography.bodyLarge, onLinkClick)
        is MarkdownBlock.BulletList -> Column {
            block.items.forEach { item ->
                Row {
                    Text("•  ", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.primary)
                    LinkableText(inline(item), MaterialTheme.typography.bodyLarge, onLinkClick)
                }
            }
        }
        is MarkdownBlock.OrderedList -> Column {
            block.items.forEachIndexed { index, item ->
                Row {
                    Text("${index + 1}.  ", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.primary)
                    LinkableText(inline(item), MaterialTheme.typography.bodyLarge, onLinkClick)
                }
            }
        }
        is MarkdownBlock.Quote -> Row(modifier = Modifier.fillMaxWidth()) {
            Box(modifier = Modifier.width(3.dp).height(20.dp).background(MaterialTheme.colorScheme.primary))
            Spacer(Modifier.width(10.dp))
            Text(
                block.text,
                style = MaterialTheme.typography.bodyLarge,
                fontStyle = FontStyle.Italic,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        is MarkdownBlock.Code -> Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .horizontalScroll(rememberScrollState())
                .padding(12.dp),
        ) {
            Text(block.text, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyMedium)
        }
        is MarkdownBlock.Image -> Box(
            modifier = Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(12.dp)),
        ) {
            CachedAsyncImage(url = block.url, contentDescription = block.alt, modifier = Modifier.fillMaxWidth().height(200.dp))
        }
        MarkdownBlock.Rule -> HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
    }
}

@Composable
private fun LinkableText(text: AnnotatedString, style: androidx.compose.ui.text.TextStyle, onLinkClick: (String) -> Unit) {
    val color = MaterialTheme.colorScheme.onSurface
    ClickableText(
        text = text,
        style = style.copy(color = color),
        onClick = { offset ->
            text.getStringAnnotations(LINK_TAG, offset, offset).firstOrNull()?.let { onLinkClick(it.item) }
        },
    )
}

@Composable
private fun headingStyle(level: Int) = when (level) {
    1 -> MaterialTheme.typography.headlineMedium
    2 -> MaterialTheme.typography.headlineSmall
    3 -> MaterialTheme.typography.titleLarge
    4 -> MaterialTheme.typography.titleMedium
    5 -> MaterialTheme.typography.titleSmall
    else -> MaterialTheme.typography.bodyLarge
}

/** Parse inline bold (**), italic (*), code (`), and [label](url) links. */
@Composable
private fun inline(text: String): AnnotatedString {
    val linkColor = MaterialTheme.colorScheme.primary
    val codeBg = MaterialTheme.colorScheme.surfaceVariant
    return buildAnnotatedString {
        var i = 0
        while (i < text.length) {
            when {
                text.startsWith("`", i) -> {
                    val end = text.indexOf('`', i + 1)
                    if (end > i) {
                        withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = codeBg)) {
                            append(text.substring(i + 1, end))
                        }
                        i = end + 1
                    } else { append('`'); i++ }
                }
                text.startsWith("**", i) -> {
                    val end = text.indexOf("**", i + 2)
                    if (end > i) {
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(text.substring(i + 2, end)) }
                        i = end + 2
                    } else { append("**"); i += 2 }
                }
                text.startsWith("*", i) -> {
                    val end = text.indexOf('*', i + 1)
                    if (end > i) {
                        withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(text.substring(i + 1, end)) }
                        i = end + 1
                    } else { append('*'); i++ }
                }
                text.startsWith("[", i) -> {
                    val close = text.indexOf(']', i + 1)
                    val open = if (close > 0) text.getOrNull(close + 1) else null
                    if (close > i && open == '(') {
                        val paren = text.indexOf(')', close + 2)
                        if (paren > close) {
                            val label = text.substring(i + 1, close)
                            val url = text.substring(close + 2, paren)
                            pushStringAnnotation(LINK_TAG, url)
                            withStyle(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)) { append(label) }
                            pop()
                            i = paren + 1
                        } else { append(text[i]); i++ }
                    } else { append(text[i]); i++ }
                }
                else -> { append(text[i]); i++ }
            }
        }
    }
}
