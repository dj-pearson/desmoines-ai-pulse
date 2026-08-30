package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SafeLinkLauncherTest {

    @Test
    fun `accepts http and https with a host`() {
        assertTrue(SafeLinkLauncher.isSafeWebUrl("https://example.com"))
        assertTrue(SafeLinkLauncher.isSafeWebUrl("http://example.com/path?q=1#frag"))
        assertTrue(SafeLinkLauncher.isSafeWebUrl("HTTPS://Example.com"))
        assertTrue(SafeLinkLauncher.isSafeWebUrl("  https://example.com  "))
    }

    @Test
    fun `rejects unsafe and unknown schemes`() {
        assertFalse(SafeLinkLauncher.isSafeWebUrl("javascript:alert(1)"))
        assertFalse(SafeLinkLauncher.isSafeWebUrl("file:///etc/passwd"))
        assertFalse(SafeLinkLauncher.isSafeWebUrl("data:text/html,<script>"))
        assertFalse(SafeLinkLauncher.isSafeWebUrl("intent://x#Intent;scheme=foo;end"))
        assertFalse(SafeLinkLauncher.isSafeWebUrl("content://provider/x"))
        assertFalse(SafeLinkLauncher.isSafeWebUrl("mailto:hi@example.com"))
        assertFalse(SafeLinkLauncher.isSafeWebUrl("ftp://example.com"))
    }

    @Test
    fun `rejects malformed and empty inputs`() {
        assertFalse(SafeLinkLauncher.isSafeWebUrl(null))
        assertFalse(SafeLinkLauncher.isSafeWebUrl(""))
        assertFalse(SafeLinkLauncher.isSafeWebUrl("   "))
        assertFalse(SafeLinkLauncher.isSafeWebUrl("https://")) // scheme but no host
        assertFalse(SafeLinkLauncher.isSafeWebUrl("example.com")) // no scheme
        assertFalse(SafeLinkLauncher.isSafeWebUrl("https:///path")) // empty host
    }
}
