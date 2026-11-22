/**
 * Account deletion (AND-OVH-012)
 *
 * A public page that says how to delete a Des Moines Insider account without
 * needing the app installed or a session open. Google Play's Data safety form
 * asks for exactly this URL, and the Privacy Policy previously pointed only at
 * /profile (signed-in) or an email address.
 *
 * The retention lines mirror the "Data Retention" section of PrivacyPolicy.tsx.
 * If that section changes, change this page with it: two pages giving different
 * retention periods is worse than one.
 *
 * "What we keep" is RETAINED_TABLES in supabase/functions/_shared/userDataTables.ts,
 * the "retain" entries of _shared/addressKeyedData.ts (email_suppressions) and
 * the store webhook logs KEPT_UNLINKED names in _tests/user-fk-on-delete.test.ts.
 * Owner decision 2026-11-22, "delete should delete": anything else tied to the
 * person is deleted, so nothing may be listed here that is not in those lists,
 * and nothing kept may be missing from here. WEB-LEGAL-015.
 */
import { Link } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

const PRIVACY_EMAIL = "privacy@desmoinesinsider.com";

export default function AccountDeletion() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Delete Your Account | Des Moines Insider"
        description="How to delete your Des Moines Insider account from the iOS or Android app, the website or by email, and what we delete and keep."
        url="https://desmoinesinsider.com/account/delete"
        type="website"
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Delete Your Account" },
          ]}
        />

        <article className="prose prose-lg dark:prose-invert max-w-none">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Delete Your Des Moines Insider Account</h1>
          <p>
            You can delete your account yourself from the app or the website, or ask us to do it by email. Deleting
            your account is permanent and cannot be undone.
          </p>

          <section className="mb-8" aria-labelledby="delete-in-app">
            <h2 id="delete-in-app" className="text-2xl font-semibold mt-8 mb-4">In the iOS or Android app</h2>
            <ol className="list-decimal pl-6 space-y-2">
              <li>Open Des Moines Insider and sign in.</li>
              <li>Go to <strong>Profile</strong>, then <strong>Settings</strong>.</li>
              <li>Tap <strong>Delete Account</strong> and confirm.</li>
            </ol>
          </section>

          <section className="mb-8" aria-labelledby="delete-on-web">
            <h2 id="delete-on-web" className="text-2xl font-semibold mt-8 mb-4">On the website</h2>
            <ol className="list-decimal pl-6 space-y-2">
              <li>
                <Link to="/auth" className="text-primary underline">Sign in</Link> to desmoinesinsider.com.
              </li>
              <li>
                Open your{" "}
                <Link to="/profile?tab=settings" className="text-primary underline">account settings</Link>.
              </li>
              <li>Under <strong>Delete my account</strong>, choose <strong>Delete my account</strong> and confirm.</li>
            </ol>
          </section>

          <section className="mb-8" aria-labelledby="delete-by-email">
            <h2 id="delete-by-email" className="text-2xl font-semibold mt-8 mb-4">By email</h2>
            <p>
              If you can't sign in, email{" "}
              <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary underline">{PRIVACY_EMAIL}</a>{" "}
              from the address on your account and ask us to delete it. We'll confirm the request with you before
              deleting anything, and respond within the timeframes required by applicable law (generally 30-45 days).
            </p>
          </section>

          <section className="mb-8" aria-labelledby="store-subscriptions">
            <h2 id="store-subscriptions" className="text-2xl font-semibold mt-8 mb-4">
              Cancel an App Store or Google Play subscription separately
            </h2>
            <p>
              Deleting your account does not cancel a subscription you bought through the App Store or Google Play.
              Only Apple or Google can stop those charges, so cancel it in the App Store or Google Play before or after
              you delete your account:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>iPhone or iPad:</strong>{" "}
                <a
                  href="https://apps.apple.com/account/subscriptions"
                  className="text-primary underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  App Store subscriptions
                </a>
              </li>
              <li>
                <strong>Android:</strong>{" "}
                <a
                  href="https://play.google.com/store/account/subscriptions"
                  className="text-primary underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Google Play subscriptions
                </a>
              </li>
            </ul>
            <p>A subscription bought on the website is cancelled when the account is deleted.</p>
          </section>

          <section className="mb-8" aria-labelledby="what-is-deleted">
            <h2 id="what-is-deleted" className="text-2xl font-semibold mt-8 mb-4">What we delete</h2>
            <p>
              Your account, your profile and the personal data tied to them are deleted, not kept with your name taken
              off. That covers:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>saved favorites, reviews, ratings, comments, photos and events you submitted</li>
              <li>your preferences, saved searches, calendars, reminders and location history</li>
              <li>
                messages you sent through our contact form, and our replies: those sent while signed in, and those
                sent while signed out from your account's email address, however it was capitalized;
                your support tickets
              </li>
              <li>deals you claimed, and the emails we sent you</li>
              <li>sign-in attempts made against your account</li>
              <li>
                your subscription and payment history. Stripe, Apple and Google keep their own billing records under
                their own policies
              </li>
              <li>
                any business listing or partnership application you own, and the Google sign-in you used to connect
                Search Console or analytics
              </li>
              <li>if you write for us, your author byline (the articles stay, without your name)</li>
            </ul>
            <p>
              A contact-form message sent while signed out from a different email address can't be matched to your
              account. Email us at the privacy address above, from the address you wrote from, and we'll delete it.
            </p>
          </section>

          <section className="mb-8" aria-labelledby="what-is-kept">
            <h2 id="what-is-kept" className="text-2xl font-semibold mt-8 mb-4">What we keep, and why</h2>
            <p>
              These records stay after deletion. Nothing else does. The same list is in our{" "}
              <Link to="/privacy-policy" className="text-primary underline">Privacy Policy</Link>.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Consent records:</strong> what you agreed to and when, as proof required by law. They hold a
                hash of your email address rather than the address, and the IP address and browser at the time. The
                link to your account is removed.
              </li>
              <li>
                <strong>Security logs:</strong> your account ID, IP address and browser for security events, including
                the record of this deletion, so abuse can be investigated.
              </li>
              <li>
                <strong>Ad-impression records:</strong> which ad was shown, when, on which page and on what kind of
                device, because advertisers are billed on the count. Your account ID, IP address, browser and the page
                you came from are removed from them, and the session ID is replaced, so they no longer identify you.
              </li>
              <li>
                <strong>Search Console and analytics history:</strong> if you connected Google Search Console or
                analytics for the site as an admin, the site's search and traffic history stays, because it belongs to
                the site. The link to your account is removed; it holds no name or email address.
              </li>
              <li>
                <strong>Email suppression:</strong> if an email to you bounced, or you unsubscribed or reported one as
                spam, we keep that record with your address so we never email it again.
              </li>
              <li>
                <strong>App Store and Google Play notices:</strong> Apple's and Google's notifications about a store
                subscription (type, status and their purchase reference), no longer linked to your account.
              </li>
              <li>
                <strong>Advertiser and Business Pro billing:</strong> if you ran an ad campaign or paid for Business
                Pro, the campaign and billing records are kept for 7 years for legal and tax purposes.
              </li>
            </ul>
          </section>
        </article>
      </div>
    </div>
  );
}
