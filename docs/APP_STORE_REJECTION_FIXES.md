# App Store Rejection Fixes — March 2026

**Latest Submission ID:** bf03765e-f093-4808-babd-cca72ea019c0  
**Version:** 1.1.2 (rejected) → **1.1.3 (next submission)**  
**Review Device:** iPad Air 11-inch (M3)  
**Rejection Date:** March 14, 2026

---

## Situation Summary

The code is correct and the product IDs match App Store Connect exactly. The subscription group
**"Des Moines Insider Premium"** (Group ID: `21957951`) exists with both products at
**Ready to Submit** status:

| Level | Reference Name | Product ID | Duration | Status |
|-------|---------------|-----------|----------|--------|
| 1 | prod_Insider_Monthly | `prod_U4oa7Cpn0bRnuo` | 1 month | Ready to Submit |
| 2 | prod_VIP_Monthly | `prod_U4oaGFEy12auTx` | 1 month | Ready to Submit |

The only reason for the rejections is that these products were **never added to an app version
and submitted together with a binary**. Apple requires the first subscription submission to happen
alongside a new app version.

---

## What Needs to Happen (In Order)

### Step 1 — Fix the Subscription Group Localization

From the screenshot: the English (U.S.) localization shows status **"Prepare for Submission"**.
This must be resolved before you can submit.

1. App Store Connect → DSM Insider → **In-App Purchases** → **Manage** (Subscriptions)
2. Click **"Des Moines Insider Premium"**
3. Click the **English (U.S.)** localization row
4. Confirm the fields are filled in:
   - **Subscription Group Display Name:** `Des Moines Insider Premium`
   - **App Name:** `DSM Insider` ← change from "Des Moines Insider - Events" to match your app name
5. Save — status should change to **Ready to Submit**

### Step 2 — Complete Metadata for Each Product (if not already done)

For each subscription, click into its detail page and confirm all fields are filled:

**prod_Insider_Monthly (`prod_U4oa7Cpn0bRnuo`)**
- Display Name: `Insider`
- Description: `Unlimited favorites, ad-free experience, advanced filters, and calendar integration.`
- Price: `$4.99/month`
- **App Review Screenshot:** Required — take a screenshot of the subscription screen in Simulator
  (see Step 4 below for how to get this screenshot)

**prod_VIP_Monthly (`prod_U4oaGFEy12auTx`)**
- Display Name: `VIP`
- Description: `Everything in Insider plus AI Trip Planner, VIP-exclusive events, priority support, and early access.`
- Price: `$12.99/month`
- **App Review Screenshot:** Same screenshot as above (showing both plans) is fine

Both must show **Ready to Submit** before proceeding.

### Step 3 — Archive and Upload a New Binary (v1.1.3)

Apple explicitly requires a new binary when submitting IAPs for the first time.

1. In Xcode, set:
   - **Version:** `1.1.3`
   - **Build:** `30` (or any number higher than your last uploaded build)
   - **Team:** your Apple Developer Team (10-character ID from developer.apple.com/account)
2. **Product → Archive**
3. Organizer → **Distribute App → App Store Connect → Upload**
4. Wait for processing (5–15 min) — you'll get an email when it's ready

### Step 4 — Take the Required App Review Screenshot

The screenshot is required for each IAP product. Get it from Simulator:

1. In Xcode, run the app on **iPhone 15 Pro Max** simulator (or any 6.7" size)
2. Log in with a test account
3. Navigate to the subscription screen (tap Favorites → tap any locked item → the paywall appears)
4. Take a screenshot: **Simulator menu → File → Save Screen**
5. Upload this screenshot to both IAP products in App Store Connect

### Step 5 — Create the 1.1.3 Version in App Store Connect

1. App Store Connect → DSM Insider → **+ Version or Platform** → iOS → `1.1.3`
2. Fill in **What's New:** e.g. `Bug fixes and performance improvements.`
3. Scroll to **Build** → select the build you uploaded in Step 3
4. Fill in all required metadata (screenshots, description, etc.) — carry over from 1.1.2

### Step 6 — Add the IAP Products to the Version

**This is the step that has been missed in every previous submission.**

1. On the 1.1.3 version page, scroll to **In-App Purchases and Subscriptions**
2. Click **+**
3. Select `prod_Insider_Monthly` → **Done**
4. Click **+** again
5. Select `prod_VIP_Monthly` → **Done**
6. Both should now appear in the list for this version

### Step 7 — Add Demo Account for App Review

1. On the 1.1.3 version page, scroll to **App Review Information**
2. Under **Demo Account**:
   - Username: *(a real Supabase test account email)*
   - Password: *(password for that account)*
3. Under **Notes:**
   > To test the subscription screen: log in with the demo account above, tap the Favorites tab (⭐), then tap any item with a lock icon. The subscription paywall will appear showing both Insider ($4.99/mo) and VIP ($12.99/mo) plans. Use a Sandbox Apple ID to test a purchase.

### Step 8 — Fix App Privacy Labels (Guideline 5.1.2(i))

From the previous rejection — still needs to be done in App Store Connect:

1. App Store Connect → DSM Insider → **App Privacy**
2. For every data type (User ID, Email, Name, Location, etc.):
   - Uncheck **"Used for Tracking Purposes"**
3. The app's `PrivacyInfo.xcprivacy` already declares `NSPrivacyTracking = false` —
   this is just fixing the metadata to match

### Step 9 — Submit for Review

1. Confirm both IAP products show **Ready to Submit** on the version page
2. Confirm App Privacy labels are saved
3. Click **Submit for Review**

---

## Checklist Before Submitting

- [ ] Subscription group localization status changed from "Prepare for Submission" → "Ready to Submit"
- [ ] App Name in localization updated to `DSM Insider` (not "Des Moines Insider - Events")
- [ ] `prod_Insider_Monthly` has Display Name, Description, Price, and App Review screenshot
- [ ] `prod_VIP_Monthly` has Display Name, Description, Price, and App Review screenshot
- [ ] Both products show **Ready to Submit**
- [ ] New binary v1.1.3 (build 30+) uploaded and processed in App Store Connect
- [ ] Version 1.1.3 created in App Store Connect with build attached
- [ ] **Both IAP products added to the 1.1.3 version's In-App Purchases section** ← most critical
- [ ] Demo account added to App Review Information
- [ ] App Privacy: no data type marked as "Used for Tracking Purposes"
- [ ] Submit for Review clicked

---

## Why This Keeps Getting Rejected

Apple's rule (shown in the App Store Connect banner): *"Your first subscription must be submitted
with a new app version. Create your subscription, then select it from the app's In-App Purchases
and Subscriptions section on the version page before submitting the version to App Review."*

Every previous submission uploaded a binary without linking the subscription products to the
version. The products sat at "Ready to Submit" but were never selected as part of the version —
so to Apple's reviewer, the app appeared to reference a paywall with no approved IAP products.

---

## History

| Submission ID | Version | Date | Result |
|--------------|---------|------|--------|
| bf03765e | 1.1.2 | Mar 14, 2026 | Rejected — Guideline 2.1(b): IAP not submitted with version |
| 6a0af842 | 1.1.1 | Mar 2026 | Rejected — Privacy, ToS, IAP, subscription loading bug |
