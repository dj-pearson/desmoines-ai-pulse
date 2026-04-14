import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

/**
 * DPA / B2B contract reference page.
 *
 * Customers with GDPR, CCPA, or other data-protection obligations frequently
 * ask for a signed Data Processing Agreement before going live. Rather than
 * negotiating from scratch each time, we publish our standard DPA terms here
 * so procurement teams can review them and we can execute on request.
 *
 * This page is not itself a signed contract. It's an offer to contract on the
 * published terms when a customer countersigns by email. "Real" B2B legal
 * review is still recommended for enterprise deals.
 */
export default function DataProcessingAgreement() {
  useDocumentTitle("Data Processing Agreement");

  return (
    <>
      <Helmet>
        <title>Data Processing Agreement | Des Moines Insider</title>
        <meta
          name="description"
          content="Des Moines Insider's standard Data Processing Agreement (DPA) for business customers with GDPR, CCPA, or similar data-protection obligations."
        />
      </Helmet>

      <div className="min-h-screen bg-background pb-24">
        <div className="container mx-auto px-4 py-12 max-w-3xl">
          <h1 className="text-3xl font-bold mb-2">Data Processing Agreement</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Standard DPA offered to business and enterprise customers.
          </p>

          <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
            <p className="text-base">
              <strong className="text-foreground">Last updated:</strong> April 13, 2026
            </p>

            <section className="rounded-lg border bg-muted/30 p-4">
              <h2 className="text-lg font-semibold text-foreground mt-0 mb-2">
                How to execute
              </h2>
              <p className="m-0 mb-3">
                This page sets out our standard DPA terms. If your organization
                needs a countersigned version, email{" "}
                <a
                  href="mailto:legal@desmoinesinsider.com"
                  className="text-primary underline"
                >
                  legal@desmoinesinsider.com
                </a>{" "}
                with your legal entity name, billing address, the
                Des Moines Insider account email, and any modifications your
                procurement team requires. We will return a PDF for signature
                through DocuSign within 5 business days.
              </p>
              <Button asChild>
                <a href="mailto:legal@desmoinesinsider.com?subject=DPA%20request">
                  <Mail className="h-4 w-4 mr-2" />
                  Request countersigned DPA
                </a>
              </Button>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                1. Definitions
              </h2>
              <p>
                Capitalized terms used here have the meaning given in our{" "}
                <Link to="/terms" className="text-primary underline">
                  Terms of Service
                </Link>{" "}
                unless redefined below. &quot;Applicable Data Protection
                Laws&quot; means all laws governing the processing of personal
                data that apply to Customer as controller, including without
                limitation the EU GDPR, UK GDPR, CCPA/CPRA, and other US state
                privacy statutes listed in the schedule at the bottom of this
                page. &quot;Personal Data,&quot; &quot;Processing,&quot;
                &quot;Controller,&quot; &quot;Processor,&quot; &quot;Data
                Subject,&quot; and &quot;Sub-processor&quot; have the meaning
                given in the GDPR (or their functional equivalents under other
                Applicable Data Protection Laws).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                2. Roles and scope
              </h2>
              <p>
                For Personal Data processed under the Services, Customer is the
                Controller and Des Moines Insider is the Processor (or
                &quot;Service Provider&quot; under the CCPA/CPRA). Customer
                instructs Des Moines Insider to process Personal Data solely to
                provide, secure, support, and improve the Services in
                accordance with this DPA and the Terms of Service. Each party
                will comply with the Applicable Data Protection Laws that
                apply to it.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                3. Processing details (Annex I equivalent)
              </h2>
              <ul className="list-disc ml-6 space-y-1">
                <li>
                  <strong>Subject matter:</strong> Provision of the Services
                  described in the Terms of Service.
                </li>
                <li>
                  <strong>Duration:</strong> For as long as Customer has an
                  active account, plus the retention periods described in our{" "}
                  <Link to="/privacy-policy" className="text-primary underline">
                    Privacy Policy
                  </Link>
                  .
                </li>
                <li>
                  <strong>Nature and purpose:</strong> Hosting, storage,
                  display, analytics, customer support, billing, fraud
                  prevention, and AI-assisted personalization enabled by
                  Customer.
                </li>
                <li>
                  <strong>Types of Personal Data:</strong> Account profile data
                  (name, email, phone), user preferences, interaction events,
                  payment metadata (no PAN), and IP/device logs. No special
                  category data is intentionally collected.
                </li>
                <li>
                  <strong>Categories of Data Subjects:</strong> Customer&apos;s
                  authorized end users and Customer personnel.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                4. Confidentiality and security (Annex II equivalent)
              </h2>
              <p>
                Des Moines Insider maintains a written information security
                program that includes technical and organizational measures
                designed to meet GDPR Art. 32 and CCPA §1798.100(e),
                including: encryption in transit (TLS 1.2+) and at rest,
                role-based access controls with principle of least privilege,
                multi-factor authentication for staff with production access,
                centralized audit logging, vulnerability scanning, secrets
                rotation, documented incident-response playbooks, and annual
                security training for personnel. Staff are bound by written
                confidentiality obligations that survive termination.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                5. Sub-processors (Annex III equivalent)
              </h2>
              <p>
                Customer authorizes Des Moines Insider to engage sub-processors
                subject to the terms of this DPA. We will flow down equivalent
                data-protection obligations to each sub-processor and remain
                responsible for their acts and omissions. Current
                sub-processors:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Supabase (managed Postgres + Auth + Edge Functions)</li>
                <li>Cloudflare (CDN, DDoS protection, hosting)</li>
                <li>Stripe (payment processing)</li>
                <li>Resend (transactional email delivery)</li>
                <li>OpenAI / Anthropic (AI features, only when enabled)</li>
              </ul>
              <p>
                We will provide 30 days&apos; advance notice via the site
                and/or email before adding or replacing sub-processors.
                Customer may object on reasonable data-protection grounds; if
                we cannot accommodate a reasonable objection, Customer may
                terminate the affected Services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                6. International transfers
              </h2>
              <p>
                Where Des Moines Insider transfers Personal Data originating in
                the EEA, UK, or Switzerland to a country without an adequacy
                decision, the transfer will be governed by the EU Standard
                Contractual Clauses (Module 2 or 3 as applicable) and, for UK
                data, the UK International Data Transfer Addendum. The parties
                agree that those clauses are incorporated into this DPA by
                reference and will be deemed executed on the Effective Date.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                7. Data-subject rights assistance
              </h2>
              <p>
                Des Moines Insider will provide commercially reasonable
                assistance to Customer in responding to Data-Subject requests
                to exercise their access, rectification, erasure, restriction,
                portability, or objection rights. Customers may use the
                self-service export and deletion tools in the product, or
                contact{" "}
                <a
                  href="mailto:privacy@desmoinesinsider.com"
                  className="text-primary underline"
                >
                  privacy@desmoinesinsider.com
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                8. Personal-data breach notification
              </h2>
              <p>
                Des Moines Insider will notify Customer without undue delay,
                and in any event within 72 hours of becoming aware of a
                Personal-Data Breach affecting Customer&apos;s Personal Data.
                Notifications will include the information required by GDPR
                Art. 33(3) to the extent then known and will be updated as the
                investigation progresses.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                9. Audits
              </h2>
              <p>
                On reasonable written request, Des Moines Insider will make
                available to Customer the most recent summary of its security
                certifications (e.g., SOC 2 Type II report, once obtained) and
                reasonable additional information necessary to demonstrate
                compliance with this DPA. Customer may conduct one audit per
                year at Customer&apos;s expense, on reasonable advance notice,
                subject to mutually acceptable confidentiality terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                10. Return or deletion
              </h2>
              <p>
                On termination of the Services, Des Moines Insider will
                return or delete all Customer Personal Data within 90 days,
                except as required by law or legitimate business records
                (e.g., invoices for tax purposes).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                11. CCPA / CPRA addendum
              </h2>
              <p>
                With respect to Personal Information processed under
                California law, Des Moines Insider acts as a &quot;Service
                Provider&quot; and shall not: (a) sell or share Personal
                Information; (b) retain, use, or disclose Personal Information
                outside the direct business relationship between the parties
                or the permitted business purposes set out in §7 of the CCPA
                Regulations; or (c) combine Personal Information received from
                Customer with Personal Information received from any other
                source (except as permitted by law). Des Moines Insider
                certifies that it understands the restrictions in this
                section.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                12. General
              </h2>
              <p>
                This DPA supplements and forms part of the Terms of Service.
                If there is a conflict, this DPA controls with respect to
                data-protection matters. Governing law and jurisdiction are
                as set forth in the Terms of Service. Liability and
                indemnification are governed by the Terms; nothing in this
                DPA expands the liability of either party.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                Schedule A — Applicable Data Protection Laws
              </h2>
              <p>
                GDPR (EU 2016/679), UK GDPR &amp; Data Protection Act 2018,
                Swiss FADP, California Consumer Privacy Act (as amended by
                CPRA), Colorado Privacy Act, Connecticut Data Privacy Act,
                Virginia Consumer Data Protection Act, Utah Consumer Privacy
                Act, Texas Data Privacy and Security Act, Oregon Consumer
                Privacy Act, Montana Consumer Data Privacy Act, Delaware
                Personal Data Privacy Act, Iowa Consumer Data Protection Act,
                New Hampshire Privacy Act, Tennessee Information Protection
                Act, Canada PIPEDA &amp; Quebec Law 25, Australia Privacy Act,
                Singapore PDPA, Brazil LGPD, New Zealand Privacy Act.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
