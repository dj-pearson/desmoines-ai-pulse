import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { BackToTop } from "@/components/BackToTop";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export default function Terms() {
  const lastUpdated = "March 10, 2026";

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Terms of Service | Des Moines Insider"
        description="Read the Terms of Service for Des Moines Insider. Understand your rights and responsibilities when using our AI-powered city guide platform."
        url="https://desmoinesinsider.com/terms"
        type="website"
      />

      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Terms of Service" },
          ]}
        />

        <article className="prose prose-lg dark:prose-invert max-w-none">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last Updated: {lastUpdated}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Agreement to Terms</h2>
            <p>
              Welcome to Des Moines Insider. These Terms of Service ("Terms") govern your access to and use of the
              Des Moines Insider website located at desmoinesinsider.com (the "Site") and all related services,
              applications, and features (collectively, the "Services").
            </p>
            <p>
              By accessing or using our Services, you agree to be bound by these Terms. If you disagree with any part
              of these Terms, you may not access our Services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">2. Description of Services</h2>
            <p>
              Des Moines Insider is an AI-powered city guide platform that provides:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Event discovery and calendar integration for Des Moines metropolitan area</li>
              <li>Restaurant listings, reviews, and recommendations</li>
              <li>Attraction and venue information</li>
              <li>AI-enhanced content and personalized recommendations</li>
              <li>Business advertising and promotional services</li>
              <li>Newsletter and notification services</li>
              <li>Multi-channel access including web, SMS, and voice assistant integration</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">3. User Accounts</h2>

            <h3 className="text-xl font-medium mt-6 mb-3">Account Creation</h3>
            <p>
              To access certain features of our Services, you may need to create an account. When creating an account, you agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Keep your password secure and confidential</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized access</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">Account Termination</h3>
            <p>
              We reserve the right to suspend or terminate your account at any time for violations of these Terms or
              for any other reason at our sole discretion. You may delete your account at any time through your
              account settings or by contacting us.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">4. User Conduct</h2>
            <p>When using our Services, you agree NOT to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Violate any applicable laws, regulations, or third-party rights</li>
              <li>Submit false, misleading, or fraudulent information</li>
              <li>Impersonate any person or entity</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Post spam, malware, or unauthorized advertising</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Scrape, crawl, or harvest data without permission</li>
              <li>Interfere with or disrupt the Services</li>
              <li>Use automated tools to access the Services without our consent</li>
              <li>Circumvent any security measures or rate limiting</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">5. User-Generated Content</h2>

            <h3 className="text-xl font-medium mt-6 mb-3">Content You Submit</h3>
            <p>
              You may submit content to our Services, including reviews, ratings, event submissions, and comments
              ("User Content"). By submitting User Content, you:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Grant us a non-exclusive, royalty-free, worldwide license to use, display, modify, and distribute your content</li>
              <li>Represent that you own or have the right to submit the content</li>
              <li>Agree that your content does not violate any third-party rights</li>
              <li>Acknowledge that we may edit or remove content at our discretion</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">Content Standards</h3>
            <p>User Content must be:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Accurate and not misleading</li>
              <li>Original or properly attributed</li>
              <li>Relevant to Des Moines events, restaurants, or attractions</li>
              <li>Free from hate speech, discrimination, or offensive material</li>
              <li>Compliant with applicable laws</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">6. Intellectual Property</h2>

            <h3 className="text-xl font-medium mt-6 mb-3">Our Content</h3>
            <p>
              The Services and all content, features, and functionality (including but not limited to design, text,
              graphics, logos, images, AI-generated descriptions, and software) are owned by Des Moines Insider or
              our licensors and are protected by copyright, trademark, and other intellectual property laws.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Limited License</h3>
            <p>
              We grant you a limited, non-exclusive, non-transferable license to access and use our Services for
              personal, non-commercial purposes. This license does not include the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Modify or copy our materials except as necessary for personal use</li>
              <li>Use any data mining, robots, or similar data gathering tools</li>
              <li>Remove any copyright or proprietary notices</li>
              <li>Create derivative works based on our content</li>
              <li>Use our content for commercial purposes without written permission</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">Trademarks</h3>
            <p>
              "Des Moines Insider," "Des Moines AI Pulse," and related logos are trademarks of Des Moines Insider.
              You may not use our trademarks without prior written consent.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">7. Third-Party Content and Links</h2>
            <p>
              Our Services may contain information about events, restaurants, and attractions provided by third parties.
              We also link to external websites. We are not responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>The accuracy of third-party event or venue information</li>
              <li>Changes to event schedules, prices, or availability</li>
              <li>The content, policies, or practices of linked websites</li>
              <li>Any transactions you conduct with third parties</li>
            </ul>
            <p>
              We encourage you to verify event details directly with venues and review third-party terms before
              making purchases or reservations.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">8. AI-Generated Content</h2>
            <p>
              Our Services use artificial intelligence to enhance content, provide recommendations, and improve
              user experience. You acknowledge that:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>AI-generated descriptions and recommendations may not be 100% accurate</li>
              <li>AI predictions about event popularity or demand are estimates only</li>
              <li>You should verify important information before making decisions</li>
              <li>AI features are provided "as is" without warranty of accuracy</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">9. Advertising and Business Services</h2>
            <p>
              If you use our advertising or business partnership services, you additionally agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate business information</li>
              <li>Comply with all advertising standards and regulations</li>
              <li>Pay applicable fees according to the selected plan</li>
              <li>Not submit misleading or deceptive advertisements</li>
              <li>Maintain valid payment information</li>
            </ul>
            <p>
              Payment processing is handled securely through Stripe. Refunds are subject to our refund policy,
              which varies by service type.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">10. Subscriptions and In-App Purchases (EULA)</h2>

            <h3 className="text-xl font-medium mt-6 mb-3">Subscription Plans</h3>
            <p>
              Des Moines Insider offers optional auto-renewable subscription plans ("Insider" and "VIP") that unlock
              premium features. Subscription details, including pricing and included features, are displayed within the
              app prior to purchase.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Billing and Renewal</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Payment is charged to your Apple ID account at confirmation of purchase.</li>
              <li>Subscriptions automatically renew unless canceled at least 24 hours before the end of the current billing period.</li>
              <li>Your account will be charged for renewal within 24 hours prior to the end of the current period at the same price you originally paid, unless the pricing has changed, in which case you will be notified in advance.</li>
              <li>Any unused portion of a free trial period, if offered, will be forfeited when you purchase a subscription.</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">Managing and Canceling Subscriptions</h3>
            <p>
              You can manage or cancel your subscription at any time through your Apple ID account settings. Navigate
              to Settings &gt; [your name] &gt; Subscriptions on your iOS device, or visit{" "}
              <a href="https://apps.apple.com/account/subscriptions" className="text-primary underline" target="_blank" rel="noopener noreferrer">
                Apple Subscription Management
              </a>. Cancellation takes effect at the end of the current billing period. No refunds are provided for
              partial billing periods.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Subscription Features</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Insider</strong> ($4.99/month): Unlimited favorites, advanced search filters, event reminders, and ad-free experience.</li>
              <li><strong>VIP</strong> ($12.99/month): All Insider features plus AI Trip Planner, priority support, and early access to new features.</li>
            </ul>
            <p className="mt-2">
              Pricing is in US dollars and may vary by region. Applicable taxes may apply based on your location.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">License Grant</h3>
            <p>
              Subject to your compliance with these Terms, Des Moines Insider grants you a limited, non-exclusive,
              non-transferable, revocable license to access and use the app and its premium features on any Apple device
              that you own or control, as permitted by the Apple Media Services Terms and Conditions. This license does not
              allow you to use the app on any device you do not own or control, and you may not distribute or make the app
              available over a network where it could be used by multiple devices at the same time.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Refunds</h3>
            <p>
              All subscription purchases are processed by Apple. Refund requests must be submitted through Apple's
              support channels at{" "}
              <a href="https://reportaproblem.apple.com" className="text-primary underline" target="_blank" rel="noopener noreferrer">
                reportaproblem.apple.com
              </a>. Des Moines Insider does not process refunds directly for App Store purchases.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">11. Disclaimer of Warranties</h2>
            <p className="uppercase text-sm">
              THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS
              OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT
              LIMITED TO:
            </p>
            <ul className="list-disc pl-6 space-y-2 uppercase text-sm">
              <li>IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE</li>
              <li>WARRANTIES THAT THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE</li>
              <li>WARRANTIES REGARDING THE ACCURACY OR COMPLETENESS OF CONTENT</li>
              <li>WARRANTIES THAT DEFECTS WILL BE CORRECTED</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">12. Limitation of Liability</h2>
            <p className="uppercase text-sm">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, DES MOINES INSIDER AND ITS OFFICERS, DIRECTORS, EMPLOYEES,
              AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
              DAMAGES, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc pl-6 space-y-2 uppercase text-sm">
              <li>LOSS OF PROFITS, DATA, OR GOODWILL</li>
              <li>SERVICE INTERRUPTION OR COMPUTER DAMAGE</li>
              <li>DAMAGES RESULTING FROM YOUR USE OF OR INABILITY TO USE THE SERVICES</li>
              <li>DAMAGES FROM EVENTS YOU ATTEND BASED ON OUR INFORMATION</li>
            </ul>
            <p className="uppercase text-sm mt-4">
              OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE MONTHS PRECEDING THE CLAIM,
              OR $100, WHICHEVER IS GREATER.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">13. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Des Moines Insider and its affiliates from any claims,
              damages, losses, and expenses (including reasonable attorneys' fees) arising from:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your use of the Services</li>
              <li>Your violation of these Terms</li>
              <li>Your User Content</li>
              <li>Your violation of any third-party rights</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">14. Dispute Resolution</h2>

            <h3 className="text-xl font-medium mt-6 mb-3">Governing Law</h3>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of Iowa,
              without regard to its conflict of law provisions.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Informal Resolution</h3>
            <p>
              Before filing any formal dispute, you agree to contact us and attempt to resolve the dispute informally
              for at least 30 days.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Jurisdiction</h3>
            <p>
              Any legal action relating to these Terms shall be brought exclusively in the state or federal courts
              located in Polk County, Iowa, and you consent to the jurisdiction of such courts.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">15. Changes to Terms</h2>
            <p>
              We may modify these Terms at any time. We will notify you of material changes by posting the updated
              Terms on this page and updating the "Last Updated" date. For significant changes affecting your rights,
              we may also send an email notification.
            </p>
            <p>
              Your continued use of the Services after any changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">16. General Provisions</h2>

            <h3 className="text-xl font-medium mt-6 mb-3">Entire Agreement</h3>
            <p>
              These Terms, together with our Privacy Policy, constitute the entire agreement between you and
              Des Moines Insider regarding the Services.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Severability</h3>
            <p>
              If any provision of these Terms is found to be unenforceable, the remaining provisions will
              continue in full force and effect.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Waiver</h3>
            <p>
              Our failure to enforce any right or provision of these Terms will not be considered a waiver of
              those rights.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3">Assignment</h3>
            <p>
              You may not assign or transfer these Terms without our prior written consent. We may assign our
              rights and obligations without restriction.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mt-8 mb-4">17. Contact Information</h2>
            <p>
              If you have any questions about these Terms, please contact us at:
            </p>
            <address className="not-italic mt-4 p-4 bg-muted rounded-lg">
              <strong>Des Moines Insider</strong><br />
              Email: legal@desmoinesinsider.com<br />
              Des Moines, Iowa, USA
            </address>
          </section>

          <section className="mt-12 pt-8 border-t">
            <p className="text-sm text-muted-foreground">
              By using Des Moines Insider, you acknowledge that you have read, understood, and agree to be bound
              by these Terms of Service. Please also review our <Link to="/privacy-policy" className="text-primary underline">Privacy Policy</Link>.
            </p>
          </section>
        </article>
      </div>

      <Footer />
      <BackToTop />
    </div>
  );
}
