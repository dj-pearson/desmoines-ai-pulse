# ============================================================================
# Des Moines Insider - ProGuard/R8 Rules
# ============================================================================

# ---- kotlinx.serialization ----
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep all @Serializable model classes and their serializers
-keep,includedescriptorclasses class com.desmoines.aipulse.**$$serializer { *; }
-keepclassmembers class com.desmoines.aipulse.** {
    *** Companion;
}
-keepclasseswithmembers class com.desmoines.aipulse.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ---- Strip debug/info/verbose logs in release builds ----
-assumenosideeffects class android.util.Log {
    public static int d(...);
    public static int i(...);
    public static int v(...);
}

# ---- Ktor / OkHttp / Okio ----
-dontwarn io.ktor.**
-keep class io.ktor.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.internal.** { *; }

# ---- Supabase Kotlin SDK ----
-dontwarn io.github.jan.supabase.**
-keep class io.github.jan.supabase.** { *; }

# ---- Google Play Billing ----
-keep class com.android.vending.billing.** { *; }
-keep class com.android.billingclient.** { *; }
-dontwarn com.android.billingclient.**

# ---- Firebase ----
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ---- Google Maps ----
-keep class com.google.android.gms.maps.** { *; }
-keep class com.google.maps.android.** { *; }

# ---- Google Credential Manager ----
-keep class androidx.credentials.** { *; }
-dontwarn androidx.credentials.**
-keep class com.google.android.libraries.identity.googleid.** { *; }

# ---- Room ----
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }

# ---- Coil ----
-dontwarn coil3.**

# ---- AndroidX Security (EncryptedSharedPreferences) ----
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**

# ---- Kotlin Coroutines ----
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}

# ---- Hilt / Dagger ----
-dontwarn dagger.hilt.**
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }

# ---- General Android ----
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes Signature
-keepattributes Exceptions
