package com.desmoines.aipulse.ui.components

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.ui.platform.LocalContext
import com.desmoines.aipulse.util.SafeLinkLauncher
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.desmoines.aipulse.R
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import kotlinx.coroutines.delay

private enum class WebViewState {
    LOADING,
    SUCCESS,
    ERROR,
    EMPTY,
    TIMEOUT,
}

/**
 * In-app WebView screen for Privacy Policy, Terms of Service, etc.
 * Uses AndroidView to host a native WebView within Compose.
 * Includes error states, empty state, and a 30-second timeout.
 *
 * @param url The URL to load
 * @param title Optional title shown in the top app bar
 * @param onNavigateBack Callback when back button is pressed
 */
@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebViewScreen(
    url: String,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null
) {
    var viewState by remember { mutableStateOf(if (url.isBlank()) WebViewState.EMPTY else WebViewState.LOADING) }
    var pageTitle by remember { mutableStateOf(title ?: "") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    val webViewContext = LocalContext.current
    // Host the screen was opened for; everything else is treated as external.
    val initialHost = remember(url) {
        runCatching { android.net.Uri.parse(url).host }.getOrNull()
    }

    // Timeout after 30 seconds
    LaunchedEffect(viewState) {
        if (viewState == WebViewState.LOADING) {
            delay(30_000L)
            if (viewState == WebViewState.LOADING) {
                viewState = WebViewState.TIMEOUT
            }
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        TopAppBar(
            title = {
                Text(
                    text = pageTitle,
                    maxLines = 1,
                    style = MaterialTheme.typography.titleMedium
                )
            },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.go_back)
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        )

        if (viewState == WebViewState.LOADING) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.primary
            )
        }

        when (viewState) {
            WebViewState.EMPTY -> {
                WebViewErrorContent(
                    icon = Icons.Filled.ErrorOutline,
                    title = stringResource(R.string.webview_nothing_to_display),
                    message = stringResource(R.string.webview_no_url),
                    onRetry = null,
                    onBack = onNavigateBack,
                )
            }
            WebViewState.ERROR -> {
                WebViewErrorContent(
                    icon = Icons.Filled.WifiOff,
                    title = stringResource(R.string.webview_failed_title),
                    message = errorMessage ?: stringResource(R.string.webview_failed_message),
                    onRetry = {
                        viewState = WebViewState.LOADING
                        errorMessage = null
                        webViewRef?.reload()
                    },
                    onBack = onNavigateBack,
                )
            }
            WebViewState.TIMEOUT -> {
                WebViewErrorContent(
                    icon = Icons.Filled.WifiOff,
                    title = stringResource(R.string.webview_timeout_title),
                    message = stringResource(R.string.webview_timeout_message),
                    onRetry = {
                        viewState = WebViewState.LOADING
                        webViewRef?.reload()
                    },
                    onBack = onNavigateBack,
                )
            }
            WebViewState.LOADING, WebViewState.SUCCESS -> {
                AndroidView(
                    factory = { context ->
                        WebView(context).apply {
                            webViewClient = object : WebViewClient() {
                                /**
                                 * Keeps the in-app browser on the host it was
                                 * opened for. This screen shows the privacy
                                 * policy and terms with JavaScript enabled, so
                                 * without a check any link, redirect or script
                                 * navigation could take a JS-enabled WebView
                                 * anywhere. Off-host links hand off to the
                                 * system browser instead.
                                 */
                                override fun shouldOverrideUrlLoading(
                                    view: WebView?,
                                    request: WebResourceRequest?,
                                ): Boolean {
                                    val target = request?.url ?: return false
                                    if (target.host.equals(initialHost, ignoreCase = true)) {
                                        return false
                                    }
                                    SafeLinkLauncher.openUrl(webViewContext, target.toString())
                                    return true
                                }

                                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                    // Reset to loading on navigation within the WebView
                                    viewState = WebViewState.LOADING
                                }

                                override fun onPageFinished(view: WebView?, url: String?) {
                                    if (viewState == WebViewState.LOADING) {
                                        viewState = WebViewState.SUCCESS
                                    }
                                    if (title == null) {
                                        pageTitle = view?.title ?: ""
                                    }
                                }

                                override fun onReceivedError(
                                    view: WebView?,
                                    request: WebResourceRequest?,
                                    error: WebResourceError?
                                ) {
                                    // Only handle main frame errors
                                    if (request?.isForMainFrame == true) {
                                        errorMessage = error?.description?.toString() ?: "Failed to load the page."
                                        viewState = WebViewState.ERROR
                                    }
                                }
                            }
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            // Honour the system font-size setting; a WebView
                            // ignores it by default, which fails WCAG resize.
                            settings.textZoom = resources.configuration.fontScale
                                .let { (it * 100).toInt() }
                            settings.allowFileAccess = false
                            settings.allowContentAccess = false
                            webViewRef = this
                            loadUrl(url)
                        }
                    },
                    onRelease = { webView ->
                        // Compose never destroys an AndroidView's view for you.
                        // A WebView left undestroyed keeps its renderer process
                        // and JS context alive for the life of the app.
                        webViewRef = null
                        webView.stopLoading()
                        webView.loadUrl("about:blank")
                        webView.removeAllViews()
                        webView.destroy()
                    },
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f)
                )
            }
        }
    }
}

@Composable
private fun WebViewErrorContent(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    message: String,
    onRetry: (() -> Unit)?,
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(56.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = message,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(24.dp))

        if (onRetry != null) {
            Button(
                onClick = onRetry,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(stringResource(R.string.retry))
            }

            Spacer(modifier = Modifier.height(12.dp))
        }

        Button(
            onClick = onBack,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        ) {
            Text(stringResource(R.string.go_back))
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun WebViewScreenPreview() {
    DesMoinesInsiderTheme {
        WebViewScreen(
            url = "https://example.com",
            title = "Privacy Policy",
            onNavigateBack = {}
        )
    }
}
