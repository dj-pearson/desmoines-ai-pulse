# App Store Rejection Fixes — March 2026

**Submission ID:** 6a0af842-638b-4336-8af1-2f1048c97ee6  
**Version:** 1.1.1 (28)  
**Review Device:** iPad Air 11-inch (M3), iPadOS 26.3

This document addresses the four rejection reasons and the steps to resolve them.

---

## 1. Guideline 5.1.2(i) — Privacy: App Tracking Transparency

**Issue:** App Store Connect indicates the app collects data for tracking (User ID), but the app does not use App Tracking Transparency (ATT).

**Resolution:** The app does **not** track users. The in-app Privacy Manifest (`PrivacyInfo.xcprivacy`) already declares `NSPrivacyTracking = false` and `NSPrivacyCollectedDataTypeTracking = false` for all data types.

**Action required (App Store Connect):**

1. Go to **App Store Connect** → Your App → **App Privacy**
2. For each data type (User ID, Email, Name, Location, etc.), ensure **"Used for Tracking Purposes"** is **unchecked**
3. If any data type is marked as "Data used to track you," change it to **"Data not used for tracking"** or remove the tracking purpose
4. Save and resubmit

**Do NOT** add App Tracking Transparency (ATT) unless you actually track users across apps/websites for advertising or data brokers. Since we don't track, updating the privacy labels is the correct fix.

---

## 2. Guideline 3.1.2(c) — Subscriptions: Terms of Use (EULA)

**Issue:** Missing functional link to Terms of Use (EULA) in the app and/or metadata.

**Code changes (done):**

- Added **Privacy Policy** and **Terms of Use** links to the subscription page (`SubscriptionView` legal section)
- Links point to: `https://desmoinesinsider.com/privacy-policy` and `https://desmoinesinsider.com/terms`

**Action required (App Store Connect):**

1. **App Description:** Add a sentence with the Terms of Use link, e.g.:
   > By subscribing, you agree to our [Terms of Use](https://desmoinesinsider.com/terms) and [Privacy Policy](https://desmoinesinsider.com/privacy-policy).

2. **EULA field:** If using a custom EULA, add it in App Store Connect → App Information → License Agreement (EULA). If using the standard Apple EULA, the link in the App Description is sufficient.

3. **Privacy Policy URL:** Ensure `https://desmoinesinsider.com/privacy-policy` is set in the Privacy Policy URL field (already in metadata).

---

## 3. Guideline 2.1(b) — In-App Purchase Products Not Submitted

**Issue:** The app references subscriptions but the In-App Purchase products have not been submitted for review.

**Action required (App Store Connect):**

1. **Complete IAP metadata** for each subscription:
   - `prod_Insider_Monthly` (prod_U4oa7Cpn0bRnuo)
   - `prod_VIP_Monthly` (prod_U4oaGFEy12auTx)

   For each product:
   - Display Name, Description
   - Subscription Duration (1 month)
   - Subscription Prices
   - **App Review screenshot** (required)
   - **Review notes** (optional but helpful)

2. **Add IAP to App Version:**
   - Go to your app version (e.g. 1.1.1) → **In-App Purchases and Subscriptions**
   - Click **+** and select the subscription products

3. **First submission rule:** Your first subscription must be submitted with a new app version. Create the subscription, add it to the version’s In-App Purchases section, then submit the version.

4. **Upload a new binary** after adding the IAP products to the version.

---

## 4. Guideline 2.1(a) — Bug: Subscription Plans Not Loading

**Issue:** The subscription page did not load the plans correctly on iPad Air 11-inch (M3).

**Root cause:** The plans fail to load when StoreKit returns no products. This typically happens when:
- IAP products are not yet submitted (Guideline 2.1(b))
- In-App Purchases are not added to the app version
- IAP metadata is incomplete (e.g. "Missing Metadata")

**Code changes (done):**

- Added `.task` to reload products when the subscription view appears (retry if initial load failed)
- Existing "Plans Unavailable" state with Retry button remains for users

**Resolving:** Once the IAP products are submitted and added to the app version (Guideline 2.1(b)), the plans should load correctly during review. If the issue persists, verify:
- Product IDs match: `prod_U4oa7Cpn0bRnuo`, `prod_U4oaGFEy12auTx`
- Both subscriptions have "Ready to Submit" status.
- Sandbox is enabled for the reviewer account.

---

## Checklist Before Resubmission

- [ ] App Store Connect App Privacy: No data marked as "Used for Tracking"
- [ ] App Description: Includes Terms of Use and Privacy Policy links
- [ ] IAP products: Metadata complete, App Review screenshot for each
- [ ] IAP products: Added to app version’s In-App Purchases section
- [ ] New binary uploaded after IAP changes
- [ ] Test on iPad: Subscription page loads plans in Sandbox
