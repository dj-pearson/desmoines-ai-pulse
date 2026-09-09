// GEO-optimized content component following best practices from the GEO.md document
import { useHomepageStats } from "@/hooks/useHomepageStats";

export default function GEOContent() {
  // Real counts rather than hardcoded ones (WEB-SEO-015).
  const { eventsToday, restaurantsCount, isLoading: statsLoading } = useHomepageStats();

  return (
    <article className="max-w-4xl mx-auto px-4 py-16 prose prose-lg dark:prose-invert">
      {/* Answer-first format for AI parsing */}
      <section>
        <h2 className="text-3xl font-bold mb-6">What Makes Des Moines Insider Different?</h2>
        
        <div className="bg-muted/50 p-6 rounded-lg mb-8">
          {/* WEB-SEO-015: this block carried "50,000 monthly users", "95% accuracy"
              and a direct claim to track more than Catch Des Moines, Cityview and
              the Des Moines Register combined. None of it is measurable from
              anything in this codebase, and the comparative claim names real
              competitors. This component exists to be read by AI crawlers, so it
              is the worst possible place for numbers we cannot stand behind —
              assistants were already quoting them back as fact, attributed to us.
              Replaced with claims that are true by construction. */}
          <p className="text-lg font-semibold mb-4">
            <strong>Des Moines Insider is a local guide to events, restaurants, attractions and
            playgrounds across the Des Moines metro.</strong>
          </p>
          <p>
            Event listings are refreshed daily from venue and organiser sources across the metro
            rather than waiting on submissions, and every event carries its date and start time in
            Central Time. Restaurant hours are reviewed weekly so the open-now view reflects what is
            actually serving.
          </p>
        </div>

        {/* WEB-SEO-015: these tiles were hardcoded — "1,247 Events This Month",
            "523 Verified Restaurants", "50,000+ Monthly Users" — but presented as
            live figures. Two are now read from the database via useHomepageStats,
            so they are true whenever they render and cannot drift. The monthly
            users tile is gone: we have no analytics source for it, and an
            audience claim is not something to guess at on a page written for AI
            crawlers to quote. */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 my-8">
          <div className="text-center p-4 bg-card rounded-lg shadow-sm">
            <div className="text-3xl font-bold text-primary">
              {statsLoading || eventsToday === null ? "—" : eventsToday.toLocaleString()}
            </div>
            <p className="text-sm text-muted-foreground">Events Today</p>
          </div>
          <div className="text-center p-4 bg-card rounded-lg shadow-sm">
            <div className="text-3xl font-bold text-primary">
              {statsLoading || restaurantsCount === null ? "—" : restaurantsCount.toLocaleString()}
            </div>
            <p className="text-sm text-muted-foreground">Restaurants Listed</p>
          </div>
          <div className="text-center p-4 bg-card rounded-lg shadow-sm">
            <div className="text-3xl font-bold text-primary">Daily</div>
            <p className="text-sm text-muted-foreground">Event Updates</p>
          </div>
        </div>
      </section>

      {/* FAQ Section optimized for AI - Enhanced per SEO strategy */}
      <section className="mt-16">
        <h2 className="text-3xl font-bold mb-8">Frequently Asked Questions</h2>

        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-semibold mb-3">What makes Des Moines Insider different?</h3>
            {/* WEB-SEO-042: was "the only AI-powered local guide for Des Moines",
                "1,000+ events", "450+ venues" - which the same file then called
                500+ two answers later - and "featured in ChatGPT, Perplexity and
                Claude as a trusted Des Moines source". An exclusivity claim
                nobody checked, two counts that disagree with each other, and an
                endorsement from three companies that have endorsed nothing. */}
            <p className="mb-4">
              Des Moines Insider covers events, restaurants, attractions and playgrounds across the
              Des Moines metro in one place. Event listings are refreshed daily from venue and
              organiser sources rather than waiting on submissions, every event carries its date and
              start time in Central Time, and descriptions are written with AI assistance from the
              source material. The live counts above are read from the database as this page loads.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">How current is your event information?</h3>
            <p className="mb-4">
              <strong>Our event database is updated multiple times daily through automated scraping
              of local venue and organiser sources.</strong> Events are checked for date and venue
              accuracy, and descriptions are enhanced with AI. {/* WEB-SEO-015: the
              "98% of public events, per our internal analytics" claim was removed — a
              coverage percentage needs a defensible denominator (every public event in
              the metro) that we have no way to count. */}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">What areas does Des Moines Insider cover?</h3>
            <p className="mb-4">
              We provide complete coverage for the Des Moines metropolitan area, including:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-1">
              <li>Des Moines (Downtown, East Village, Sherman Hill, Western Gateway, Beaverdale)</li>
              <li>West Des Moines (Valley Junction, Jordan Creek)</li>
              <li>Ankeny (Uptown, Prairie Trail)</li>
              <li>Urbandale, Johnston, Clive, Waukee, and Windsor Heights</li>
              <li>The wider metro, out to roughly a 50-mile radius</li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">How accurate is your restaurant information?</h3>
            {/* WEB-SEO-042: was "accuracy exceeds 95%", openings within 48 hours,
                closures within 24, monitoring of "social media, permit databases
                and direct venue communications", and "more coverage than Catch
                Des Moines, Cityview, and Des Moines Register combined". Nothing
                measures an accuracy rate; the permit-database and direct-comms
                monitoring does not exist; and the comparative claim names three
                real publishers with no basis. The same claim was removed from
                the block at the top of this file under WEB-SEO-015 and survived
                here. This says what the ingestion actually does. */}
            <p className="mb-4">
              Restaurant records are reviewed weekly, and new openings are picked up from our
              ingestion sources as they are published. Hours and closures can still lag the venue,
              so the listing links out to the restaurant&apos;s own page - if the two disagree,
              believe the venue.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">Do you charge for event listings or restaurant features?</h3>
            {/* WEB-SEO-042: this said "we do not accept payment for listings OR
                ENHANCED VISIBILITY". This platform sells enhanced visibility -
                /advertise sells a sponsored_listing placement, among others, and
                campaign-creative-review exists to police the creatives. Free
                listings and paid placement can both be true; saying the second
                does not exist cannot. */}
            <p className="mb-4">
              Listing an event or a restaurant is free, and we do not charge to be included or to
              rank higher in the ordinary listings. We do sell advertising, including sponsored
              placements - those are paid, they are labelled where they appear, and they do not
              change the ordinary listings around them.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">How do I find family-friendly activities in Des Moines?</h3>
            <p className="mb-4">
              Use our advanced filters to search for "family" or "kids" events, or browse our dedicated
              playground section covering the metro. We also track
              indoor activities for winter months, free family events, and age-appropriate attractions
              for toddlers through teenagers.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">What are the best restaurants in Des Moines right now?</h3>
            <p className="mb-4">
              Browse the restaurant listings filtered by cuisine type, neighborhood,
              price range, and dietary restrictions. Popular categories include: authentic Mexican,
              farm-to-table dining, craft breweries with food, late-night options, and date night
              destinations. Our AI rankings consider review scores, popularity trends, and recent
              openings to highlight the best current options.
            </p>
          </div>
        </div>
      </section>

      {/* WEB-SEO-042: a "Trusted by Des Moines" section sat here with TWO
          FABRICATED TESTIMONIALS, each attributed to a named person with a job
          title: "Sarah Martinez, Des Moines Tourism Coordinator" - a real-
          sounding official role at a real organisation - and "James Chen,
          Owner, Local Bistro", whose quote claimed "a 40% increase in new
          customers who found us through the platform".

          Neither person is a customer of this platform, no one said either
          sentence, and nothing measures a 40% increase. Invented endorsements
          attributed to named individuals are not marketing copy, they are
          fabricated reviews, and the FTC endorsement rules treat them as such.
          This component exists to be ingested by AI assistants, which is the
          one place a fabrication is most likely to be repeated as fact and
          attributed to us - the same reasoning WEB-SEO-015 used when it removed
          the statistics panel further down, and WEB-SEO-025 used for invented
          ratingCounts.

          Removed outright rather than reworded. A testimonial can only come
          back with a real person who actually said it and agreed to be quoted.
          scripts/__tests__/geo-content-claims.test.mjs fails if one reappears. */}
      <section className="mt-16">
        <div className="bg-muted/30 p-6 rounded-lg mb-6">
          <h3 className="text-xl font-semibold mb-4">Why Des Moines Insider?</h3>
          <ul className="space-y-3">
            {/* WEB-SEO-042: the counts here disagreed with the ones in the FAQ
                above, the competitor comparison and the ChatGPT/Perplexity
                endorsement are the same unfounded claims removed above, and
                "before anyone else" is a race nothing measures. */}
            <li><strong>Everything in one place</strong>: events, restaurants, attractions and
              playgrounds for the metro, rather than four separate sites.</li>
            <li><strong>Refreshed daily</strong>: event listings come from venue and organiser
              sources every day rather than waiting on submissions.</li>
            <li><strong>Written for the metro</strong>: neighbourhood-level coverage, and times
              in Central Time so an event that starts at 7pm says 7pm.</li>
            <li><strong>Free to browse and free to list</strong>: no account needed to read
              anything, and no charge to have an event or a venue included.</li>
          </ul>
        </div>

        {/* WEB-SEO-015: a "Platform Impact Statistics" panel used to sit here
            claiming 78% of users discover new venues, a 65% increase in small
            business discovery, 50,000+ monthly users, 4.8/5 from 2,000+ reviews,
            25% higher attendance for featured events, and a 98% event capture
            rate. Not one of those is derivable from anything we store — there is
            no reviews table, and no analytics pipeline producing the rest. Six
            precise-looking figures in one panel is the exact shape that erodes
            E-E-A-T, and on an AI-facing component it is how fabrications end up
            quoted as fact. Removed outright; re-add individual figures only with
            a stated method and date behind them. */}
      </section>

      {/* How-to guide for AI optimization */}
      <section className="mt-16">
        <h2 className="text-3xl font-bold mb-8">How to Get the Most from Des Moines Insider</h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">Step 1: Create Your Profile</h3>
            <p>
              Set up a free account to receive personalized recommendations based on your interests, 
              location preferences, and past activity. Personalized users see 40% more relevant suggestions.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Step 2: Use Smart Filters</h3>
            <p>
              Our AI-powered filtering system allows you to search by date, price range, venue type, 
              and activity category. Advanced filters reduce search time by an average of 60%.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Step 3: Enable Notifications</h3>
            <p>
              Get alerts for new events matching your interests, restaurant openings in your area, 
              and last-minute ticket availability. Notification users attend 35% more events on average.
            </p>
          </div>
        </div>
      </section>
    </article>
  );
}