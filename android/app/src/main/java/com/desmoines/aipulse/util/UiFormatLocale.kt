package com.desmoines.aipulse.util

import java.util.Locale

/**
 * The locale the UI formats dates and times in (AND-AUDIT-019 AC5).
 *
 * WHY THIS EXISTS RATHER THAN Locale.US SCATTERED AROUND. DateTimeFormatter
 * patterns split into two kinds and they want opposite treatment, which is why
 * "pick one rule" is really a rule with a boundary:
 *
 *   NUMERIC ONLY  "yyyy-MM-dd", "HH:mm", "HH:mm:ss", "d"
 *       Locale makes no difference. Verified rather than assumed: ofPattern
 *       uses DecimalStyle.STANDARD, not the locale's digits, so these format
 *       and parse identically under en-US, ar-EG, th-TH-u-nu-thai and bn-IN.
 *       Adding a Locale to these is noise, and the wire-format parsers in
 *       Event.kt are deliberately left bare.
 *
 *   TEXT BEARING  anything with MMM, MMMM, EEE, EEEE or a
 *       Locale changes the output completely. On a French device
 *       "EEEE, MMMM d" renders "samedi, aout 29"; on Japanese and Arabic it is
 *       not Latin script at all. The app ships English-only, so those strings
 *       land inside an otherwise entirely English screen. Six call sites
 *       already passed Locale.US and about eleven did not, so the app showed a
 *       mix of both on any non-English device.
 *
 * Locale.US, not Locale.getDefault(), is correct WHILE the app is English-only:
 * a localized month name in an English sentence is worse than an English one.
 * When AND-AUDIT-019 AC1 is answered yes, this is the single line that changes,
 * and every display formatter follows.
 */
val UiFormatLocale: Locale = Locale.US
