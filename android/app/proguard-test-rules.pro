# R8 rules for the ANDROID TEST APK only (AND-AUDIT-018 AC6).
#
# When testBuildType is a minified variant, AGP runs R8 over the test APK as
# well as the app. That is not what we want: the point is to exercise the
# SHRUNK APP, and shrinking the test APK on top of it only adds a second way for
# the run to fail. It failed immediately -
#
#   Missing class com.google.auto.value.AutoValue
#     (referenced from dagger.hilt.android.testing.OnComponentReadyRunner)
#
# - on a compile-only annotation that is absent at runtime by design.
#
# So the test APK is left alone. The app APK is still fully minified, obfuscated
# and resource-shrunk by proguard-rules.pro; nothing here relaxes that.
-dontshrink
-dontoptimize
-dontobfuscate

# Compile-only annotations that hilt-android-testing and its dependencies
# reference but never load.
-dontwarn com.google.auto.value.**
-dontwarn javax.annotation.**
-dontwarn org.checkerframework.**
