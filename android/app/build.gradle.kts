import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.ksp)
    alias(libs.plugins.google.services)
}

// Load local.properties for Supabase credentials (gitignored)
val localProperties = Properties().apply {
    val localPropsFile = rootProject.file("local.properties")
    if (localPropsFile.exists()) {
        localPropsFile.inputStream().use { load(it) }
    }
}

// Fail fast if a RELEASE artifact is built without what it needs. Two
// different requirements with two different scopes, so they are two checks.
val requestedReleaseTasks = gradle.startParameter.taskNames.joinToString(" ").lowercase()

// Tasks that compile release code. Anything here without working credentials
// produces an app that installs and then does nothing: a blank
// GOOGLE_MAPS_API_KEY crashes the Map tab, blank Supabase keys leave every
// screen empty. Both got an AAB rejected by Google Play for Broken
// Functionality — never let that artifact build again.
val buildsReleaseCode = listOf("bundlerelease", "assemblerelease", "publish")
    .any { requestedReleaseTasks.contains(it) }

// Tasks that produce something you could actually ship. assembleRelease is
// deliberately NOT in this list: android-ci.yml runs it on every PR with no
// keystore at all, because its job is to exercise R8 and catch a ProGuard rule
// that strips something the app needs. That APK is never published.
val buildsShippableArtifact = listOf("bundlerelease", "publish")
    .any { requestedReleaseTasks.contains(it) }

fun failForMissing(what: String, keys: List<String>) {
    val missing = keys.filter { localProperties.getProperty(it, "").isBlank() }
    if (missing.isNotEmpty()) {
        throw GradleException(
            "Release build aborted: $what. Missing from local.properties: " +
                "${missing.joinToString()}. Populate them before building a release " +
                "artifact (they are absent from the gitignored working copy)."
        )
    }
}

if (buildsReleaseCode) {
    failForMissing(
        "the app cannot function without its backend credentials",
        listOf("SUPABASE_URL", "SUPABASE_ANON_KEY", "GOOGLE_MAPS_API_KEY"),
    )
}

if (buildsShippableArtifact) {
    // Without these the release signingConfig below is skipped and the build
    // still reports success, handing you an artifact with no release signature
    // that looks exactly like a good one until Play rejects the upload. All
    // four are needed: a keystore path with a blank password fails later, in a
    // message that does not name the cause.
    failForMissing(
        "a shippable release artifact cannot be signed",
        listOf(
            "RELEASE_KEYSTORE_FILE",
            "RELEASE_KEYSTORE_PASSWORD",
            "RELEASE_KEY_ALIAS",
            "RELEASE_KEY_PASSWORD",
        ),
    )
    val keystore = file(localProperties.getProperty("RELEASE_KEYSTORE_FILE", ""))
    if (!keystore.exists()) {
        throw GradleException(
            "Release build aborted: RELEASE_KEYSTORE_FILE points at " +
                "${keystore.absolutePath}, which does not exist. Fix the path in " +
                "local.properties, or restore the keystore from wherever it is kept."
        )
    }
}

android {
    namespace = "com.desmoines.aipulse"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.desmoines.aipulse"
        minSdk = 26
        targetSdk = 36
        versionCode = 6
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Supabase credentials from local.properties (never hardcoded)
        buildConfigField("String", "SUPABASE_URL", "\"${localProperties.getProperty("SUPABASE_URL", "")}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${localProperties.getProperty("SUPABASE_ANON_KEY", "")}\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${localProperties.getProperty("GOOGLE_WEB_CLIENT_ID", "")}\"")
        buildConfigField("String", "GOOGLE_MAPS_API_KEY", "\"${localProperties.getProperty("GOOGLE_MAPS_API_KEY", "")}\"")

        // Google Maps API key as manifest placeholder
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = localProperties.getProperty("GOOGLE_MAPS_API_KEY", "")

        ndk {
            debugSymbolLevel = "SYMBOL_TABLE"
        }
    }

    signingConfigs {
        create("release") {
            val keystorePath = localProperties.getProperty("RELEASE_KEYSTORE_FILE", "")
            if (keystorePath.isNotBlank()) {
                storeFile = file(keystorePath)
                storePassword = localProperties.getProperty("RELEASE_KEYSTORE_PASSWORD", "")
                keyAlias = localProperties.getProperty("RELEASE_KEY_ALIAS", "")
                keyPassword = localProperties.getProperty("RELEASE_KEY_PASSWORD", "")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            val releaseKeystore = localProperties.getProperty("RELEASE_KEYSTORE_FILE", "")
            if (releaseKeystore.isNotBlank()) {
                signingConfig = signingConfigs.getByName("release")
            } else if (buildsReleaseCode) {
                // Reachable only from assembleRelease, which the guard above
                // lets through on purpose. Say so, because a release build that
                // prints BUILD SUCCESSFUL and leaves you an artifact carrying no
                // release signature is the kind of thing you discover at upload.
                project.logger.warn(
                    "No RELEASE_KEYSTORE_FILE in local.properties, so no release " +
                        "signing config is applied. This build is fine for checking " +
                        "R8 output; the artifact it produces is NOT shippable."
                )
            }
        }
    }

    bundle {
        language { enableSplit = true }
        density { enableSplit = true }
        abi { enableSplit = true }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        jvmToolchain(17)
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    @Suppress("UnstableApiUsage")
    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    lint {
        // AND-AUDIT-013. Both of these were false, so `./gradlew lint` in
        // android-ci.yml always passed and every finding landed in an HTML
        // report nobody opened. Fifteen locale bugs, a missing
        // POST_NOTIFICATIONS declaration and unguarded startActivity calls
        // all shipped while lint knew about them.
        //
        // The release variant is the one that ships, so it is the one that
        // most needs checking.
        checkReleaseBuilds = true
        abortOnError = true

        // The 202 findings that existed when the gate went up. This exists
        // so NEW findings fail the build; it is not a verdict that any of
        // them is acceptable. See the AND-AUDIT-013 notes in prd.json for
        // the per-category triage, and burn it down rather than growing it.
        baseline = file("lint-baseline.xml")
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
}

dependencies {
    // Core Android
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)

    // Compose
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material3.window.size)
    implementation(libs.compose.material.icons.extended)
    implementation(libs.compose.navigation)

    // Hilt DI
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    // Kotlin extensions
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.datetime)

    // Supabase
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.auth)
    implementation(libs.supabase.realtime)
    implementation(libs.supabase.storage)
    implementation(libs.supabase.functions)

    // Ktor (HTTP engine for Supabase)
    implementation(libs.ktor.client.okhttp)

    // Google Sign-In (Credential Manager)
    implementation(libs.credentials)
    implementation(libs.credentials.play.services.auth)
    implementation(libs.googleid)

    // Room (offline cache)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    // DataStore (preferences persistence)
    implementation(libs.datastore.preferences)

    // Coil (Image loading)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    // Google Maps
    implementation(libs.maps.compose)
    implementation(libs.play.services.location)
    implementation(libs.play.services.maps)

    // Google Play Billing
    implementation(libs.play.billing)

    // Security (Encrypted SharedPreferences)
    implementation(libs.security.crypto)

    // Biometric authentication (Face/Fingerprint)
    implementation(libs.biometric)

    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.firebase.analytics)

    // Testing - JUnit 5
    testImplementation(libs.junit5.api)
    testRuntimeOnly(libs.junit5.engine)
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation(libs.junit5.params)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.kotlinx.coroutines.test)
    // No JUnit 4 on the unit-test classpath on purpose. `useJUnitPlatform()` is
    // set below and there is no vintage engine, so a JUnit 4 @Test would be
    // discovered by nothing and silently skipped while the build stayed green.
    // That is exactly what happened to EventsRemoteDataSourceTest's seven tests.

    // Android instrumentation tests
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.hilt.android.testing)
    kspAndroidTest(libs.hilt.compiler)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)
}
