# Categories of Sources — draft for review (WEB-LEGAL-008)

**Status: DRAFT. Not published.** The story says to draft this and have it reviewed
alongside the other policy text rather than shipping unilaterally, because how much of
the ingestion pipeline to describe publicly is the owner's call. Nothing here has been
merged into `PrivacyPolicy.tsx`.

---

## 1. What the pipeline actually ingests (AC7)

AC7 asks for this first, "rather than describing an idealized version of it". Measured
against production on 2026-08-22. Counts only — no values were read out of the contact
columns.

| Table | Rows | Personal-data-bearing content |
|---|---|---|
| `events` | 1,246 | None. **All 1,246 carry a `source_url`**, so every event is traceable to the page it came from. There is **no `organizer` column** on this table. |
| `restaurants` | 480 | 430 business phone numbers. Name, address, hours, menu URL. |
| `attractions` | — | Name, website, image. No contact fields. |
| `known_venues` | 46 | 42 business phone numbers, **3 email addresses** |
| `prospect_leads` | **0** | Table exists; nothing has ever been written to it. |
| `competitors` | — | Business name and website URL only. |

**The three emails are all role addresses.** Checked by local-part against
`info / contact / hello / events / booking / admin / office / sales / support /
reservations / marketing`: 3 role addresses, 0 with a personal local-part.

### What this means for the disclosure

The story flags the right distinction — *sources of personal data* is the regulated
question, and most of what the crawlers ingest is business listing data, which is not
personal data. The measurement supports the narrow reading rather than the broad one:

- **No natural-person names are ingested.** The `organizer` column the story worried
  about does not exist on `events`.
- **No personal email addresses are ingested.** Three role addresses on 46 venues.
- **Business phone numbers are ingested at scale** (430 restaurants, 42 venues). Under
  GDPR a business phone number can be personal data where it identifies an individual —
  a sole trader's mobile, say — so this is the one crawled category that genuinely
  belongs in a sources disclosure.
- **The advertiser-prospect pipeline (AC4) has collected nothing.** `prospect_leads` is
  empty. A notice-at-collection is still worth writing *before* it fills, not after, but
  the disclosure should describe what the pipeline *would* collect rather than implying
  a CRM of business contacts exists today.

Writing a broad "we crawl third-party sites and collect personal information about you"
would overstate the collection by a wide margin and would be its own accuracy problem.

---

## 2. Proposed section (AC1, AC2, AC4)

To sit immediately after **Information We Collect** in `PrivacyPolicy.tsx`.

> ### Categories of Sources
>
> We collect information from the following categories of sources:
>
> **Directly from you.** Account details, preferences, saved items, reviews, event
> submissions, support messages and anything else you type into the site or the apps.
>
> **Automatically from your device.** Usage and device information as described in
> *Cookies and Tracking Technologies*, subject to your consent choices.
>
> **From publicly available sources on the web.** Our event, restaurant and attraction
> listings are assembled automatically from publicly accessible pages published by
> venues, restaurants, event organisers and destination-marketing sites. What we collect
> is business information — names, addresses, opening hours, ticket and menu links,
> event dates and descriptions, images, and publicly listed business phone numbers and
> role email addresses such as `info@` or `booking@`. Every listing records the page it
> came from. We do not collect personal contact details of individuals from these
> sources, we do not access anything behind a login or a paywall, and we do not fetch
> pages that a site's `robots.txt` tells crawlers not to fetch.
>
> **From service providers acting on our behalf.** Payment status from Stripe,
> deliverability data from our email provider, and authentication details from Google or
> Apple if you sign in with them. See *Data Sharing and Disclosure* for the full list.
>
> **From business records we build ourselves.** If you represent a business we may hold
> a business contact record — business name, website and public business contact
> details — to offer advertising or partnership. These records are built from our own
> platform listings, not purchased or scraped from third-party contact databases. If you
> would rather we did not hold one, contact us and we will delete it.

### Notes on the wording

- The robots.txt clause was removed from the first draft after checking the code, and is
  **back as of 2026-08-23 because the code changed** — not because the wording softened.
  See section 3a. `scrapeUrl` now checks `robots.txt` before any backend runs, and the
  Python crawler under `crawlers/` — the one ingestion path that does not route through
  `scrapeUrl` — checks it too. Both fail open, so the sentence promises only what the
  code does: an explicit `Disallow` stops the fetch.
  It says "pages that a site's `robots.txt` tells crawlers not to fetch", NOT "we
  identify ourselves so you can control us". The crawler still presents a browser
  User-Agent, so it matches the wildcard `*` group and a site cannot write a rule
  addressed to us specifically. That distinction is the difference between a true
  sentence and a flattering one, and it is why the wording is shaped this way.
  "Behind a login or a paywall" stays, because nothing in `_shared/scraper.ts`
  authenticates anywhere.
- The last paragraph is the AC4 notice-at-collection. It describes the pipeline in the
  present tense while `prospect_leads` is empty, which is the correct tense for a notice
  that must exist *before* collection starts.
- It credits what AC5 asks us not to undo: `supabase/functions/_shared/agents/lead-sourcing.ts:2-11`
  documents its sources as internal platform content only, explicitly disclaims external
  scraping and gated/PII sources, and records that external enrichment is off. The
  sentence "built from our own platform listings, not purchased or scraped from
  third-party contact databases" is that guarantee stated to users.

---

## 3a. Half of this section has been fixed; the other half is still true

**Originally** (2026-08-22) this section reported two findings against
`supabase/functions/_shared/scraper.ts`, which every EDGE ingestion path routes through
via `scrapeUrl` / `scrapeUrls`: no robots.txt handling in any of its five backends, and a
desktop-browser User-Agent rather than a bot identifier.

**The first is fixed** (2026-08-23). `scrapeUrl` calls `isCrawlAllowed()` before any
backend runs — checked there rather than per backend, because the fallback chain would
otherwise route around it. It fails open by construction: no robots.txt, a 404, a 5xx, a
timeout or an unparseable file all mean allowed, and only an explicit `Disallow` blocks.
`SCRAPER_IGNORE_ROBOTS=true` exists as an incident escape hatch and is not the default.
See WEB-SEC-024.

`crawlers/catchdesmoines_crawler.py` was the ONE ingestion path that does not go through
`scrapeUrl` — it drives crawl4ai directly — and it was still fetching without asking.
It now checks too, with the same fail-open rule, and reads the site's declared
`Crawl-delay` instead of its own hardcoded gap. That gap was 1 second between detail
pages against the `Crawl-delay: 2` catchdesmoines.com publishes, so it had been crawling
at twice the rate the site asked for. Verified against the live file: the events listing
is allowed, `/plugins/crm/count/` is blocked, and the detail delay rises 1s -> 2s.
  A disclosure is only as true as its least compliant path, which is why this one
  mattered more than its size suggests.

**The second is unchanged.** The crawler still presents
`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/120.0.0.0 Safari/537.36`, so from
the server's side it is indistinguishable from a person using Chrome. A site can stop us
with a blanket rule and cannot write one addressed to us. That is WEB-SEC-024 AC3, an
open owner decision — declaring a bot UA is the honest option and will reduce ingestion,
because sites that block bots will then successfully block us.

Consequences for this story, updated:

1. **The Privacy Policy may now say we honour robots.txt** — worded as "pages that a
   site's `robots.txt` tells crawlers not to fetch", which is what the code does. It may
   NOT say we identify ourselves, which is what the code still does not do.
2. **The AC3 defence rests on what is collected, not on crawling politely.** That was
   true when politeness was absent and stays true now that it is present; an argument
   built on the politeness would have had to be rewritten twice.

**Half of this is now fixed** — filed and built as WEB-SEC-024 on the same day. `scrapeUrl`
checks robots.txt before any backend runs, fail-open on every ambiguity, with 13 offline
tests in CI. So the robots sentence CAN go back into section 2 once that ships.

What is still open there is the User-Agent, and it is a content decision rather than a
technical one: declaring ourselves as a bot is the honest option and will reduce ingestion,
because sites that block bots will then successfully block us. Given the crawl pipeline is
currently the only thing keeping the site fresh, that was not taken unilaterally.

---

## 3. The scraping asymmetry (AC3)

`Terms.tsx:97` prohibits users from "Scrape, crawl, or harvest data without permission"
while the platform crawls third parties. AC3 asks for a deliberate stated position
rather than an unremarked contradiction.

The asymmetry is defensible, and the defence is specific rather than "we are allowed and
you are not":

> ### About Automated Access
>
> We prohibit automated collection from this site while ourselves collecting from
> publicly accessible pages elsewhere. Those are different things, and the difference is
> the point: we collect factual business listing information — what is on, where, and
> when — that venues publish in order to be found, we record and link the source of
> every listing, and we do not collect personal information about individuals. What we
> prohibit is bulk extraction of the compiled database itself, including our
> descriptions, rankings and AI-generated content. If you would like access to that
> data, ask us — we grant it.

Two things this deliberately does not say: that our crawling is legal because it is
public data, and that anyone else's crawling is illegal. Both are contested claims and
neither is load-bearing.

---

## 4. Sub-processor consistency (AC6)

`DataProcessingAgreement.tsx` names: **Anthropic, Cloudflare, OpenAI, Resend, Stripe,
Supabase.** The proposed section names Stripe, an email provider, and Google/Apple sign-in.

Two consistency items for review, both pre-existing rather than introduced here:

1. **Google and Apple** appear as sign-in providers in the flow but not in the DPA's
   sub-processor list. Either they belong there, or the sources section should describe
   them as authentication providers rather than sub-processors.
2. **SendGrid** — the July audit reportedly added "Resend/SendGrid" to both documents,
   but the current DPA text mentions only Resend. Confirm which provider is live before
   the sources section refers to "our email provider" generically.

---

## 5. Open questions for the owner

1. **How much of the pipeline to name.** The draft describes it in categories and names
   no crawler, vendor or source site. Naming Firecrawl, or naming
   `catchdesmoines.com` as a source, is more transparent and also more operationally
   revealing. My recommendation is the category-level wording above.
2. **Answered, and half fixed** — see 3a. The robots.txt check is built (WEB-SEC-024),
   so the robots sentence can be restored to section 2 once it ships. The User-Agent is
   the remaining decision, and it trades honesty against ingestion volume.
3. **Does the business-contact paragraph belong here at all** while `prospect_leads` is
   empty and external enrichment is off? Publishing a notice for collection that has not
   started is the cautious choice; the alternative is to hold it until the pipeline is
   switched on and publish it then.
4. **Retention for crawled listings.** *Data Retention* covers user data. It says nothing
   about how long a delisted venue's record is kept, which a reader of a sources
   disclosure may reasonably ask next.
