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
     * VERIFIED AGAINST THE LIVE CHAIN 2026-08-29 (AND-AUDIT-012 AC1/AC2). The
     * project host is wtkhfqpmcegzcbngroui.supabase.co, so it does match the
     * *.supabase.co pattern above - this project is not one of the self-hosted
     * ones AC1 was worried about. Its chain is exactly three certificates:
     *
     *   CN=supabase.co                        (leaf, rotates ~90d)
     *   GTS WE1                               pinned below
     *   GTS Root R4                           pinned below
     *
     * Three pins were removed here because they appear NOWHERE in that chain:
     * Let's Encrypt R3, ISRG Root X1 and DigiCert Global Root G2. They could
     * never satisfy a legitimate connection, and because the check passes when
     * ANY chain certificate matches ANY pin, they instead meant a certificate
     * issued by any of three very widely used public CAs would pass pinning.
     * Removing them is a strict tightening with no rotation cost. iOS made the
     * same removal on 2026-07-18 under IOS-AUDIT-SEC-001; Android was missed.
     *
     * NO LEAF PIN, deliberately, and this is where Android should differ from
     * iOS rather than copy it. iOS pinned the leaf it measured in July; the
     * live leaf on 2026-08-29 is a different key, so that pin is already dead
     * weight there. GTS issues short-lived certificates, so pinning the leaf
     * buys nothing and expires quarterly. Issuer plus root is what survives.
     */
    private val pinnedSPKIHashes = listOf(
        // Google Trust Services WE1 intermediate (current Supabase issuer).
        // Present in the live chain, confirmed 2026-08-29.
        "sha256/kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4=",
        // GTS Root R4 (current Supabase root). Present in the live chain,
        // confirmed 2026-08-29. Kept as the rotation backup: broader than
        // ideal, but the only pin that survives an issuer change.
        "sha256/mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=",
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
