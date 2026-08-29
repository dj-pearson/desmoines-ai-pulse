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
        // AND-AUDIT-014. Audited 2026-08-29 by turning this off and running the
        // suite: 12 failures across 6 classes, and exactly one cause -
        // "Method w in android.util.Log not mocked" and the same for e. Nothing
        // else in 346 tests depends on a defaulted framework return.
        //
        // Kept, because the alternative is worse than it looks: stubbing Log
        // globally needs a JUnit 5 extension registered through
        // META-INF/services, and AGP is not putting src/test/resources on the
        // unit-test runtime classpath - the compiled extension class arrives,
        // the services file and junit-platform.properties do not. Applied
        // per-class with @ExtendWith it works. See the AND-AUDIT-014 notes.
        //
        // The real risk this flag carries is that a test can assert on a
        // silently-defaulted value, so verifyUnitTestExecution below covers the
        // failure mode that actually bit: a suite that runs nothing and passes.
        unitTests.isReturnDefaultValues = true

        // AND-AUDIT-014 AC3. ArticleMarkdownTest has existed since the
        // ClickableText -> LinkAnnotation migration and has never run anywhere:
        // no workflow invokes connectedCheck, and nothing in this file described
        // a device to run it on. Six tests covering composition, semantics and
        // link hit-testing - the three things a JVM unit test cannot reach.
        //
        // aosp-atd is the Automated Test Device image: no Play services, no
        // system UI, boots headless in a fraction of the time a full image
        // takes, and is the image Google ships for exactly this. API 34 rather
        // than compileSdk 37 because an ATD image is published for 34 and the
        // test exercises Compose, not platform APIs.
        //
        // Run it with:  ./gradlew :app:pixel6api34DebugAndroidTest
        managedDevices {
            localDevices {
                create("pixel6api34") {
                    device = "Pixel 6"
                    apiLevel = 34
                    systemImageSource = "aosp-atd"
                }
            }
        }
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

    // DeepLinkManifestParityTest reads AndroidManifest.xml and DeepLinkHandler.kt
    // as TEXT rather than exercising compiled code, and neither is on the unit
    // test runtime classpath - so Gradle sees no reason to re-run the suite when
    // one of them changes. Measured: deleting a host from the manifest left the
    // task UP-TO-DATE and the build green; the same edit under --rerun-tasks
    // fails the test correctly.
    //
    // CI never noticed because it checks out fresh every run. Locally it means
    // the guard goes green immediately after you break the thing it guards,
    // which is worse than not having it. Declaring the files as inputs is the
    // whole fix.
    inputs.files(
        layout.projectDirectory.file("src/main/AndroidManifest.xml"),
        layout.projectDirectory.file("src/main/java/com/desmoines/aipulse/util/DeepLinkHandler.kt"),
        layout.projectDirectory.file("src/main/java/com/desmoines/aipulse/util/ShortcutDispatcher.kt"),
        layout.projectDirectory.file("src/main/res/xml/shortcuts.xml"),
        layout.projectDirectory.file("src/androidTest/java/com/desmoines/aipulse/util/ShortcutDispatcherUriTest.kt"),
    )
        .withPropertyName("sourceParityInputs")
        .withPathSensitivity(PathSensitivity.RELATIVE)
}

// AND-AUDIT-014: make a suite that ran nothing fail.
//
// EventsRemoteDataSourceTest's seven tests were discovered as ZERO for an
// unknown length of time and every build stayed green, because a Gradle test
// task that executes no tests succeeds. BUILD SUCCESSFUL is not a test result,
// and until this task existed nothing in either workflow could tell the
// difference between 346 passing tests and none.
//
// A floor rather than an exact count: adding tests must not need a build edit,
// and deleting a class deliberately is a one-line ratchet. Set just below the
// current total so the exact regression above - losing one class of seven -
// fails here.
val unitTestFloor = 340

val verifyUnitTestExecution = tasks.register("verifyUnitTestExecution") {
    description = "Fails if the unit test suite reported implausibly few tests, or skipped any."
    group = "verification"
    val resultsDir = layout.buildDirectory.dir("test-results/testDebugUnitTest")
    val floor = unitTestFloor
    doLast {
        val dir = resultsDir.get().asFile
        val reports = dir.listFiles { f: java.io.File ->
            f.name.startsWith("TEST-") && f.name.endsWith(".xml")
        }?.toList().orEmpty()

        check(reports.isNotEmpty()) {
            "No JUnit XML under $dir. The test task reported success without producing " +
                "a single report, which is the exact shape of a suite that ran nothing."
        }

        val counts = Regex("""tests="(\d+)" skipped="(\d+)" failures="(\d+)" errors="(\d+)"""")
        var tests = 0; var skipped = 0; var failures = 0; var errors = 0
        reports.forEach { report ->
            counts.find(report.readText())?.let {
                tests += it.groupValues[1].toInt()
                skipped += it.groupValues[2].toInt()
                failures += it.groupValues[3].toInt()
                errors += it.groupValues[4].toInt()
            }
        }

        check(tests >= floor) {
            "Only $tests unit tests executed; expected at least $floor. Either tests were " +
                "lost to a discovery failure, or the floor in app/build.gradle.kts needs " +
                "lowering deliberately."
        }
        check(skipped == 0) {
            "$skipped unit test(s) were skipped. A skipped test is not a passing test."
        }

        logger.lifecycle(
            "verifyUnitTestExecution: $tests tests, $skipped skipped, $failures failures, " +
                "$errors errors (floor $floor)",
        )
    }
}

// finalizedBy, not dependsOn: this must also report when the suite itself fails,
// and it must be impossible to run the tests without it.
tasks.matching { it.name == "testDebugUnitTest" }.configureEach {
    finalizedBy(verifyUnitTestExecution)
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
