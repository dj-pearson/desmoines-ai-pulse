import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function DMCAPolicy() {
  useDocumentTitle("DMCA / Copyright Policy");

  return (
    <>
      <Helmet>
        <title>DMCA / Copyright Policy | Des Moines Insider</title>
        <meta
          name="description"
          content="How to submit a DMCA takedown notice or counter-notice to Des Moines Insider, and how we handle copyright infringement claims."
        />
      </Helmet>

      <div className="min-h-screen bg-background pb-24">
        <div className="container mx-auto px-4 py-12 max-w-3xl">
          <h1 className="text-3xl font-bold mb-8">DMCA / Copyright Policy</h1>

          <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
            <p className="text-base">
              <strong className="text-foreground">Last updated:</strong> April 13, 2026
            </p>

            <section>
              <p>
                Des Moines Insider (&quot;we,&quot; &quot;us&quot;) respects the
                intellectual property rights of others and expects our users to do
                the same. In accordance with the Digital Millennium Copyright Act of
                1998 (&quot;DMCA&quot;), 17 U.S.C. § 512, we respond to notices of
                alleged copyright infringement that comply with the law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                1. Reporting alleged infringement (takedown notice)
              </h2>
              <p>
                If you believe that content on Des Moines Insider infringes your
                copyright, please send a written notice to our Designated Copyright
                Agent that includes all of the following (17 U.S.C. § 512(c)(3)):
              </p>
              <ol className="list-decimal ml-6 space-y-2">
                <li>
                  A physical or electronic signature of the owner (or a person
                  authorized to act on behalf of the owner) of the exclusive right
                  that is allegedly infringed;
                </li>
                <li>
                  Identification of the copyrighted work claimed to have been
                  infringed (or, if multiple works, a representative list);
                </li>
                <li>
                  Identification of the material that is claimed to be infringing,
                  including its URL or a description sufficient to let us locate it;
                </li>
                <li>
                  Your contact information (name, mailing address, telephone number,
                  and email);
                </li>
                <li>
                  A statement that you have a good-faith belief that the use is not
                  authorized by the copyright owner, its agent, or the law; and
                </li>
                <li>
                  A statement, under penalty of perjury, that the information in the
                  notification is accurate and that you are authorized to act on
                  behalf of the owner.
                </li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                2. Designated Copyright Agent
              </h2>
              <p>
                Send takedown notices to our Designated Copyright Agent:
              </p>
              <address className="not-italic text-foreground">
                Copyright Agent, Des Moines Insider<br />
                Attn: DMCA Notices<br />
                Des Moines, Iowa, USA<br />
                Email:{" "}
                <a
                  href="mailto:dmca@desmoinesinsider.com"
                  className="text-primary underline"
                >
                  dmca@desmoinesinsider.com
                </a>
              </address>
              <p>
                We are in the process of registering our agent with the U.S.
                Copyright Office. Until registration is complete, email is the
                fastest way to reach us.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                3. Counter-notice procedure
              </h2>
              <p>
                If your content was removed or disabled and you believe it was done
                in error or misidentification, you may send a counter-notice
                including (17 U.S.C. § 512(g)(3)):
              </p>
              <ol className="list-decimal ml-6 space-y-2">
                <li>Your physical or electronic signature;</li>
                <li>
                  Identification of the material that was removed and its location
                  before removal;
                </li>
                <li>
                  A statement under penalty of perjury that you have a good-faith
                  belief the material was removed as a result of mistake or
                  misidentification; and
                </li>
                <li>
                  Your name, address, and phone number, and a statement that you
                  consent to the jurisdiction of the federal court for the judicial
                  district in which your address is located (or, if outside the
                  U.S., any judicial district in which Des Moines Insider may be
                  found), and that you will accept service of process from the
                  person who submitted the original notice.
                </li>
              </ol>
              <p>
                Upon receipt of a valid counter-notice, we will forward it to the
                original complainant and may restore the removed content in 10–14
                business days unless the complainant files a lawsuit seeking a court
                order.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                4. Repeat infringer policy
              </h2>
              <p>
                In appropriate circumstances and at our discretion, we will disable
                or terminate the accounts of users who are repeat infringers. We also
                reserve the right to remove any content that in our judgment is
                infringing, unlawful, or abusive.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                5. Misrepresentations
              </h2>
              <p>
                Under 17 U.S.C. § 512(f), any person who knowingly materially
                misrepresents that material is infringing, or that material was
                removed or disabled by mistake, may be liable for damages. Please
                think carefully before filing a notice or counter-notice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                6. Related policies
              </h2>
              <p>
                This policy supplements our{" "}
                <Link to="/terms" className="text-primary underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/acceptable-use" className="text-primary underline">
                  Acceptable Use Policy
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
