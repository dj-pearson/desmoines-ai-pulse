# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class com.desmoines.aipulse.**$$serializer { *; }
-keepclassmembers class com.desmoines.aipulse.** {
    *** Companion;
}
-keepclasseswithmembers class com.desmoines.aipulse.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Ktor / OkHttp
-dontwarn io.ktor.**
-keep class io.ktor.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
