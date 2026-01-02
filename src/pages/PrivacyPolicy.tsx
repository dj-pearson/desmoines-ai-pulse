import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { BackToTop } from "@/components/BackToTop";

export default function PrivacyPolicy() {
  const lastUpdated = "November 25, 2025";

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Privacy Policy | Des Moines Insider"
        description="Learn how Des Moines Insider collects, uses, and protects your personal information. Our privacy policy explains your rights and our data practices."
        url="https://desmoinesinsider.com/privacy-policy"
        type="website"
      />

      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <article className="prose prose-lg dark:prose-invert max-w-none">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last Updated: {lastUpdated}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Introduction</h2>
            <p>
              Welcome to Des Moines Insider ("we," "our," or "us"). We are committed to protecting your privacy and ensuring
              you have a positive experience on our website at desmoinesinsider.com (the "Site"). This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when you visit our Site or use our services.
            </p>
            <p>
              Des Moines Insider is an AI-powered city guide platform that helps you discover events, restaurants, attractions,
              and local experiences in the Des Moines, Iowa metropolitan area. By using our Site, you agree to the collection
              and use of information in accordance with this policy.
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
              <li><strong>Location Data:</strong> General geographic location based on IP address (not precise GPS)</li>
              <li><strong>Cookies and Similar Technologies:</strong> Session cookies, preference cookies, and analytics cookies</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">Information from Third-Party Services</h3>
            <p>If you choose to link your account with third-party services, we may receive:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Basic profile information from social login providers (Google, Apple)</li>
              <li>Calendar availability if you use our calendar integration features</li>
            </ul>
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
              You can disable personalized recommendations in your account settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Cookies and Tracking Technologies</h2>
            <p>We use the following types of cookies:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Essential Cookies:</strong> Required for the Site to function (authentication, security)</li>
              <li><strong>Preference Cookies:</strong> Remember your settings (theme, view mode, filters)</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how visitors use our Site (can be disabled)</li>
              <li><strong>Advertising Cookies:</strong> Track ad impressions and clicks for our advertising partners</li>
            </ul>
            <p>
              You can control cookies through your browser settings. Note that disabling certain cookies may affect Site functionality.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Data Sharing and Disclosure</h2>
            <p>We do not sell your personal information. We may share your information with:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Service Providers:</strong> Third-party vendors who help us operate the Site (hosting, analytics, email delivery, payment processing)</li>
              <li><strong>Business Partners:</strong> Event organizers and venue owners may see anonymized aggregate data</li>
              <li><strong>Legal Requirements:</strong> When required by law, court order, or to protect our rights</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">Third-Party Service Providers</h3>
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Supabase:</strong> Database hosting and user authentication</li>
              <li><strong>Cloudflare:</strong> Content delivery and security</li>
              <li><strong>Stripe:</strong> Payment processing (PCI compliant)</li>
              <li><strong>Google Analytics:</strong> Website analytics (opt-out available)</li>
            </ul>
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
              <li><strong>Transaction Records:</strong> Retained for 7 years for legal and tax purposes</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Your Rights and Choices</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access Your Data:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correct Your Data:</strong> Update or correct inaccurate information in your account settings</li>
              <li><strong>Delete Your Data:</strong> Request deletion of your account and associated data</li>
              <li><strong>Opt-Out of Marketing:</strong> Unsubscribe from newsletters using the link in each email</li>
              <li><strong>Disable Analytics:</strong> Turn off personalized tracking in your account preferences</li>
              <li><strong>Export Your Data:</strong> Download your preferences and saved content</li>
            </ul>
            <p>
              To exercise these rights, visit your account settings or contact us at privacy@desmoinesinsider.com.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your personal information, including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Encryption of data in transit (HTTPS/TLS) and at rest</li>
              <li>Secure password hashing and account lockout protection</li>
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
              Our Site is not intended for children under 13 years of age. We do not knowingly collect personal information
              from children under 13. If you believe we have collected information from a child under 13, please contact us
              immediately so we can delete it.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">California Privacy Rights</h2>
            <p>
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Right to know what personal information is collected and how it's used</li>
              <li>Right to delete personal information</li>
              <li>Right to opt-out of the sale of personal information (we do not sell your data)</li>
              <li>Right to non-discrimination for exercising your privacy rights</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">International Users</h2>
            <p>
              Our Site is operated in the United States. If you access our Site from outside the United States,
              please be aware that your information may be transferred to, stored, and processed in the United States
              where our servers are located. By using our Site, you consent to this transfer.
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
              If you have questions about this Privacy Policy or our data practices, please contact us at:
            </p>
            <address className="not-italic mt-4 p-4 bg-muted rounded-lg">
              <strong>Des Moines Insider</strong><br />
              Email: privacy@desmoinesinsider.com<br />
              Des Moines, Iowa, USA
            </address>
          </section>

          <section className="mt-12 pt-8 border-t">
            <p className="text-sm text-muted-foreground">
              By using Des Moines Insider, you acknowledge that you have read and understood this Privacy Policy.
              Please also review our <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>.
            </p>
          </section>
        </article>
      </main>

      <Footer />
      <BackToTop />
    </div>
  );
}
