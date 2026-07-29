/**
 * Event-source verification harness.
 *
 * WHY THIS EXISTS
 * ---------------
 * The parsing audit in docs/scraping/EVENT_SOURCE_PLAYBOOK.md was done from the
 * code, the migrations, and the n8n workflows. The strategies that are provably
 * correct (an API, a REST endpoint, schema.org structured data) are implemented
 * and unit-tested against fixtures. What CANNOT be settled from the repo is
 * which strategy each live site actually satisfies today — that needs a real
 * request to each host.
 *
 * Run this from a machine with outbound access to the source sites and it prints,
 * per source, exactly what the pipeline would get: the strategy that won, the
 * event count, and the field coverage that matters for a usable listing (date,
 * per-event URL, image, venue). Paste the table into the playbook and the
 * "needs verification" column becomes fact.
 *
 * USAGE
 *   deno run --allow-net --allow-env scripts/verify-event-sources.ts
 *   deno run --allow-net --allow-env scripts/verify-event-sources.ts --only=hoyt-sherman,iowa-wild
 *   deno run --allow-net --allow-env scripts/verify-event-sources.ts --json > report.json
 *
 * It is READ-ONLY: nothing is written to Supabase, no Claude tokens are spent,
 * and blocked sources are reported rather than hammered.
 */

import {
  EVENT_SOURCE_PROFILES,
  type EventSourceProfile,
} from "../supabase/functions/_shared/eventSourceProfiles.ts";
import {
  discoverDetailLinks,
  fetchEventsFromDetailPages,
  fetchListingHtml,
} from "../supabase/functions/_shared/eventPageDiscovery.ts";
import { extractEventsFromJsonLd } from "../supabase/functions/_shared/jsonLdEvents.ts";
import type { AdapterEvent } from "../supabase/functions/_shared/domain-adapters/types.ts";

interface SourceReport {
  id: string;
  label: string;
  listingUrl: string;
  listingStatus: string;
  strategyThatWon: string;
  eventCount: number;
  coverage: {
    withDate: number;
    withOwnUrl: number;
    withImage: number;
    withVenue: number;
  };
  detailLinksFound: number;
  tribeRest: "hit" | "miss" | "not-probed";
  sample: AdapterEvent | null;
  notes: string[];
}

const args = Deno.args;
const jsonOut = args.includes("--json");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg
  ? new Set(onlyArg.slice("--only=".length).split(",").map((s) => s.trim()))
  : null;

function log(...parts: unknown[]): void {
  if (!jsonOut) console.log(...parts);
}

/** Probe the WordPress "The Events Calendar" REST endpoint. */
async function probeTribeRest(
  profile: EventSourceProfile,
): Promise<{ hit: boolean; count: number }> {
  if (!profile.strategy.includes("tribe-rest")) {
    return { hit: false, count: 0 };
  }
  let origin: string;
  try {
    origin = new URL(profile.listingUrls[0]).origin;
  } catch {
    return { hit: false, count: 0 };
  }
  const today = new Date().toISOString().slice(0, 10);
  const url =
    `${origin}/wp-json/tribe/events/v1/events?per_page=5&start_date=${today}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { hit: false, count: 0 };
    if (!(res.headers.get("content-type") ?? "").includes("json")) {
      return { hit: false, count: 0 };
    }
    const body = await res.json();
    const count = Array.isArray(body?.events) ? body.events.length : 0;
    return { hit: count > 0, count };
  } catch {
    return { hit: false, count: 0 };
  }
}

function coverageOf(events: AdapterEvent[], listingUrl: string) {
  const listingNormalized = listingUrl.replace(/\/+$/, "");
  return {
    withDate: events.filter((e) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(e.date))
      .length,
    // "Own URL" means a per-event deep link, NOT the listing page — that
    // distinction is the whole point of the detail-page layer.
    withOwnUrl: events.filter((e) => {
      const u = (e.source_url ?? "").replace(/\/+$/, "");
      return u.length > 0 && u !== listingNormalized;
    }).length,
    withImage: events.filter((e) => !!e.image_url).length,
    withVenue: events.filter((e) => e.venue && e.venue !== "TBD").length,
  };
}

async function verify(profile: EventSourceProfile): Promise<SourceReport> {
  const listingUrl = profile.listingUrls[0];
  const report: SourceReport = {
    id: profile.id,
    label: profile.label,
    listingUrl,
    listingStatus: "not-fetched",
    strategyThatWon: "none",
    eventCount: 0,
    coverage: { withDate: 0, withOwnUrl: 0, withImage: 0, withVenue: 0 },
    detailLinksFound: 0,
    tribeRest: profile.strategy.includes("tribe-rest") ? "miss" : "not-probed",
    sample: null,
    notes: [],
  };

  if (profile.strategy[0] === "blocked") {
    report.listingStatus = "skipped";
    report.strategyThatWon = "blocked";
    report.notes.push("Marked blocked in the profile; not requested.");
    return report;
  }

  if (profile.strategy[0] === "adapter") {
    report.listingStatus = "skipped";
    report.strategyThatWon = "adapter (owned elsewhere)";
    report.notes.push(
      "A bespoke adapter owns this host; verify it via its own unit tests and a live crawl, not this harness.",
    );
    return report;
  }

  // 1. Tribe REST
  const tribe = await probeTribeRest(profile);
  if (tribe.hit) {
    report.tribeRest = "hit";
    report.strategyThatWon = "tribe-rest";
    report.notes.push(
      `Tribe REST returned ${tribe.count} event(s) on a 5-per-page probe — this source should be served by tribeEvents.ts.`,
    );
  }

  // 2. Listing page
  const html = await fetchListingHtml(listingUrl);
  if (!html) {
    report.listingStatus = "fetch-failed";
    report.notes.push(
      "Plain HTTP GET failed. Either the host blocks datacentre IPs or the URL moved — retry through Browserless before changing the profile.",
    );
    return report;
  }
  report.listingStatus = `ok (${html.length} chars)`;

  const fromListing = extractEventsFromJsonLd(
    html,
    listingUrl,
    profile.defaultCategory ?? "General",
  );
  if (fromListing.length > 0 && report.strategyThatWon === "none") {
    report.strategyThatWon = "listing-jsonld";
  }
  report.notes.push(`Listing ld+json: ${fromListing.length} event(s).`);

  // 3. Detail layer
  const links = discoverDetailLinks(html, listingUrl, profile);
  report.detailLinksFound = links.length;
  let fromDetail: AdapterEvent[] = [];
  if (links.length > 0 && fromListing.length < 4) {
    // Sample the first few so a verification run stays polite.
    fromDetail = await fetchEventsFromDetailPages(links.slice(0, 5), {
      venue: profile.venue?.name,
      location: profile.venue?.location,
      category: profile.defaultCategory,
      ticketsUrl: profile.ticketsUrl,
    });
    if (fromDetail.length > 0 && report.strategyThatWon === "none") {
      report.strategyThatWon = "detail-crawl";
    }
    report.notes.push(
      `Detail crawl: ${fromDetail.length}/${
        Math.min(5, links.length)
      } sampled pages parsed (${links.length} links found).`,
    );
  } else if (links.length === 0) {
    report.notes.push(
      "No detail links matched. Either the calendar is client-rendered (needs Browserless) or this profile's detailPathPatterns need the real URL shape.",
    );
  }

  const all = [...fromListing, ...fromDetail];
  report.eventCount = all.length;
  report.coverage = coverageOf(all, listingUrl);
  report.sample = all[0] ?? null;

  if (all.length === 0) {
    report.notes.push(
      "ZERO events via cheap strategies — this source still depends on the Browserless + Claude path.",
    );
  }
  return report;
}

const targets = EVENT_SOURCE_PROFILES.filter((p) => !only || only.has(p.id));

log(`\n🔎 Verifying ${targets.length} event source(s)\n${"═".repeat(72)}`);

const reports: SourceReport[] = [];
for (const profile of targets) {
  log(`\n▶ ${profile.label} (${profile.id})`);
  const report = await verify(profile);
  reports.push(report);

  log(`   listing:   ${report.listingUrl}`);
  log(`   status:    ${report.listingStatus}`);
  log(`   strategy:  ${report.strategyThatWon}`);
  log(`   tribe:     ${report.tribeRest}`);
  log(`   events:    ${report.eventCount}`);
  if (report.eventCount > 0) {
    const c = report.coverage;
    const pct = (n: number) => `${Math.round((n / report.eventCount) * 100)}%`;
    log(
      `   coverage:  date ${pct(c.withDate)} · own-url ${pct(c.withOwnUrl)} · image ${
        pct(c.withImage)
      } · venue ${pct(c.withVenue)}`,
    );
    log(
      `   sample:    "${report.sample?.title}" @ ${report.sample?.date} → ${report.sample?.source_url}`,
    );
  }
  for (const note of report.notes) log(`   • ${note}`);
}

if (jsonOut) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  log(`\n${"═".repeat(72)}\nSUMMARY\n`);
  const rows = reports.map((r) => ({
    source: r.label,
    strategy: r.strategyThatWon,
    events: r.eventCount,
    ownUrl: r.eventCount ? `${r.coverage.withOwnUrl}/${r.eventCount}` : "-",
    image: r.eventCount ? `${r.coverage.withImage}/${r.eventCount}` : "-",
  }));
  const width = Math.max(...rows.map((r) => r.source.length), 6);
  for (const row of rows) {
    log(
      `${row.source.padEnd(width)}  ${row.strategy.padEnd(24)}  ` +
        `events=${String(row.events).padStart(3)}  own-url=${row.ownUrl.padEnd(7)} image=${row.image}`,
    );
  }

  const needsWork = reports.filter(
    (r) => r.strategyThatWon === "none" && r.listingStatus !== "skipped",
  );
  if (needsWork.length > 0) {
    log(
      `\n⚠️ ${needsWork.length} source(s) still fall through to Browserless + Claude:\n` +
        needsWork.map((r) => `   - ${r.label}`).join("\n"),
    );
  }
}
