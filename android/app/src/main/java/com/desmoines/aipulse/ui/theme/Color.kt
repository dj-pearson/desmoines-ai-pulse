package com.desmoines.aipulse.ui.theme

import androidx.compose.ui.graphics.Color

// Brand Colors
val BrandBlue = Color(0xFF2563EB)
val BrandOrange = Color(0xFFF97316)

// Status Colors
val StatusSuccess = Color(0xFF4CAF50)
val StatusError = Color(0xFFF44336)
val StatusWarning = Color(0xFFF97316)

// Category Colors — matching iOS Color+Theme.swift and AppEnums.kt
val CategoryMusic = Color(0xFF9C27B0)          // purple
val CategoryFood = Color(0xFFFF9800)           // orange
val CategoryArt = Color(0xFFE91E63)            // pink
val CategoryOutdoor = Color(0xFF4CAF50)        // green
val CategoryFamily = Color(0xFF00BCD4)         // cyan (iOS: .cyan)
val CategorySports = Color(0xFFF44336)         // red (PRD spec)
val CategoryNightlife = Color(0xFF3F51B5)      // indigo
val CategoryBusiness = Color(0xFF9E9E9E)       // gray
val CategoryEducation = Color(0xFF009688)      // teal
val CategoryCharity = Color(0xFFE91E63)        // rose
val CategoryHoliday = Color(0xFFFFB300)        // amber
val CategoryGeneral = Color(0xFF2196F3)        // blue

// Semantic Colors
val CardShadow = Color(0x14000000) // black 8% opacity

// Light Theme
//
// Primary is the iOS accent, not BrandBlue. iOS tints every control with
// AccentColor, ios/DesMoinesInsider/Resources/Assets.xcassets/AccentColor.colorset:
// #FF6B35 light (1.000, 0.420, 0.208) and #FF7A44 dark (1.000, 0.478, 0.267).
// White on #FF6B35 is 2.83:1 and fails WCAG AA for labels, so onPrimary is a
// dark brown, #2B0E00: 6.36:1 on #FF6B35 and 6.97:1 on #FF7A44.
// BrandColorTest recomputes both ratios.
val PrimaryLight = Color(0xFFFF6B35)
val OnPrimaryLight = Color(0xFF2B0E00)
val PrimaryContainerLight = Color(0xFFFFDBCC)
val OnPrimaryContainerLight = Color(0xFF351000)
// Blue moved from primary to secondary. White on #2563EB is 5.17:1.
val SecondaryLight = BrandBlue
val OnSecondaryLight = Color.White
val SecondaryContainerLight = Color(0xFFD6E3FF)
val OnSecondaryContainerLight = Color(0xFF001B3E)
// Tertiary takes the neutral slate that used to be secondary.
val TertiaryLight = Color(0xFF565F71)
val OnTertiaryLight = Color.White
val TertiaryContainerLight = Color(0xFFDAE2F9)
val OnTertiaryContainerLight = Color(0xFF131C2B)
val BackgroundLight = Color(0xFFFAFAFA)
val OnBackgroundLight = Color(0xFF1A1C20)
val SurfaceLight = Color.White
val OnSurfaceLight = Color(0xFF1A1C20)
val SurfaceVariantLight = Color(0xFFF5F5F5)
val OnSurfaceVariantLight = Color(0xFF44474E)
val OutlineLight = Color(0xFF74777F)
val ErrorLight = Color(0xFFBA1A1A)
val OnErrorLight = Color.White

// Dark Theme (OLED copies these; see OledColorScheme in Theme.kt)
val PrimaryDark = Color(0xFFFF7A44)
val OnPrimaryDark = Color(0xFF2B0E00)
val PrimaryContainerDark = Color(0xFF7A2E0E)
val OnPrimaryContainerDark = Color(0xFFFFDBCC)
val SecondaryDark = Color(0xFFAAC7FF)
val OnSecondaryDark = Color(0xFF002F65)
val SecondaryContainerDark = Color(0xFF17458E)
val OnSecondaryContainerDark = Color(0xFFD6E3FF)
val TertiaryDark = Color(0xFFBEC6DC)
val OnTertiaryDark = Color(0xFF283141)
val TertiaryContainerDark = Color(0xFF3E4759)
val OnTertiaryContainerDark = Color(0xFFDAE2F9)
val BackgroundDark = Color(0xFF121316)
val OnBackgroundDark = Color(0xFFE2E2E6)
val SurfaceDark = Color(0xFF1A1C20)
val OnSurfaceDark = Color(0xFFE2E2E6)
val SurfaceVariantDark = Color(0xFF2A2D32)
val OnSurfaceVariantDark = Color(0xFFC4C6CF)
val OutlineDark = Color(0xFF8E9099)
val ErrorDark = Color(0xFFFFB4AB)
val OnErrorDark = Color(0xFF690005)
