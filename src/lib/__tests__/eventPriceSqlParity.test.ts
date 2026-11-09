import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { isFreePrice, FREE_PRICE_FILTER } from "@/lib/eventPrice";

/**
 * events.is_free is computed by public.event_price_is_free() in
 * 20261107000080_events_price_min_is_free.sql (WEB-BE-049). Slice 3 moves the
 * free-events pages onto that column, so its true branch has to stay the same
 * rule as isFreePrice, which the badge prints. Postgres is not available in
 * CI, so this reads the patterns out of the migration and runs them in JS:
 * every pattern used there means the same thing in both engines.
 */
const MIGRATION = "supabase/migrations/20261107000080_events_price_min_is_free.sql";

function freeBranchPatterns() {
  const sql = readFileSync(MIGRATION, "utf8");
  const body = /FUNCTION public\.event_price_is_free[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? "";
  const word = /IF t ~\* '([^']+)' AND t !~ '([^']+)' THEN/.exec(body);
  const zero = /IF t ~ '(\^[^']+)' THEN/.exec(body);
  return { word: word?.[1], nonzero: word?.[2], zero: zero?.[1] };
}

/** event_price_is_free's true branch, transcribed. */
function sqlSaysFree(price: string, p: ReturnType<typeof freeBranchPatterns>): boolean {
  const t = price.trim();
  if (!t) return false;
  if (new RegExp(p.word ?? "", "i").test(t) && !new RegExp(p.nonzero ?? "").test(t)) return true;
  return new RegExp(p.zero ?? "").test(t);
}

describe("events.is_free matches isFreePrice (WEB-BE-049)", () => {
  const patterns = freeBranchPatterns();

  it("finds the free branch in the migration", () => {
    expect(patterns.word).toBe("free");
    expect(patterns.zero).toBe("^[$]?0([.]0+)?$");
  });

  it("refuses a nonzero amount with the same regex as FREE_PRICE_FILTER", () => {
    const posix = /price\.not\.match\.([^),]+)\)/.exec(FREE_PRICE_FILTER)?.[1];
    expect(patterns.nonzero).toBe(posix);
  });

  it.each([
    "Free", "FREE admission", "Free - $0", "$0", "0", "$0.00", "0.0", " $0 ", "Free $ 0",
    "Free; 15 dollars", "Freebies", "$0 - free",
    "Free - $20", "$0-$25", "$25", "$ 15", "25", "$25; kids under 5 free",
    "Free parking, $40 tickets", "See website", "TBD", "No charge", "", "   ", "$00", "$ 0",
  ])("%j", (price) => {
    expect(sqlSaysFree(price, patterns)).toBe(isFreePrice(price) === true);
  });
});
