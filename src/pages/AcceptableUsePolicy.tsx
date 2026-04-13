import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AcceptableUsePolicy() {
  useDocumentTitle("Acceptable Use Policy");

  return (
    <>
      <Helmet>
        <title>Acceptable Use Policy | Des Moines Insider</title>
        <meta
          name="description"
          content="Rules for using Des Moines Insider. What's prohibited, how we enforce these rules, and how to report abuse."
        />
      </Helmet>

      <div className="min-h-screen bg-background pb-24">
        <div className="container mx-auto px-4 py-12 max-w-3xl">
          <h1 className="text-3xl font-bold mb-8">Acceptable Use Policy</h1>

          <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
            <p className="text-base">
              <strong className="text-foreground">Last updated:</strong> April 13, 2026
            </p>

            <p>
              This Acceptable Use Policy (&quot;AUP&quot;) sets out what is — and is
              not — allowed when using Des Moines Insider. It applies to every user
              of our website, mobile apps, APIs, and any other service we offer
              (collectively, the &quot;Services&quot;), and is incorporated into our{" "}
              <Link to="/terms" className="text-primary underline">
                Terms of Service
              </Link>
              .
            </p>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                1. Prohibited content
              </h2>
              <p>You may not upload, post, submit, or share content that:</p>
              <ul className="list-disc ml-6 space-y-2">
                <li>
                  Is illegal, defamatory, threatening, harassing, hateful, or
                  incites violence or discrimination against individuals or groups;
                </li>
                <li>
                  Sexually exploits or endangers minors, or depicts non-consensual
                  sexual content of any kind;
                </li>
                <li>
                  Infringes a third party&apos;s copyright, trademark, publicity,
                  privacy, or other intellectual-property rights;
                </li>
                <li>
                  Contains malware, viruses, worms, or any code designed to damage,
                  disrupt, or gain unauthorized access to systems;
                </li>
                <li>
                  Is false or misleading in a way that could cause financial,
                  physical, or emotional harm (including fake reviews, fake events,
                  or impersonation of real businesses);
                </li>
                <li>
                  Is unsolicited commercial content (spam), pyramid schemes, or
                  deceptive marketing, or violates the CAN-SPAM Act or TCPA;
                </li>
                <li>
                  Promotes illegal drug sales, illegal firearms transactions, or
                  other activity prohibited by federal, state, or local law.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                2. Prohibited conduct
              </h2>
              <p>You may not:</p>
              <ul className="list-disc ml-6 space-y-2">
                <li>
                  Attempt to gain unauthorized access to any part of the Services,
                  other users&apos; accounts, or our infrastructure;
                </li>
                <li>
                  Probe, scan, or test the vulnerability of the Services without
                  prior written permission;
                </li>
                <li>
                  Interfere with or disrupt the Services, including through denial
                  of service (DoS/DDoS) attacks, mail bombs, or flooding;
                </li>
                <li>
                  Use automated tools (bots, scrapers, crawlers) to collect data from
                  the Services except as explicitly permitted by our robots.txt or a
                  written agreement;
                </li>
                <li>
                  Circumvent, disable, or otherwise interfere with security-related
                  features of the Services, including rate limits or access
                  controls;
                </li>
                <li>
                  Reverse engineer or attempt to extract source code from the
                  Services, except where that right cannot be waived by law;
                </li>
                <li>
                  Resell, sublicense, or white-label the Services without our
                  written permission;
                </li>
                <li>
                  Use the Services to train machine-learning models, fine-tune
                  large language models, or build a competing product, except as
                  expressly allowed in a separate written agreement;
                </li>
                <li>
                  Misrepresent your identity or affiliation with any person or
                  organization;
                </li>
                <li>
                  Use the Services in a way that violates any applicable law or
                  regulation, including export controls and sanctions.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                3. Business listings and reviews
              </h2>
              <p>
                If you submit an event, review, photo, or business information, you
                confirm that: (a) you have the right to share it; (b) it is truthful
                and your genuine experience (for reviews); and (c) it does not
                violate the rights of any third party. We may remove content that
                appears to be incentivized without proper disclosure, astroturfed,
                or otherwise inconsistent with FTC endorsement guidelines.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                4. AI features
              </h2>
              <p>
                Our AI-assisted features (for example, the Trip Planner and event
                summaries) generate suggestions and content based on public data and
                your inputs. You may not use these features to generate content that
                violates this AUP, that impersonates a real person without their
                consent, or that is intended to deceive consumers. AI output is
                provided as-is and should be verified before you rely on it for
                important decisions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                5. Reporting violations
              </h2>
              <p>
                If you see content or behavior that violates this AUP, please
                report it to{" "}
                <a
                  href="mailto:abuse@desmoinesinsider.com"
                  className="text-primary underline"
                >
                  abuse@desmoinesinsider.com
                </a>
                . For copyright concerns specifically, see our{" "}
                <Link to="/dmca" className="text-primary underline">
                  DMCA Policy
                </Link>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                6. Enforcement
              </h2>
              <p>
                We may investigate suspected violations and take any action we
                reasonably believe is appropriate, including removing content,
                throttling or suspending accounts, terminating accounts for repeat
                or severe violations, and cooperating with law enforcement. We are
                not obligated to monitor content but may do so at our discretion.
                Our enforcement decisions are made in good faith and without
                guarantee of consistency across similar situations.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                7. Changes
              </h2>
              <p>
                We may update this AUP to address new abuse patterns or legal
                requirements. Material changes will be announced on the site and
                will apply to use of the Services going forward.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
