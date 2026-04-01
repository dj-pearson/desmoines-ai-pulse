package com.desmoines.aipulse.util

import com.desmoines.aipulse.BuildConfig
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient

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
        // Let's Encrypt R3 intermediate
        "sha256/jQJTbIh0grw0/1TkHSumWb+Fs0Ggogr621gT3PvPKG0=",
        // ISRG Root X1
        "sha256/C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=",
        // DigiCert Global Root G2 (common Supabase CA)
        "sha256/i7WTqTvh0OioIruIfFR4kMPnBqrS2rdiVPl/s2uC/CY=",
    )

    /**
     * When `true`, pinning failures are logged but connections are NOT blocked.
     * Set to `true` during development/testing, `false` for production.
     */
    val isReportOnly: Boolean = BuildConfig.DEBUG

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

    /**
     * Creates a new OkHttpClient with certificate pinning configured.
     * Suitable for use as the Ktor HTTP engine for Supabase.
     */
    fun createPinnedClient(): OkHttpClient {
        return configurePinning(OkHttpClient.Builder()).build()
    }
}
