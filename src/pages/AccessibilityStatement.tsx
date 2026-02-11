import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { BackToTop } from "@/components/BackToTop";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accessibility,
  Keyboard,
  Eye,
  Volume2,
  Smartphone,
  Mail,
  ExternalLink,
  CheckCircle,
  AlertCircle
} from "lucide-react";

export default function AccessibilityStatement() {
  const lastUpdated = "January 12, 2026";
  const wcagVersion = "2.1";
  const conformanceLevel = "AA";

  const accessibilityFeatures = [
    {
      icon: Keyboard,
      title: "Keyboard Navigation",
      description: "Full keyboard accessibility for all interactive elements. Use Tab to navigate, Enter/Space to activate, and Escape to close dialogs."
    },
    {
      icon: Eye,
      title: "Screen Reader Support",
      description: "ARIA labels, landmarks, and live regions ensure content is accessible to screen reader users. We test with NVDA, JAWS, and VoiceOver."
    },
    {
      icon: Volume2,
      title: "Audio Descriptions",
      description: "Important images include descriptive alt text. Video content includes captions when available."
    },
    {
      icon: Smartphone,
      title: "Mobile Accessibility",
      description: "Touch targets meet minimum 44x44 pixel requirements. Content adapts to different screen sizes and orientations."
    }
  ];

  const knownLimitations = [
    {
      issue: "Third-party embedded content",
      description: "Some embedded maps and external widgets may not meet all accessibility requirements.",
      status: "working"
    },
    {
      issue: "PDF documents",
      description: "Some older PDF documents may not be fully accessible. Contact us for accessible alternatives.",
      status: "working"
    },
    {
      issue: "User-generated content",
      description: "Content submitted by users may not always include proper accessibility features.",
      status: "monitoring"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Accessibility Statement | Des Moines Insider"
        description="Des Moines Insider is committed to ensuring digital accessibility for people with disabilities. Learn about our WCAG 2.1 Level AA conformance and accessibility features."
        url="https://desmoinesinsider.com/accessibility"
        type="website"
      />

      <Header />

      <main id="main-content" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Accessibility" },
          ]}
        />

        <article className="prose prose-lg dark:prose-invert max-w-none">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
            Accessibility Statement
          </h1>
          <p className="text-muted-foreground mb-8">Last Updated: {lastUpdated}</p>

          {/* Commitment Section */}
          <section className="mb-10" aria-labelledby="commitment-heading">
            <h2 id="commitment-heading" className="text-2xl font-semibold mt-8 mb-4 flex items-center gap-2">
              <Accessibility className="h-6 w-6 text-primary" aria-hidden="true" />
              Our Commitment to Accessibility
            </h2>
            <p>
              Des Moines Insider is committed to ensuring digital accessibility for people with
              disabilities. We are continually improving the user experience for everyone and
              applying the relevant accessibility standards to ensure we provide equal access
              to all users.
            </p>
            <p>
              We believe that the internet should be available and accessible to anyone, and
              are committed to providing a website that is accessible to the widest possible
              audience, regardless of circumstance and ability.
            </p>
          </section>

          {/* Conformance Status */}
          <section className="mb-10" aria-labelledby="conformance-heading">
            <h2 id="conformance-heading" className="text-2xl font-semibold mt-8 mb-4">
              Conformance Status
            </h2>
            <Card className="border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-lg font-medium">
                      WCAG {wcagVersion} Level {conformanceLevel} Conformance
                    </p>
                    <p className="text-muted-foreground mt-1">
                      Des Moines Insider conforms to the Web Content Accessibility Guidelines
                      (WCAG) {wcagVersion} at Level {conformanceLevel}. These guidelines explain
                      how to make web content more accessible for people with disabilities and
                      user-friendly for everyone.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <p className="mt-4">
              The{" "}
              <a
                href="https://www.w3.org/WAI/standards-guidelines/wcag/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Web Content Accessibility Guidelines (WCAG)
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">(opens in new tab)</span>
              </a>
              {" "}defines requirements for designers and developers to improve accessibility
              for people with disabilities. It defines three levels of conformance: Level A,
              Level AA, and Level AAA. Des Moines Insider is partially conformant with WCAG
              {wcagVersion} Level {conformanceLevel}.
            </p>
          </section>

          {/* Accessibility Features */}
          <section className="mb-10" aria-labelledby="features-heading">
            <h2 id="features-heading" className="text-2xl font-semibold mt-8 mb-4">
              Accessibility Features
            </h2>
            <p className="mb-6">
              We have implemented the following accessibility features on our website:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose">
              {accessibilityFeatures.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Card key={index}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                        {feature.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Technical Specifications */}
          <section className="mb-10" aria-labelledby="technical-heading">
            <h2 id="technical-heading" className="text-2xl font-semibold mt-8 mb-4">
              Technical Specifications
            </h2>
            <p>
              Accessibility of Des Moines Insider relies on the following technologies
              to work with the particular combination of web browser and any assistive
              technologies or plugins installed on your computer:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>HTML5</li>
              <li>WAI-ARIA (Web Accessibility Initiative - Accessible Rich Internet Applications)</li>
              <li>CSS (Cascading Style Sheets)</li>
              <li>JavaScript</li>
            </ul>
            <p className="mt-4">
              These technologies are relied upon for conformance with the accessibility
              standards used.
            </p>
          </section>

          {/* Browser & Assistive Technology Support */}
          <section className="mb-10" aria-labelledby="browser-heading">
            <h2 id="browser-heading" className="text-2xl font-semibold mt-8 mb-4">
              Browser and Assistive Technology Support
            </h2>
            <p>
              Des Moines Insider is designed to be compatible with the following
              assistive technologies:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Screen readers (NVDA, JAWS, VoiceOver, TalkBack)</li>
              <li>Screen magnification software</li>
              <li>Speech recognition software</li>
              <li>Keyboard-only navigation</li>
            </ul>
            <p className="mt-4">
              The site is tested for compatibility with the following browsers:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Google Chrome (latest two versions)</li>
              <li>Mozilla Firefox (latest two versions)</li>
              <li>Apple Safari (latest two versions)</li>
              <li>Microsoft Edge (latest two versions)</li>
            </ul>
          </section>

          {/* Known Limitations */}
          <section className="mb-10" aria-labelledby="limitations-heading">
            <h2 id="limitations-heading" className="text-2xl font-semibold mt-8 mb-4">
              Known Limitations
            </h2>
            <p>
              Despite our best efforts to ensure accessibility of Des Moines Insider,
              there may be some limitations. Below is a description of known limitations
              and potential solutions. Please contact us if you observe an issue not
              listed below.
            </p>
            <div className="mt-4 space-y-4 not-prose">
              {knownLimitations.map((limitation, index) => (
                <Card key={index} className="border-amber-200 dark:border-amber-800">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle
                        className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-medium">{limitation.issue}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {limitation.description}
                        </p>
                        <span className="inline-block mt-2 text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                          Status: {limitation.status === "working" ? "Actively working on fix" : "Monitoring"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section className="mb-10" aria-labelledby="shortcuts-heading">
            <h2 id="shortcuts-heading" className="text-2xl font-semibold mt-8 mb-4">
              Keyboard Shortcuts
            </h2>
            <p>
              Des Moines Insider supports the following keyboard shortcuts for
              improved navigation:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse">
                <caption className="sr-only">Keyboard shortcuts available on this website</caption>
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="text-left py-2 pr-4 font-semibold">Shortcut</th>
                    <th scope="col" className="text-left py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><kbd className="px-2 py-1 bg-muted rounded text-sm">Tab</kbd></td>
                    <td className="py-2">Move to next focusable element</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><kbd className="px-2 py-1 bg-muted rounded text-sm">Shift + Tab</kbd></td>
                    <td className="py-2">Move to previous focusable element</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><kbd className="px-2 py-1 bg-muted rounded text-sm">Enter</kbd> / <kbd className="px-2 py-1 bg-muted rounded text-sm">Space</kbd></td>
                    <td className="py-2">Activate button or link</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><kbd className="px-2 py-1 bg-muted rounded text-sm">Escape</kbd></td>
                    <td className="py-2">Close modal or dialog</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><kbd className="px-2 py-1 bg-muted rounded text-sm">?</kbd></td>
                    <td className="py-2">Open keyboard shortcuts help</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><kbd className="px-2 py-1 bg-muted rounded text-sm">/</kbd></td>
                    <td className="py-2">Focus search box</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><kbd className="px-2 py-1 bg-muted rounded text-sm">g</kbd> then <kbd className="px-2 py-1 bg-muted rounded text-sm">h</kbd></td>
                    <td className="py-2">Go to home page</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><kbd className="px-2 py-1 bg-muted rounded text-sm">g</kbd> then <kbd className="px-2 py-1 bg-muted rounded text-sm">e</kbd></td>
                    <td className="py-2">Go to events page</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Assessment Methods */}
          <section className="mb-10" aria-labelledby="assessment-heading">
            <h2 id="assessment-heading" className="text-2xl font-semibold mt-8 mb-4">
              Assessment Methods
            </h2>
            <p>
              Des Moines Insider assessed the accessibility of this website by the
              following methods:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>
                <strong>Automated testing:</strong> We use axe-core and Playwright
                for automated accessibility testing in our continuous integration pipeline
              </li>
              <li>
                <strong>Manual testing:</strong> Regular manual testing with keyboard
                navigation and screen readers
              </li>
              <li>
                <strong>User testing:</strong> We gather feedback from users with
                disabilities to identify and address accessibility issues
              </li>
            </ul>
          </section>

          {/* Feedback */}
          <section className="mb-10" aria-labelledby="feedback-heading">
            <h2 id="feedback-heading" className="text-2xl font-semibold mt-8 mb-4">
              Feedback and Contact Information
            </h2>
            <p>
              We welcome your feedback on the accessibility of Des Moines Insider.
              Please let us know if you encounter accessibility barriers:
            </p>

            <Card className="mt-6 not-prose">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
                    <div>
                      <p className="font-medium">Email</p>
                      <a
                        href="mailto:accessibility@desmoinesinsider.com"
                        className="text-primary hover:underline"
                      >
                        accessibility@desmoinesinsider.com
                      </a>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      We aim to respond to accessibility feedback within 5 business days.
                      Please include the following information in your message:
                    </p>
                    <ul className="text-sm text-muted-foreground mt-2 list-disc pl-5 space-y-1">
                      <li>The web page (URL) where you encountered the issue</li>
                      <li>A description of the accessibility issue</li>
                      <li>The assistive technology you use (if applicable)</li>
                      <li>Your preferred method of contact</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="mt-6">
              <Link to="/contact">
                <Button variant="outline" className="gap-2">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Contact Us
                </Button>
              </Link>
            </div>
          </section>

          {/* Legal */}
          <section className="mb-10" aria-labelledby="legal-heading">
            <h2 id="legal-heading" className="text-2xl font-semibold mt-8 mb-4">
              Legal and Regulatory Compliance
            </h2>
            <p>
              Des Moines Insider strives to comply with all applicable accessibility
              laws and regulations, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>
                <strong>Americans with Disabilities Act (ADA):</strong> Title III
                requires places of public accommodation, including websites, to be
                accessible to individuals with disabilities
              </li>
              <li>
                <strong>Section 508 of the Rehabilitation Act:</strong> Requires
                federal agencies to make their electronic and information technology
                accessible
              </li>
              <li>
                <strong>WCAG 2.1 Level AA:</strong> The internationally recognized
                web accessibility standard we follow
              </li>
            </ul>
          </section>

          {/* Related Links */}
          <section className="mt-12 pt-8 border-t">
            <p className="text-sm text-muted-foreground">
              For more information about our policies, please review our{" "}
              <Link to="/privacy-policy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link to="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Learn more about web accessibility from the{" "}
              <a
                href="https://www.w3.org/WAI/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                W3C Web Accessibility Initiative (WAI)
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">(opens in new tab)</span>
              </a>
            </p>
          </section>
        </article>
      </main>

      <Footer />
      <BackToTop />
    </div>
  );
}
