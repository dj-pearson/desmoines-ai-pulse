# Lane: android

**Mission.** The Android app matches the web on core journeys and is ready for Play production.

**Owns.** android/app/**

**Backlog.** Open stories in `prd.json` with prefix AND-AUDIT, XPLAT (Android half). See `../README.md` for the loop.

## Handoff

XPLAT-007 (Android half shipped, story stays open). Done: Settings > Account Data > "Export My Data" calls
export-user-data, saves the JSON through the system file picker, and says plainly when the function is not
deployed (404 today) or when the server could not read some tables. Next, none of it Android work:
deploy export-user-data (it is in edge-deploy-baseline.json; verify_jwt stays true), then the iOS entry point
(ios lane) and moving web's PrivacyControls.tsx off its 8-table list. Then a device check of the Android flow
against the deployed function. Files: ui/screens/profile/DataExportResponse.kt, ProfileViewModel.kt
(exportData), SettingsScreen.kt, navigation/FlowDestinations.kt. Trap: the picker is opened from a
LaunchedEffect, so PendingDataExport.pickerShown exists to stop a rotation from opening a second picker.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | XPLAT-007 | this commit | Android data export wired to export-user-data; 8 classification tests pass on a JVM harness (Kotlin 2.2.10); app module not compiled (no Android SDK) |
