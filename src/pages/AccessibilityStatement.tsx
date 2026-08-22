import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { BackToTop } from "@/components/BackToTop";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  Accessibility,
  Keyboard,
  Eye,
  EyeOff,
  Volume2,
  Smartphone,
  Mail,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Moon,
  Type,
  Palette,
  MonitorSmartphone,
  Mic,
  Subtitles,
  AudioLines,
  Pause,
  Shield,
  Settings,
  Scale,
} from "lucide-react";

export default function AccessibilityStatement() {
  useDocumentTitle("Accessibility Statement");

  const lastUpdated = "March 2, 2026";
  const wcagVersion = "2.1";
  const conformanceLevel = "AA";

  const appleAccessibilityFeatures = [
    {
      icon: Eye,
      title: "VoiceOver",
      supported: true,
      description:
        "Full VoiceOver and screen reader support across all pages and interactive elements. We implement comprehensive ARIA labels, landmarks, live regions, and semantic HTML. All images include descriptive alt text, all form fields have associated labels, and dynamic content changes are announced to assistive technology. Navigation includes proper heading hierarchy, skip links, and focus management on route changes. Tested with VoiceOver (iOS/macOS), NVDA, JAWS, and TalkBack.",
    },
    {
      icon: Mic,
      title: "Voice Control",
      supported: true,
      description:
        "All interactive elements have accessible names that can be spoken as voice commands. Buttons, links, form fields, and controls use descriptive aria-label attributes and visible text labels, enabling users to navigate and interact using iOS Voice Control, macOS Voice Control, and browser-based speech recognition. Custom controls such as our video player, accessibility widget, and search interface are fully operable via voice commands.",
    },
    {
      icon: Type,
      title: "Larger Text",
      supported: true,
      description:
        "Built-in font scaling system with 7 levels of adjustment (75% to 150% of default size). Users can adjust text size via our accessibility widget without losing content or functionality. All text uses relative units (rem/em) to respect browser and OS-level text size preferences. Layouts reflow properly at up to 200% zoom with no horizontal scrolling required. Supports iOS Dynamic Type preferences.",
    },
    {
      icon: Moon,
      title: "Dark Interface",
      supported: true,
      description:
        "Full dark mode implementation with automatic detection of system preferences via prefers-color-scheme. Users can toggle between light, dark, and system-matched themes. All UI components, cards, navigation, forms, and content areas adapt to the dark color scheme with carefully designed color variables ensuring readability and visual hierarchy are maintained. Theme preference persists across sessions.",
    },
    {
      icon: Palette,
      title: "Differentiate Without Color Alone",
      supported: true,
      description:
        "Information is never conveyed by color alone. All status indicators, form validation states, interactive elements, and navigation cues use a combination of color, icons, text labels, and/or shape to communicate meaning. Error states include icon indicators and descriptive text. Active/selected states use borders, weight changes, or icons alongside color changes. Links are distinguishable by underline styling in addition to color.",
    },
    {
      icon: EyeOff,
      title: "Sufficient Contrast",
      supported: true,
      description:
        "All text and interactive elements meet WCAG 2.1 Level AA contrast requirements (4.5:1 for normal text, 3:1 for large text and UI components). A high-contrast mode toggle is available in the accessibility widget, applying maximum contrast colors for users who need additional visual distinction. The platform also responds to the prefers-contrast: high OS media query. Placeholder text meets the 3:1 minimum contrast ratio.",
    },
    {
      icon: Pause,
      title: "Reduced Motion",
      supported: true,
      description:
        "All animations and transitions respect the prefers-reduced-motion OS setting. When enabled, animation durations are reduced to near-zero, scroll behavior becomes instant, and decorative motion is eliminated. Users can also toggle reduced motion independently via the accessibility widget. No content relies solely on motion to convey information. Auto-playing animations and parallax effects are disabled.",
    },
    {
      icon: Subtitles,
      title: "Captions",
      supported: true,
      description:
        "Our custom video player includes full caption and subtitle support using WebVTT tracks. Users can toggle captions on/off with a dedicated button or keyboard shortcut (C key). Caption tracks support multiple languages. All pre-produced video content includes synchronized captions for dialogue and relevant sound effects. The player interface itself is fully accessible with keyboard shortcuts and screen reader support.",
    },
    {
      icon: AudioLines,
      title: "Audio Descriptions",
      supported: true,
      description:
        "Video content includes descriptive alt text and contextual information. Our video player supports audio description tracks for narrating visual content that is not conveyed through dialogue alone. All meaningful images throughout the platform include comprehensive alt text descriptions. Informational graphics and charts include text-based summaries of the data they present.",
    },
  ];

  const accessibilityWidgetFeatures = [
    {
      icon: Type,
      title: "Font Size Adjustment",
      description: "7 levels of text scaling from 75% to 150%, with persistent preferences.",
    },
    {
      icon: EyeOff,
      title: "High Contrast Mode",
      description: "Maximum contrast between text and backgrounds for improved readability.",
    },
    {
      icon: Palette,
      title: "Link Highlighting",
      description: "Underlines and outlines all links for improved discoverability.",
    },
    {
      icon: Keyboard,
      title: "Enhanced Focus Indicators",
      description: "Larger, more visible focus outlines on all interactive elements.",
    },
    {
      icon: Type,
      title: "Dyslexia-Friendly Font",
      description: "OpenDyslexic typeface with increased word spacing for easier reading.",
    },
    {
      icon: Settings,
      title: "Text Spacing",
      description: "Increased letter spacing, word spacing, and line height for readability.",
    },
    {
      icon: Pause,
      title: "Reduced Motion",
      description: "Disables all animations and transitions independent of OS settings.",
    },
    {
      icon: MonitorSmartphone,
      title: "Large Cursor",
      description: "Enlarged cursor for improved pointer visibility and tracking.",
    },
  ];

  const wcagPrinciples = [
    {
      title: "Perceivable",
      criteria: [
        "Text alternatives for all non-text content (1.1.1)",
        "Captions for prerecorded audio/video (1.2.2)",
        "Audio descriptions for prerecorded video (1.2.5)",
        "Content adapts to different presentations without losing information (1.3.1–1.3.5)",
        "Color is not the sole means of conveying information (1.4.1)",
        "Text contrast ratio of at least 4.5:1 (1.4.3)",
        "Text resizable up to 200% without loss of content (1.4.4)",
        "Content reflows at 320px width without horizontal scroll (1.4.10)",
        "Non-text contrast ratio of at least 3:1 for UI components (1.4.11)",
        "Text spacing adjustable without loss of content (1.4.12)",
      ],
    },
    {
      title: "Operable",
      criteria: [
        "All functionality available via keyboard (2.1.1)",
        "No keyboard traps (2.1.2)",
        "Adjustable timing for time-limited content (2.2.1)",
        "Content can be paused, stopped, or hidden (2.2.2)",
        "Skip navigation links to bypass repeated content (2.4.1)",
        "Descriptive page titles (2.4.2)",
        "Logical focus order (2.4.3)",
        "Descriptive link purpose from context (2.4.4)",
        "Multiple ways to find pages (2.4.5)",
        "Descriptive headings and labels (2.4.6)",
        "Visible focus indicators (2.4.7)",
        "Pointer gestures have single-pointer alternatives (2.5.1)",
        "Pointer cancellation supported (2.5.2)",
        "Accessible names match visible labels (2.5.3)",
        "Touch targets meet minimum 44x44 CSS pixel size (2.5.5)",
      ],
    },
    {
      title: "Understandable",
      criteria: [
        "Page language defined in HTML (3.1.1)",
        "Language of parts identified where different (3.1.2)",
        "Focus changes do not trigger unexpected context changes (3.2.1)",
        "Input changes do not trigger unexpected context changes (3.2.2)",
        "Consistent navigation across pages (3.2.3)",
        "Consistent component identification (3.2.4)",
        "Input error identification and description (3.3.1)",
        "Labels and instructions for user input (3.3.2)",
        "Error suggestions provided (3.3.3)",
        "Error prevention for legal/financial/data submissions (3.3.4)",
      ],
    },
    {
      title: "Robust",
      criteria: [
        "Valid HTML markup (4.1.1)",
        "Name, role, and value for all UI components (4.1.2)",
        "Status messages communicated to assistive technologies (4.1.3)",
      ],
    },
  ];

  const knownLimitations = [
    {
      issue: "Third-party embedded content",
      description:
        "Some embedded maps (Leaflet) and external widgets may not meet all accessibility requirements. We provide text-based alternatives where possible.",
      status: "working",
    },
    {
      issue: "PDF documents",
      description:
        "Some older PDF documents may not be fully accessible. Contact us for accessible alternatives in HTML or plain text format.",
      status: "working",
    },
    {
      issue: "User-generated content",
      description:
        "Content submitted by users (reviews, comments) may not always include proper alt text or accessibility features. We moderate and enhance where possible.",
      status: "monitoring",
    },
    {
      issue: "3D/WebGL content",
      description:
        "Interactive 3D elements using Three.js may not be fully accessible to screen readers. Text-based fallbacks are provided.",
      status: "working",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Accessibility Statement | Des Moines Insider"
        description="Des Moines Insider is committed to digital accessibility for people with disabilities. Learn about our WCAG 2.1 Level AA conformance, ADA compliance, Apple accessibility support, and accessibility features."
        url="https://desmoinesinsider.com/accessibility"
        type="website"
      />

      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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
            <h2
              id="commitment-heading"
              className="text-2xl font-semibold mt-8 mb-4 flex items-center gap-2"
            >
              <Accessibility className="h-6 w-6 text-primary" aria-hidden="true" />
              Our Commitment to Accessibility
            </h2>
            <p>
              Des Moines Insider is committed to ensuring digital accessibility for people
              with disabilities. We believe the internet should be available and accessible
              to anyone, regardless of circumstance and ability. We are continually
              improving the user experience for everyone by applying relevant accessibility
              standards across our website and mobile applications.
            </p>
            <p>
              Our goal is to meet or exceed the requirements of the{" "}
              <strong>Web Content Accessibility Guidelines (WCAG) {wcagVersion} Level {conformanceLevel}</strong>,
              the <strong>Americans with Disabilities Act (ADA)</strong>, and{" "}
              <strong>Apple's App Accessibility</strong> guidelines to provide an inclusive
              experience for all users.
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
                  <CheckCircle
                    className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-lg font-medium">
                      WCAG {wcagVersion} Level {conformanceLevel} Conformance
                    </p>
                    <p className="text-muted-foreground mt-1">
                      Des Moines Insider conforms to the Web Content Accessibility
                      Guidelines (WCAG) {wcagVersion} at Level {conformanceLevel}. These
                      guidelines explain how to make web content more accessible for people
                      with disabilities and user-friendly for everyone.
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
                className="text-primary underline inline-flex items-center gap-1"
              >
                Web Content Accessibility Guidelines (WCAG)
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">(opens in new tab)</span>
              </a>{" "}
              defines requirements for designers and developers to improve accessibility
              for people with disabilities. It defines three levels of conformance: Level
              A, Level AA, and Level AAA. Des Moines Insider is partially conformant with
              WCAG {wcagVersion} Level {conformanceLevel}, meaning most content fully
              conforms to the accessibility standard.
            </p>
          </section>

          {/* Apple App Accessibility Features */}
          <section className="mb-10" aria-labelledby="apple-a11y-heading">
            <h2
              id="apple-a11y-heading"
              className="text-2xl font-semibold mt-8 mb-4 flex items-center gap-2"
            >
              <Smartphone className="h-6 w-6 text-primary" aria-hidden="true" />
              App Accessibility Features
            </h2>
            <p className="mb-4">
              Our application supports the following accessibility features as defined by{" "}
              <a
                href="https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline inline-flex items-center gap-1"
              >
                Apple's Accessibility Nutrition Labels
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">(opens in new tab)</span>
              </a>
              . Users can complete all common tasks — including onboarding, navigation,
              search, browsing events and restaurants, changing settings, and accessing
              help — using each supported feature.
            </p>

            <div className="space-y-4 not-prose">
              {appleAccessibilityFeatures.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Card key={index}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
                        <span>{feature.title}</span>
                        {feature.supported && (
                          <CheckCircle
                            className="h-4 w-4 text-green-600 dark:text-green-400 ml-auto flex-shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Accessibility Widget */}
          <section className="mb-10" aria-labelledby="widget-heading">
            <h2
              id="widget-heading"
              className="text-2xl font-semibold mt-8 mb-4 flex items-center gap-2"
            >
              <Settings className="h-6 w-6 text-primary" aria-hidden="true" />
              Accessibility Widget
            </h2>
            <p className="mb-4">
              Des Moines Insider includes a built-in accessibility widget available on
              every page. Look for the accessibility button in the corner of the screen.
              The widget allows you to customize your experience with the following
              controls:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 not-prose">
              {accessibilityWidgetFeatures.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Card key={index} className="border-muted">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3">
                        <Icon
                          className="h-4 w-4 text-primary flex-shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="font-medium text-sm">{feature.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              All preferences are saved locally and persist across sessions. You can reset
              all settings to defaults at any time using the Reset button in the widget.
            </p>
          </section>

          {/* WCAG 2.1 Level AA Compliance Detail */}
          <section className="mb-10" aria-labelledby="wcag-heading">
            <h2
              id="wcag-heading"
              className="text-2xl font-semibold mt-8 mb-4 flex items-center gap-2"
            >
              <CheckCircle className="h-6 w-6 text-primary" aria-hidden="true" />
              WCAG {wcagVersion} Level {conformanceLevel} Compliance
            </h2>
            <p className="mb-6">
              WCAG {wcagVersion} is organized around four principles. Below is a summary
              of the specific success criteria we address under each principle:
            </p>
            <div className="space-y-6 not-prose">
              {wcagPrinciples.map((principle, index) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      {index + 1}. {principle.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {principle.criteria.map((criterion, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle
                            className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <span>{criterion}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ADA Compliance */}
          <section className="mb-10" aria-labelledby="ada-heading">
            <h2
              id="ada-heading"
              className="text-2xl font-semibold mt-8 mb-4 flex items-center gap-2"
            >
              <Scale className="h-6 w-6 text-primary" aria-hidden="true" />
              ADA Compliance
            </h2>
            <p>
              Des Moines Insider is committed to compliance with the{" "}
              <strong>Americans with Disabilities Act (ADA)</strong>. Title III of the ADA
              requires that places of public accommodation, including websites and mobile
              applications, be accessible to individuals with disabilities.
            </p>
            <p>Our ADA compliance efforts include:</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>
                <strong>Equal access:</strong> All users, including those with visual,
                auditory, motor, and cognitive disabilities, can access the full
                functionality of our platform
              </li>
              <li>
                <strong>Effective communication:</strong> Information is presented in
                formats accessible to people with different disabilities, including screen
                reader-compatible content, captions, and text alternatives
              </li>
              <li>
                <strong>Reasonable modifications:</strong> We provide accessible
                alternatives for any content that cannot be made fully accessible and
                respond to accommodation requests within 5 business days
              </li>
              <li>
                <strong>Ongoing evaluation:</strong> Regular automated and manual
                accessibility audits to identify and remediate barriers
              </li>
              <li>
                <strong>Staff training:</strong> Our development team is trained in
                accessible design and development best practices
              </li>
            </ul>
          </section>

          {/* Legal and Regulatory */}
          <section className="mb-10" aria-labelledby="legal-heading">
            <h2
              id="legal-heading"
              className="text-2xl font-semibold mt-8 mb-4 flex items-center gap-2"
            >
              <Shield className="h-6 w-6 text-primary" aria-hidden="true" />
              Legal and Regulatory Compliance
            </h2>
            <p>
              Des Moines Insider strives to comply with all applicable accessibility laws
              and regulations, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>
                <strong>Americans with Disabilities Act (ADA):</strong> Title III requires
                places of public accommodation, including websites and apps, to be
                accessible to individuals with disabilities
              </li>
              <li>
                <strong>Section 508 of the Rehabilitation Act:</strong> Requires federal
                agencies to make electronic and information technology accessible; we
                voluntarily conform to these standards
              </li>
              <li>
                <strong>WCAG 2.1 Level AA:</strong> The internationally recognized web
                accessibility standard that forms the basis of our accessibility efforts
              </li>
              <li>
                <strong>Iowa Civil Rights Act (Chapter 216):</strong> Iowa state law
                prohibiting discrimination on the basis of disability in places of public
                accommodation
              </li>
              <li>
                <strong>European Accessibility Act (EAA):</strong> We aim to meet the
                accessibility requirements that apply to digital services accessible to
                European users
              </li>
              <li>
                <strong>Apple App Store Accessibility Guidelines:</strong> Our mobile
                application meets Apple's accessibility nutrition label requirements for
                all supported features
              </li>
            </ul>
          </section>

          {/* Technical Specifications */}
          <section className="mb-10" aria-labelledby="technical-heading">
            <h2 id="technical-heading" className="text-2xl font-semibold mt-8 mb-4">
              Technical Specifications
            </h2>
            <p>
              Accessibility of Des Moines Insider relies on the following technologies to
              work with your combination of web browser and assistive technologies:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>HTML5 with semantic elements and proper document structure</li>
              <li>WAI-ARIA 1.2 (Web Accessibility Initiative - Accessible Rich Internet Applications)</li>
              <li>CSS with prefers-reduced-motion, prefers-color-scheme, and prefers-contrast media queries</li>
              <li>JavaScript with progressive enhancement</li>
              <li>SVG with accessible titles and descriptions</li>
            </ul>
          </section>

          {/* Browser & Assistive Technology Support */}
          <section className="mb-10" aria-labelledby="browser-heading">
            <h2 id="browser-heading" className="text-2xl font-semibold mt-8 mb-4">
              Browser and Assistive Technology Support
            </h2>
            <p>
              Des Moines Insider is designed to be compatible with the following assistive
              technologies:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Screen readers: VoiceOver (iOS/macOS), NVDA, JAWS, TalkBack (Android)</li>
              <li>Voice control: iOS Voice Control, macOS Voice Control, Windows Speech Recognition</li>
              <li>Screen magnification: ZoomText, system-level zoom</li>
              <li>Switch control and alternative input devices</li>
              <li>Keyboard-only navigation</li>
              <li>Braille displays (via screen reader support)</li>
            </ul>
            <p className="mt-4">
              The site is tested for compatibility with the following browsers:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Google Chrome (latest two versions)</li>
              <li>Mozilla Firefox (latest two versions)</li>
              <li>Apple Safari (latest two versions, including iOS Safari)</li>
              <li>Microsoft Edge (latest two versions)</li>
            </ul>
          </section>

          {/* Keyboard Shortcuts */}
          <section className="mb-10" aria-labelledby="shortcuts-heading">
            <h2 id="shortcuts-heading" className="text-2xl font-semibold mt-8 mb-4">
              Keyboard Shortcuts
            </h2>
            <p>
              Des Moines Insider supports the following keyboard shortcuts for improved
              navigation:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse">
                <caption className="sr-only">
                  Keyboard shortcuts available on this website
                </caption>
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="text-left py-2 pr-4 font-semibold">
                      Shortcut
                    </th>
                    <th scope="col" className="text-left py-2 font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "Tab", action: "Move to next focusable element" },
                    { key: "Shift + Tab", action: "Move to previous focusable element" },
                    { key: "Enter / Space", action: "Activate button or link" },
                    { key: "Escape", action: "Close modal or dialog" },
                    { key: "?", action: "Open keyboard shortcuts help" },
                    { key: "/", action: "Focus search box (when not in a form)" },
                    { key: "Alt + H", action: "Go to home page" },
                    { key: "Alt + E", action: "Go to events page" },
                    { key: "Alt + R", action: "Go to restaurants page" },
                  ].map((shortcut, index) => (
                    <tr key={index} className="border-b">
                      <td className="py-2 pr-4">
                        {shortcut.key.split(" / ").map((k, i) => (
                          <span key={i}>
                            {i > 0 && " / "}
                            {k.split(" then ").map((part, j) => (
                              <span key={j}>
                                {j > 0 && " then "}
                                {part.split(" + ").map((p, l) => (
                                  <span key={l}>
                                    {l > 0 && " + "}
                                    <kbd className="px-2 py-1 bg-muted rounded text-sm">
                                      {p.trim()}
                                    </kbd>
                                  </span>
                                ))}
                              </span>
                            ))}
                          </span>
                        ))}
                      </td>
                      <td className="py-2">{shortcut.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Video player keyboard shortcuts: <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Space</kbd> or{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">K</kbd> play/pause,{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">M</kbd> mute,{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">F</kbd> fullscreen,{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">C</kbd> captions,{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Arrow keys</kbd> skip/volume.
            </p>
          </section>

          {/* Known Limitations */}
          <section className="mb-10" aria-labelledby="limitations-heading">
            <h2 id="limitations-heading" className="text-2xl font-semibold mt-8 mb-4">
              Known Limitations
            </h2>
            <p>
              Despite our best efforts to ensure accessibility, there may be some
              limitations. Below is a description of known limitations and potential
              solutions. Please contact us if you observe an issue not listed below.
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
                          Status:{" "}
                          {limitation.status === "working"
                            ? "Actively working on fix"
                            : "Monitoring"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
                <strong>Automated testing:</strong> Continuous integration pipeline with
                axe-core and Playwright accessibility test suites covering WCAG 2.1 AA
                criteria
              </li>
              <li>
                <strong>Manual testing:</strong> Regular manual testing with keyboard-only
                navigation, screen readers (VoiceOver, NVDA), and voice control
              </li>
              <li>
                <strong>User testing:</strong> Feedback collection from users with
                disabilities to identify and address real-world accessibility barriers
              </li>
              <li>
                <strong>Design review:</strong> Color contrast analysis, touch target
                verification, and responsive layout testing across devices
              </li>
              <li>
                <strong>Code review:</strong> All pull requests include accessibility
                checks for proper ARIA usage, semantic HTML, and keyboard support
              </li>
            </ul>
          </section>

          {/* Feedback */}
          <section className="mb-10" aria-labelledby="feedback-heading">
            <h2 id="feedback-heading" className="text-2xl font-semibold mt-8 mb-4">
              Feedback and Contact Information
            </h2>
            <p>
              We welcome your feedback on the accessibility of Des Moines Insider. Please
              let us know if you encounter accessibility barriers:
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
                        className="text-primary underline"
                      >
                        accessibility@desmoinesinsider.com
                      </a>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      We aim to respond to accessibility feedback within{" "}
                      <strong>5 business days</strong>. Please include the following
                      information in your message:
                    </p>
                    <ul className="text-sm text-muted-foreground mt-2 list-disc pl-5 space-y-1">
                      <li>The web page (URL) where you encountered the issue</li>
                      <li>A description of the accessibility barrier</li>
                      <li>The assistive technology and browser you are using</li>
                      <li>Your preferred method of contact</li>
                    </ul>
                  </div>
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      If you need immediate assistance or an accessible alternative to any
                      content on our platform, please contact us and we will provide the
                      information in an accessible format within 3 business days.
                    </p>
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

          {/* Related Links */}
          <section className="mt-12 pt-8 border-t">
            <p className="text-sm text-muted-foreground">
              For more information about our policies, please review our{" "}
              <Link to="/privacy-policy" className="text-primary underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link to="/terms" className="text-primary underline">
                Terms of Service
              </Link>.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Learn more about web accessibility from the{" "}
              <a
                href="https://www.w3.org/WAI/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline inline-flex items-center gap-1"
              >
                W3C Web Accessibility Initiative (WAI)
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">(opens in new tab)</span>
              </a>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Learn more about Apple's accessibility features at{" "}
              <a
                href="https://www.apple.com/accessibility/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline inline-flex items-center gap-1"
              >
                Apple Accessibility
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">(opens in new tab)</span>
              </a>
            </p>
          </section>
        </article>
      </div>

      <Footer />
      <BackToTop />
    </div>
  );
}
