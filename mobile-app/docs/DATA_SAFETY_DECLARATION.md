# Google Play Data Safety Declaration

This document outlines the data safety declaration required for Google Play Store submission.
Use this information when filling out the Data Safety form in Google Play Console.

## Data Collection Summary

### Data Collected

| Data Type | Collected | Shared | Required | Purpose |
|-----------|-----------|--------|----------|---------|
| Email address | Yes | No | Yes (for auth) | Account management |
| Name | Yes | No | No | Personalization |
| User IDs | Yes | No | Yes (for auth) | Account management |
| Approximate location | Yes | No | No | App functionality |
| Precise location | Yes | No | No | App functionality |
| Photos | Yes | No | No | App functionality |
| App interactions | Yes | No | No | Analytics |
| Crash logs | Yes | No | No | App diagnostics |
| Device IDs | Yes | No | No | App diagnostics |

### Data Sharing

This app does **not** share user data with third parties.

### Data Handling

- **Encryption in transit**: All data is encrypted in transit via HTTPS/TLS.
- **Data deletion**: Users can request account and data deletion via the app settings or by contacting support.
- **Data retention**: User data is retained while the account is active. Deleted account data is purged within 30 days.

### Security Practices

- Data is encrypted in transit (HTTPS/TLS)
- Users can request data deletion
- Biometric authentication available for account security
- No cross-app tracking

## App Permissions Justification

| Permission | Justification |
|------------|---------------|
| Internet | Required to load content from our servers |
| Network State | Check connectivity for offline mode |
| Fine Location | Show nearby events and restaurants |
| Coarse Location | Show approximate nearby content |
| Camera | Profile photo capture, event photo upload |
| Read Media Images | Select photos for profile/uploads |
| Post Notifications | Event reminders and updates (Android 13+) |
| Vibrate | Haptic feedback on interactions |
| Biometric | Secure login with fingerprint/face |
| Wake Lock | Process push notifications |
| Foreground Service | Ongoing location updates for nearby features |

## Play Store Listing Requirements

- [ ] Privacy policy URL added
- [ ] Data safety form completed
- [ ] Target API level 35 declared
- [ ] Content rating questionnaire completed
- [ ] App category: Travel & Local
- [ ] Contact email provided
- [ ] Screenshots for phone and tablet
- [ ] Feature graphic uploaded
- [ ] Short and full descriptions provided
