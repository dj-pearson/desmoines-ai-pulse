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
> sources, and we do not access anything behind a login or a paywall.
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

- The robots.txt clause was **removed from the draft after checking the code**, not
  omitted by oversight. See section 3a — the crawlers do not honour robots.txt, so
  promising that they do would put a false statement in the Privacy Policy, which is the
  exact defect the other WEB-LEGAL stories are about. "Behind a login or a paywall"
  stays, because nothing in `_shared/scraper.ts` authenticates anywhere.
- The last paragraph is the AC4 notice-at-collection. It describes the pipeline in the
  present tense while `prospect_leads` is empty, which is the correct tense for a notice
  that must exist *before* collection starts.
- It credits what AC5 asks us not to undo: `supabase/functions/_shared/agents/lead-sourcing.ts:2-11`
  documents its sources as internal platform content only, explicitly disclaims external
  scraping and gated/PII sources, and records that external enrichment is off. The
  sentence "built from our own platform listings, not purchased or scraped from
  third-party contact databases" is that guarantee stated to users.

---

## 3a. A finding that changes AC3: the crawlers do not identify themselves

Checked in `supabase/functions/_shared/scraper.ts`, which every ingestion path routes
through via `scrapeUrl` / `scrapeUrls`. It has five backends — browserless, fetch,
puppeteer, playwright, firecrawl — and:

- **No robots.txt handling anywhere.** No fetch of `/robots.txt`, no allow/deny check,
  in any backend. (`crawl-site` does read robots META tags, but that function audits our
  OWN site for SEO and writes to `seo_crawl_results`, a table that does not exist — see
  WEB-BE-031. It is not a third-party crawler.)
- **It presents as a desktop browser**, not as a bot:
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/120.0.0.0 Safari/537.36`.
  A site cannot allow, deny, or rate-limit this crawler specifically, because from the
  server's side it is indistinguishable from a person using Chrome.

This is a factual finding, not a legal conclusion, and it is the owner's call what to do
with it. But it has two direct consequences for this story:

1. **The Privacy Policy must not claim we honour robots.txt.** Removed from the draft
   above.
2. **It weakens the AC3 defence** rather than strengthening it. The wording below argues
   the asymmetry is about *what* is collected, which survives this finding. An argument
   resting on "we crawl politely" would not.

Worth treating as its own piece of work: a declared User-Agent with a contact URL, and a
robots.txt check in `scrapeUrl`, would cost little and would make the position in section
3 straightforwardly true rather than narrowly true.

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
2. **Answered, and it changed the draft** — see 3a. The crawlers do not honour
   robots.txt and present a Chrome User-Agent, so the robots claim was removed rather
   than published. What remains open is whether to fix that (declared UA plus a
   robots.txt check in `scrapeUrl`) before or after this policy text ships.
3. **Does the business-contact paragraph belong here at all** while `prospect_leads` is
   empty and external enrichment is off? Publishing a notice for collection that has not
   started is the cautious choice; the alternative is to hold it until the pipeline is
   switched on and publish it then.
4. **Retention for crawled listings.** *Data Retention* covers user data. It says nothing
   about how long a delisted venue's record is kept, which a reader of a sources
   disclosure may reasonably ask next.
