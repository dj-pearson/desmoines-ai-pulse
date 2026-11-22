/**
 * WEB-OPS-026: one-time sweep of every restaurant listing against Google
 * Places, reviewed by the owner before anything is hidden.
 *
 *   npx tsx scripts/sweep-restaurant-closures.ts                  # dry run, writes a report
 *   npx tsx scripts/sweep-restaurant-closures.ts --apply <report.json>
 *
 * Environment (read, never printed):
 *   VITE_SUPABASE_URL           project URL
 *   SUPABASE_SERVICE_ROLE_KEY   service role key (the dry run only reads with it)
 *   GOOGLE_PLACES_API_KEY       a Places API (New) key
 *
 * DRY RUN. Reads every restaurant and asks Places one question per row:
 *   - with a google_place_id: Place Details, field mask businessStatus;
 *   - without one: Text Search by name and address, accepted only on the same
 *     confident match the daily lookup uses (pickConfidentPlace).
 * Writes nothing to the database. Writes scripts/content-backups/ops-026/
 * report-<date>.json and .csv with one line per restaurant: id, name, address,
 * current status, Places answer, proposed action. Resumable: answers are kept
 * in progress.json and a rerun skips rows already answered; a Places error is
 * not an answer and is retried.
 *
 * APPLY. Takes the report the owner read, not a fresh sweep, so it does
 * exactly what was reviewed:
 *   - CLOSED_PERMANENTLY rows: business_status = CLOSED_PERMANENTLY and
 *     status = closed (the WEB-BE-065 trigger would also set status);
 *   - place_not_found and no_place_match rows: queued in
 *     restaurant_closure_reviews (source ops-026-sweep); place_not_found also
 *     sets promotion_hold_reason so the row leaves promotion at once.
 * It never deletes a row. A closed listing's page keeps resolving and says
 * Permanently closed, since external links and sitemap history point at it.
 *
 * COST. One Places call per restaurant (about 600). businessStatus bills at
 * the Place Details Pro SKU; Text Search with id, name, address and
 * businessStatus at Text Search Pro. The report states how many calls it made.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type PlaceCandidate,
  pickConfidentPlace,
  placeLookupQuery,
} from "../supabase/functions/_shared/placeLookup.ts";

const OUT_DIR = resolve(process.cwd(), "scripts/content-backups/ops-026");
const PROGRESS = resolve(OUT_DIR, "progress.json");
const CALL_GAP_MS = 150;
const SOURCE = "ops-026-sweep";

export type SweepGroup =
  | "operational"
  | "temporarily_closed"
  | "permanently_closed"
  | "place_not_found"
  | "no_place_id"
  | "error";

export type SweepAction = "none" | "close" | "queue_place_not_found" | "queue_no_place_match" | "retry";

export interface RestaurantRow {
  id: string;
  name: string;
  location: string | null;
  status: string | null;
  business_status: string | null;
  google_place_id: string | null;
  is_merged: boolean | null;
}

export interface SweepLine {
  id: string;
  name: string;
  address: string;
  current_status: string;
  current_business_status: string;
  places_answer: string;
  group: SweepGroup;
  action: SweepAction;
  detail: string;
}

/** What the sweep proposes for one Places answer. Pure, for the test. */
export function classifyAnswer(
  row: RestaurantRow,
  answer: { kind: "status"; value: string } | { kind: "not_found" } | { kind: "no_match"; reason: string } | {
    kind: "error";
    message: string;
  },
): SweepLine {
  const base = {
    id: row.id,
    name: row.name,
    address: row.location ?? "",
    current_status: row.status ?? "",
    current_business_status: row.business_status ?? "",
  };
  switch (answer.kind) {
    case "status":
      if (answer.value === "CLOSED_PERMANENTLY") {
        return { ...base, places_answer: answer.value, group: "permanently_closed", action: "close", detail: "" };
      }
      if (answer.value === "CLOSED_TEMPORARILY") {
        return { ...base, places_answer: answer.value, group: "temporarily_closed", action: "none", detail: "" };
      }
      if (answer.value === "OPERATIONAL") {
        return { ...base, places_answer: answer.value, group: "operational", action: "none", detail: "" };
      }
      // Places answered without a recognised status: unknown, so a person looks.
      return {
        ...base,
        places_answer: answer.value || "NO_STATUS",
        group: "place_not_found",
        action: "queue_place_not_found",
        detail: "no recognised businessStatus",
      };
    case "not_found":
      return { ...base, places_answer: "NOT_FOUND", group: "place_not_found", action: "queue_place_not_found", detail: "" };
    case "no_match":
      return {
        ...base,
        places_answer: "NO_MATCH",
        group: "no_place_id",
        action: "queue_no_place_match",
        detail: answer.reason,
      };
    case "error":
      return { ...base, places_answer: "ERROR", group: "error", action: "retry", detail: answer.message };
  }
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. The sweep reads it from the environment and never prints it.`);
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readAllRestaurants(url: string, key: string): Promise<RestaurantRow[]> {
  const rows: RestaurantRow[] = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    const res = await fetch(
      `${url}/rest/v1/restaurants?select=id,name,location,status,business_status,google_place_id,is_merged&order=id.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + page - 1}` } },
    );
    if (!res.ok) throw new Error(`Could not read restaurants (HTTP ${res.status}); refusing to report on a partial table.`);
    const batch = (await res.json()) as RestaurantRow[];
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
}

async function askPlaces(row: RestaurantRow, googleKey: string): Promise<Parameters<typeof classifyAnswer>[1]> {
  try {
    if (row.google_place_id) {
      const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(row.google_place_id)}`, {
        headers: { "X-Goog-Api-Key": googleKey, "X-Goog-FieldMask": "businessStatus" },
      });
      if (res.status === 404) return { kind: "not_found" };
      if (!res.ok) return { kind: "error", message: `Places ${res.status}` };
      const body = (await res.json()) as { businessStatus?: string };
      return { kind: "status", value: body.businessStatus ?? "" };
    }
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.businessStatus",
      },
      body: JSON.stringify({
        textQuery: placeLookupQuery(row),
        maxResultCount: 5,
        locationBias: { circle: { center: { latitude: 41.5868, longitude: -93.625 }, radius: 40000 } },
      }),
    });
    if (!res.ok) return { kind: "error", message: `Places ${res.status}` };
    const body = (await res.json()) as { places?: Array<PlaceCandidate & { businessStatus?: string }> };
    const places = body.places ?? [];
    const match = pickConfidentPlace(row, places);
    if (match.ok !== true) return { kind: "no_match", reason: "reason" in match ? match.reason : "no_match" };
    const placeId = match.placeId;
    const hit = places.find((p) => p.id === placeId);
    return { kind: "status", value: hit?.businessStatus ?? "" };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function writeReport(lines: SweepLine[], calls: number): string {
  const date = new Date().toISOString().slice(0, 10);
  const counts: Record<string, number> = {};
  for (const l of lines) counts[l.group] = (counts[l.group] ?? 0) + 1;
  const json = resolve(OUT_DIR, `report-${date}.json`);
  writeFileSync(json, JSON.stringify({ generatedAt: new Date().toISOString(), placesCalls: calls, counts, lines }, null, 2));
  const cols: (keyof SweepLine)[] = [
    "id",
    "name",
    "address",
    "current_status",
    "current_business_status",
    "places_answer",
    "group",
    "action",
    "detail",
  ];
  const csv = [cols.join(","), ...lines.map((l) => cols.map((c) => csvCell(String(l[c]))).join(","))].join("\n");
  writeFileSync(resolve(OUT_DIR, `report-${date}.csv`), csv + "\n");
  console.log(`Places calls this run: ${calls}`);
  console.log("Counts per group:", counts);
  console.log(`Report: ${json} (and .csv)`);
  return json;
}

async function dryRun(): Promise<void> {
  const url = env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const googleKey = env("GOOGLE_PLACES_API_KEY");
  mkdirSync(OUT_DIR, { recursive: true });
  const progress: Record<string, SweepLine> = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, "utf8")) : {};
  const rows = (await readAllRestaurants(url, key)).filter((r) => r.is_merged !== true);
  console.log(`${rows.length} restaurants (merged duplicates skipped); ${Object.keys(progress).length} already answered.`);
  let calls = 0;
  for (const row of rows) {
    const done = progress[row.id];
    if (done && done.group !== "error") continue;
    const answer = await askPlaces(row, googleKey);
    calls++;
    progress[row.id] = classifyAnswer(row, answer);
    if (calls % 25 === 0) {
      writeFileSync(PROGRESS, JSON.stringify(progress));
      console.log(`  ${calls} calls so far`);
    }
    await sleep(CALL_GAP_MS);
  }
  writeFileSync(PROGRESS, JSON.stringify(progress));
  writeReport(rows.map((r) => progress[r.id]).filter(Boolean), calls);
  console.log("Nothing was written to the database. Read the report, then run --apply <report.json>.");
}

async function applyReport(reportPath: string): Promise<void> {
  const url = env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const report = JSON.parse(readFileSync(resolve(reportPath), "utf8")) as { lines: SweepLine[] };
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  let closed = 0;
  let queued = 0;
  const failures: string[] = [];
  for (const line of report.lines) {
    if (line.action === "close") {
      const res = await fetch(`${url}/rest/v1/restaurants?id=eq.${line.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ business_status: "CLOSED_PERMANENTLY", status: "closed" }),
      });
      if (res.ok) closed++;
      else failures.push(`${line.id} close: HTTP ${res.status}`);
    } else if (line.action === "queue_place_not_found" || line.action === "queue_no_place_match") {
      const reason = line.action === "queue_place_not_found" ? "place_not_found" : "no_place_match";
      const res = await fetch(`${url}/rest/v1/restaurant_closure_reviews`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          restaurant_id: line.id,
          reason,
          source: SOURCE,
          details: { places_answer: line.places_answer, detail: line.detail },
        }),
      });
      // 409 is the one-open-finding index: already queued.
      if (!res.ok && res.status !== 409) {
        failures.push(`${line.id} queue: HTTP ${res.status}`);
        continue;
      }
      if (reason === "place_not_found") {
        const hold = await fetch(`${url}/rest/v1/restaurants?id=eq.${line.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ promotion_hold_reason: "place_not_found" }),
        });
        if (!hold.ok) failures.push(`${line.id} hold: HTTP ${hold.status}`);
      }
      queued++;
    }
  }
  console.log(`Closed ${closed}, queued ${queued} for review, ${failures.length} failure(s). Nothing was deleted.`);
  for (const f of failures) console.log(`  ${f}`);
  if (failures.length > 0) process.exitCode = 1;
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("sweep-restaurant-closures.ts");
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--apply");
  const run = i === -1 ? dryRun() : applyReport(args[i + 1] ?? "");
  run.catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
