/**
 * Privacy Policy
 *
 * ⚠️ LEGAL REVIEW REQUIRED — This policy was expanded during the 2026 compliance
 * audit to close specific GDPR / CPRA / US-state gaps (legal bases, EU/UK
 * representative, right to object & restriction, right to correct, right to
 * limit sensitive PI, and a functional Do-Not-Sell-or-Share mechanism). The
 * wording is a good-faith draft, NOT legal advice — have counsel review before
 * relying on it, and fill in the bracketed placeholders (EU/UK representative,
 * registered postal address) with real values.
 *
 * The "Mobile Apps" section and the Google/Apple sub-processor entries were
 * drafted in AND-OVH-013 from what the Android and iOS code does
 * (AndroidManifest.xml, ConsentService, AnalyticsService, CrashUploader,
 * PushNotificationService, BillingService, discover-chat). Google Play compares
 * the Data safety form against this page, so the two must change together.
 * This wording also needs human legal sign-off before merge.
 */
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { BackToTop } from "@/components/BackToTop";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { reopenConsentBanner } from "@/components/CookieConsentBanner";

export default function PrivacyPolicy() {
  const lastUpdated = "October 23, 2026";

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Privacy Policy | Des Moines Insider"
        description="How Des Moines Insider collects, uses and protects your personal information, and your rights under GDPR, CCPA/CPRA and US state privacy laws."
        url="https://desmoinesinsider.com/privacy-policy"
        type="website"
      />

      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Privacy Policy" },
          ]}
        />

        <article className="prose prose-lg dark:prose-invert max-w-none">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last Updated: {lastUpdated}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Introduction</h2>
            <p>
              Welcome to Des Moines Insider ("we," "our," or "us"). We are committed to protecting your privacy and ensuring
              you have a positive experience on our website at desmoinesinsider.com (the "Site") and in our iOS and Android
              apps (the "Apps"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information
              when you visit our Site, use our Apps, or use our services. What the Apps collect beyond the Site is described
              under <strong>Mobile Apps</strong> below.
            </p>
            <p>
              Des Moines Insider is an AI-powered city guide platform that helps you discover events, restaurants, attractions,
              and local experiences in the Des Moines, Iowa metropolitan area. By using our Site, you agree to the collection
              and use of information in accordance with this policy.
            </p>
            <p>
              This policy should be read together with our{" "}
              <Link to="/cookie-policy" className="text-primary underline">Cookie Policy</Link>{" "}
              (which describes the specific cookies and similar technologies we use and how to control them) and, for business
              customers, our{" "}
              <Link to="/dpa" className="text-primary underline">Data Processing Agreement</Link>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Who We Are (Data Controller)</h2>
            <p>
              For the purposes of the EU and UK General Data Protection Regulation ("GDPR"), Des Moines Insider is the
              <strong> data controller</strong> of the personal information described in this policy. You can reach our
              privacy team at <a href="mailto:privacy@desmoinesinsider.com" className="text-primary underline">privacy@desmoinesinsider.com</a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Information We Collect</h2>

            <h3 className="text-xl font-medium mt-6 mb-3">Personal Information You Provide</h3>
            <p>We may collect personal information that you voluntarily provide when you:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Create an Account:</strong> Email address, password, and optional profile information (name, avatar)</li>
              <li><strong>Subscribe to Our Newsletter:</strong> Email address</li>
              <li><strong>Submit Business Listings:</strong> Business name, contact information, location details</li>
              <li><strong>Use Our Advertising Platform:</strong> Business information, payment details (processed securely via Stripe)</li>
              <li><strong>Contact Us:</strong> Name, email address, and message content</li>
              <li><strong>Submit Events or Reviews:</strong> Event details, ratings, review content</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">Information Collected Automatically</h3>
            <p>When you access our Site, we automatically collect certain information, including:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Device Information:</strong> Device type (mobile, tablet, desktop), browser type, operating system</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, search queries, time spent on pages</li>
              <li><strong>Log Data:</strong> IP address (hashed for privacy), access times, referring URLs</li>
              <li><strong>Location Data:</strong> On the Site, an approximate location derived from your IP address. The Apps can also use your device's precise or approximate location, but only with your permission (see <strong>Mobile Apps</strong> below)</li>
              <li><strong>Cookies and Similar Technologies:</strong> Session cookies, preference cookies, and analytics cookies</li>
            </ul>
            <p>
              Usage and analytics data described above are collected only where you have granted the relevant cookie consent.
              See <strong>Your Privacy Choices</strong> below and our{" "}
              <Link to="/cookie-policy" className="text-primary underline">Cookie Policy</Link>.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Sensitive Personal Information</h3>
            <p>
              We do not collect government identifiers, race, religion, health, or biometric data. Precise geolocation, which the
              California Privacy Rights Act (CPRA) treats as "sensitive personal information," is collected only by the Apps, only
              with your permission, and only to answer the request you made (see <strong>Mobile Apps</strong> below). We do not use
              it, or any other sensitive personal information, to infer characteristics about you. Account credentials are used
              solely to authenticate you and secure your account.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Information from Third-Party Services</h3>
            <p>If you choose to link your account with third-party services, we may receive:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Basic profile information from social login providers (Google, Apple)</li>
              <li>Calendar availability if you use our calendar integration features</li>
            </ul>
          </section>

          <section className="mb-8" id="mobile-apps">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Mobile Apps</h2>
            <p>
              The Des Moines Insider apps for iOS and Android use the same account and backend as the Site, and everything above
              applies to them. They also handle the following information, which the Site does not.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Location</h3>
            <p>
              The Apps can use your device's precise (GPS) or approximate location. They do so only when you have granted the
              location permission in your device settings <em>and</em> location consent is turned on in the App's settings;
              you can turn either one off at any time. Location is used to show where you are on the map and to answer
              "near me" questions, such as nearby events or restaurants. When you ask the in-app assistant a question, your
              coordinates are sent to our backend with the question, rounded to about 100 meters, and passed to our AI provider
              to produce the answer. We do not use your location for advertising, and the Apps do not request background
              location access.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Analytics (Firebase Analytics)</h3>
            <p>
              The Android app uses Google Firebase Analytics to see which features are used. Collection is
              <strong> off until you grant analytics consent</strong> in the App, and stops again if you withdraw it. While it
              is on, it records feature-usage events together with an app instance ID that Firebase generates for your
              installation, and device details such as model, operating system and app version. Events carry no name, email
              address or message content. The Apps do not collect your device's Advertising ID.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Push Notifications</h3>
            <p>
              If you allow notifications, the App registers for a push token, through Firebase Cloud Messaging (FCM) on Android
              and the Apple Push Notification service on iOS. We store the token on our backend with your account and platform
              so we can send the notifications you asked for, such as event reminders and alerts. You can turn notifications
              off in your device settings at any time.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Crash Diagnostics</h3>
            <p>
              When an App crashes or hits an error, it saves a report on your device and sends it to our own error log the
              next time it starts. A report contains the error type, a shortened error message, the app version and the
              platform. Personal data is scrubbed from the message before it is stored. Crash reports go to no third-party
              crash-reporting service and are used only to find and fix bugs.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Sign-In</h3>
            <p>
              You can sign in to the Apps with email and password, with Google Sign-In, or (on iOS) with Sign in with Apple.
              When you use Google or Apple, we receive your name and email address (or Apple's private relay address) from that
              provider to create or match your account.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Maps</h3>
            <p>
              The Android app draws its maps with Google Maps. Google receives the map area being viewed, your IP address and,
              if you use "My Location," your device location, under Google's own privacy policy.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">In-App Subscriptions</h3>
            <p>
              Subscriptions bought in the Apps are processed by Google Play Billing on Android and Apple In-App Purchase on iOS.
              Google or Apple handles your payment details and we never see your card number. We receive a purchase token or
              transaction record, which our backend checks with Google or Apple to confirm your subscription tier. Deleting
              your account does not cancel a store subscription; cancel it in Google Play or the App Store.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Provide Our Services:</strong> Display events, restaurants, and attractions; process searches and filters</li>
              <li><strong>Personalize Your Experience:</strong> Remember your preferences, provide personalized recommendations using AI</li>
              <li><strong>Improve Our Platform:</strong> Analyze usage patterns, identify popular content, enhance features</li>
              <li><strong>Communicate With You:</strong> Send newsletters (with consent), service updates, and respond to inquiries</li>
              <li><strong>Process Transactions:</strong> Handle advertising purchases and business partnerships</li>
              <li><strong>Ensure Security:</strong> Detect and prevent fraud, protect against unauthorized access</li>
              <li><strong>Comply With Legal Obligations:</strong> Meet regulatory requirements and respond to legal requests</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Legal Bases for Processing (GDPR)</h2>
            <p>
              If you are in the European Economic Area (EEA) or the United Kingdom, we process your personal information only
              where we have a valid legal basis to do so under Article 6 of the GDPR:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Performance of a contract (Art. 6(1)(b)):</strong> to create and operate your account and provide the
                features you request.
              </li>
              <li>
                <strong>Consent (Art. 6(1)(a)):</strong> for non-essential analytics and advertising cookies, marketing emails,
                and personalized recommendations. You may withdraw consent at any time (see Your Privacy Choices) without
                affecting the lawfulness of processing before withdrawal.
              </li>
              <li>
                <strong>Legitimate interests (Art. 6(1)(f)):</strong> to secure our Site, prevent fraud and abuse, and improve
                our services — balanced against your rights and freedoms. You may object to this processing (see Your Rights).
              </li>
              <li>
                <strong>Legal obligation (Art. 6(1)(c)):</strong> to comply with tax, accounting, and other legal requirements.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">AI-Powered Features</h2>
            <p>
              Des Moines Insider uses artificial intelligence to enhance your experience. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Content Enhancement:</strong> AI improves event and restaurant descriptions for clarity and SEO</li>
              <li><strong>Personalized Recommendations:</strong> Our AI analyzes your browsing behavior to suggest relevant events and venues</li>
              <li><strong>Semantic Search:</strong> AI understands natural language queries like "romantic dinner with live music"</li>
              <li><strong>Predictive Analytics:</strong> AI predicts event popularity and optimal visit times</li>
            </ul>
            <p>
              All AI processing is designed to improve your experience. Your personal data is not used to train external AI models.
              We do not use your personal data to make decisions that produce legal or similarly significant effects about you
              without human involvement. You can disable personalized recommendations in your account settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Cookies and Tracking Technologies</h2>
            <p>We use the following types of cookies:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Essential Cookies:</strong> Required for the Site to function (authentication, security)</li>
              <li><strong>Preference Cookies:</strong> Remember your settings (theme, view mode, filters)</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how visitors use our Site (off unless you opt in)</li>
              <li><strong>Advertising Cookies:</strong> Where enabled, used by advertising partners to personalize ads and measure campaigns (off unless you opt in)</li>
            </ul>
            <p>
              Non-essential cookies are <strong>off by default</strong> and are only set after you opt in. You can change your
              choices at any time from the <strong>Your Privacy Choices</strong> control, and we honor the Global Privacy
              Control (GPC) browser signal automatically. For full details, see our{" "}
              <Link to="/cookie-policy" className="text-primary underline">Cookie Policy</Link>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Data Sharing and Disclosure</h2>
            <p>
              We do not sell your personal information for money. We may allow certain analytics and advertising partners to
              process site-activity data, which can be considered "sharing" or "sale" under some US state laws — you can opt out
              of this at any time (see <strong>Do Not Sell or Share My Personal Information</strong> below). We may share your
              information with:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Service Providers / Processors:</strong> Third-party vendors who help us operate the Site (hosting, analytics, email delivery, payment processing) under contractual data-protection obligations</li>
              <li><strong>Business Partners:</strong> Event organizers and venue owners may see anonymized aggregate data</li>
              <li><strong>Legal Requirements:</strong> When required by law, court order, or to protect our rights</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">Third-Party Sub-Processors</h3>
            <p>We rely on the following sub-processors to deliver our services:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Supabase:</strong> Database hosting and user authentication</li>
              <li><strong>Cloudflare:</strong> Content delivery, hosting, and security</li>
              <li><strong>Stripe:</strong> Payment processing (PCI compliant)</li>
              <li><strong>Amazon Web Services (Amazon SES):</strong> Transactional and marketing email delivery</li>
              <li><strong>OpenAI &amp; Anthropic:</strong> AI content and recommendation features (no personal data used for model training)</li>
              <li><strong>Google Analytics:</strong> Website analytics, where you have opted in (opt-out available)</li>
              <li><strong>Google (Firebase, Maps, Sign-In, Play):</strong> In the Apps, Firebase Analytics (only with your consent), Firebase Cloud Messaging for push delivery, Google Maps for map display, Google Sign-In, and Google Play Billing for Android subscriptions</li>
              <li><strong>Apple:</strong> In the iOS app, Sign in with Apple, the Apple Push Notification service, and Apple In-App Purchase for subscriptions</li>
            </ul>
            <p>
              A complete and current list of sub-processors, including the categories of data and safeguards, is maintained in
              our <Link to="/dpa" className="text-primary underline">Data Processing Agreement</Link>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to provide our services and fulfill the purposes
              described in this policy. Specifically:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Data:</strong> Retained until you delete your account</li>
              <li><strong>Usage Data:</strong> Retained for up to 24 months for analytics purposes</li>
              <li><strong>Newsletter Subscriptions:</strong> Until you unsubscribe</li>
              <li><strong>Consent Records:</strong> Retained as proof of your consent choices, as required by law</li>
              <li><strong>Transaction Records:</strong> Retained for 7 years for legal and tax purposes</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Your Rights and Choices</h2>
            <p>
              Depending on where you live, you have some or all of the following rights over your personal information. We
              honor these rights for all users regardless of location wherever practical:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Rectification / Correction:</strong> Update or correct inaccurate information in your account settings</li>
              <li><strong>Erasure / Deletion:</strong> Request deletion of your account and associated data</li>
              <li><strong>Portability:</strong> Download a machine-readable copy of your data</li>
              <li><strong>Object:</strong> Object to processing based on our legitimate interests</li>
              <li><strong>Restriction:</strong> Ask us to restrict processing in certain circumstances</li>
              <li><strong>Withdraw Consent:</strong> Withdraw consent for analytics, advertising, or marketing at any time</li>
              <li><strong>Opt-Out of Marketing:</strong> Unsubscribe from newsletters using the link in each email</li>
              <li><strong>Non-Discrimination:</strong> We will not discriminate against you for exercising any of these rights</li>
            </ul>
            <p>
              You can exercise most of these rights directly from your{" "}
              <Link to="/profile" className="text-primary underline">account settings</Link> (which include self-service
              data export and account deletion) or by emailing{" "}
              <a href="mailto:privacy@desmoinesinsider.com" className="text-primary underline">privacy@desmoinesinsider.com</a>.
              We will respond within the timeframes required by applicable law (generally 30–45 days). If we decline a request,
              you have the right to appeal by replying to our response, and to lodge a complaint with your local data protection
              authority.
            </p>
            <p>
              To delete your account without signing in, or from the iOS or Android app, follow the steps on our{" "}
              <Link to="/account/delete" className="text-primary underline">account deletion page</Link>.
            </p>
          </section>

          <section className="mb-8" id="do-not-sell">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Do Not Sell or Share My Personal Information</h2>
            <p>
              We do not sell your personal information for money. However, our use of analytics and advertising cookies may
              constitute a "sale" or "sharing" of personal information (including cross-context behavioral advertising) under
              the California Privacy Rights Act (CPRA) and similar US state laws. You have the right to opt out.
            </p>
            <p>
              To opt out, use the <strong>Your Privacy Choices</strong> control below (also available any time from the site
              footer) and turn off the Advertising and Analytics categories. We also automatically treat the Global Privacy
              Control (GPC) browser signal as a valid opt-out request.
            </p>
            <div className="not-prose my-4">
              <Button variant="outline" onClick={reopenConsentBanner}>
                Your Privacy Choices
              </Button>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your personal information, including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Encryption of data in transit (HTTPS/TLS) and at rest</li>
              <li>Secure password hashing and account lockout protection</li>
              <li>Row-level security (RLS) restricting each user's data to that user</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Access controls limiting employee access to personal data</li>
              <li>IP address hashing to enhance privacy while maintaining security</li>
            </ul>
            <p>
              While we strive to protect your information, no method of transmission over the Internet is 100% secure.
              We cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Children's Privacy</h2>
            <p>
              Our Site is not intended for children under 13 years of age, and where consent is required for data processing in
              the EEA/UK, our services are directed to users aged 16 and older. We do not knowingly collect personal information
              from children under 13. If you believe we have collected information from a child under 13, please contact us
              immediately at <a href="mailto:privacy@desmoinesinsider.com" className="text-primary underline">privacy@desmoinesinsider.com</a>{" "}
              so we can delete it.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">US State Privacy Rights</h2>
            <p>
              Residents of California (CCPA/CPRA) and other states with comprehensive privacy laws — including Virginia (VCDPA),
              Colorado (CPA), Connecticut (CTDPA), Utah (UCPA), and others as they take effect — have the rights described in
              <strong> Your Rights and Choices</strong> above, including the right to know, delete, correct, and opt out of the
              sale/sharing of personal information and targeted advertising, and the right to limit the use of sensitive personal
              information. We do not use or disclose sensitive personal information for purposes that require a right-to-limit
              option. To exercise any of these rights, use the tools in your account settings, the{" "}
              <strong>Your Privacy Choices</strong> control, or email{" "}
              <a href="mailto:privacy@desmoinesinsider.com" className="text-primary underline">privacy@desmoinesinsider.com</a>.
              You may use an authorized agent to submit a request on your behalf.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">International Users and Data Transfers</h2>
            <p>
              Our Site is operated in the United States. If you access our Site from outside the United States,
              your information may be transferred to, stored, and processed in the United States where our servers and
              sub-processors are located. Where we transfer personal data out of the EEA or UK, we rely on appropriate
              safeguards such as the European Commission's Standard Contractual Clauses (SCCs) and the UK International Data
              Transfer Addendum, as described in our{" "}
              <Link to="/dpa" className="text-primary underline">Data Processing Agreement</Link>.
            </p>
            <h3 className="text-xl font-medium mt-6 mb-3">EU / UK Representative</h3>
            <p>
              {/* TODO(legal): appoint and name a GDPR Art. 27 / UK representative if we
                  target or monitor EEA/UK data subjects, then replace this paragraph. */}
              If and where required under Article 27 of the GDPR, we will appoint a representative in the EU and/or UK. Until a
              representative is named here, EEA and UK residents may contact our privacy team directly at{" "}
              <a href="mailto:privacy@desmoinesinsider.com" className="text-primary underline">privacy@desmoinesinsider.com</a>{" "}
              for any data-protection matter.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the
              new Privacy Policy on this page and updating the "Last Updated" date. For significant changes, we may
              also send you an email notification if you have an account with us.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or our data practices, or wish to exercise your privacy rights,
              please contact us at:
            </p>
            <address className="not-italic mt-4 p-4 bg-muted rounded-lg">
              <strong>Des Moines Insider</strong><br />
              Email: privacy@desmoinesinsider.com<br />
              {/* TODO(legal): replace with a full registered postal address (street or
                  PO box) for legal notices and CAN-SPAM compliance. */}
              Des Moines, Iowa, USA
            </address>
          </section>

          <section className="mt-12 pt-8 border-t">
            <p className="text-sm text-muted-foreground">
              By using Des Moines Insider, you acknowledge that you have read and understood this Privacy Policy.
              Please also review our <Link to="/terms" className="text-primary underline">Terms of Service</Link>{" "}
              and <Link to="/cookie-policy" className="text-primary underline">Cookie Policy</Link>.
            </p>
          </section>
        </article>
      </div>

      <Footer />
      <BackToTop />
    </div>
  );
}
