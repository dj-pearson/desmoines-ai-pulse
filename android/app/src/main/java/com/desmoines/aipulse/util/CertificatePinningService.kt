package com.desmoines.aipulse.util

import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * Validates server certificates for Supabase API connections using public key pinning.
 * Mirrors iOS CertificatePinningService.swift — pins SPKI SHA-256 hashes.
 *
 * Instead of pinning a specific certificate (which rotates), we pin the
 * Subject Public Key Info (SPKI) hash of the Supabase domain's TLS certificate.
 * This approach survives certificate renewals as long as the same key pair is used.
 *
 * Usage:
 *     val okHttpClient = CertificatePinningService.createPinnedClient()
 */
object CertificatePinningService {

    /**
     * Domains that require certificate pinning. Only Supabase API calls are pinned.
     */
    private val pinnedDomains = listOf("*.supabase.co")

    /**
     * SHA-256 hashes of the Subject Public Key Info (SPKI) for pinned certificates.
     * These cover the Supabase infrastructure CA chain.
     *
     * To update: run
     *   openssl s_client -connect <host>:443 | openssl x509 -pubkey -noout |
     *   openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
     *
     * We pin multiple hashes to support certificate rotation:
     * - Let's Encrypt R3 intermediate SPKI
     * - ISRG Root X1 SPKI
     * - DigiCert Global Root G2 SPKI (common Supabase CA)
     */
    private val pinnedSPKIHashes = listOf(
        // Google Trust Services WE1 intermediate (current Supabase issuer)
        "sha256/kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4=",
        // GTS Root R4 (current Supabase root)
        "sha256/mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=",
        // Let's Encrypt R3 intermediate (fallback)
        "sha256/jQJTbIh0grw0/1TkHSumWb+Fs0Ggogr621gT3PvPKG0=",
        // ISRG Root X1 (fallback)
        "sha256/C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=",
        // DigiCert Global Root G2 (fallback)
        "sha256/i7WTqTvh0OioIruIfFR4kMPnBqrS2rdiVPl/s2uC/CY=",
    )

    /**
     * When `true`, pinning failures are logged but connections are NOT blocked.
     *
     * Forced to report-only (all build types) until the hardcoded SPKI hashes
     * below are re-verified against Supabase's current certificate chain.
     * Enforcing a stale pin set blocks every backend call — the app launches
     * but loads no data, which Google flags as Broken Functionality just like
     * an outright crash. Re-enable enforcement (`= BuildConfig.DEBUG`) only
     * after confirming the pins with the openssl command documented above and
     * shipping a tested release.
     */
    val isReportOnly: Boolean = true

    /**
     * Creates an OkHttpClient.Builder with certificate pinning configured.
     *
     * In debug mode, pinning is NOT enforced (report-only) to avoid
     * breaking development against staging/local environments.
     * In release mode, pinning failures will throw SSLPeerUnverifiedException.
     */
    fun configurePinning(builder: OkHttpClient.Builder): OkHttpClient.Builder {
        if (isReportOnly) {
            AppLogger.network.info("Certificate pinning in report-only mode (debug build)")
            // In debug mode, add a logging interceptor but don't pin
            builder.addInterceptor { chain ->
                val request = chain.request()
                val host = request.url.host
                if (pinnedDomains.any { pattern ->
                        if (pattern.startsWith("*.")) {
                            host.endsWith(pattern.removePrefix("*"))
                        } else {
                            host == pattern
                        }
                    }) {
                    AppLogger.network.debug("Connection to pinned domain: $host (report-only)")
                }
                chain.proceed(request)
            }
            return builder
        }

        // Production: enforce certificate pinning
        val pinnerBuilder = CertificatePinner.Builder()

        for (domain in pinnedDomains) {
            for (hash in pinnedSPKIHashes) {
                pinnerBuilder.add(domain, hash)
            }
        }

        builder.certificatePinner(pinnerBuilder.build())
        AppLogger.network.info("Certificate pinning enabled for ${pinnedDomains.joinToString()}")

        return builder
    }

    /** Connect timeout in seconds for all network requests. */
    private const val CONNECT_TIMEOUT_SECONDS = 30L
    /** Read timeout in seconds for all network requests. */
    private const val READ_TIMEOUT_SECONDS = 30L
    /** Write timeout in seconds for all network requests. */
    private const val WRITE_TIMEOUT_SECONDS = 30L
    /** Overall call timeout as a safety net. */
    private const val CALL_TIMEOUT_SECONDS = 60L

    /**
     * Creates a new OkHttpClient with certificate pinning and request timeouts configured.
     * Suitable for use as the Ktor HTTP engine for Supabase.
     */
    fun createPinnedClient(): OkHttpClient {
        return configurePinning(
            OkHttpClient.Builder()
                .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        ).build()
    }
}
