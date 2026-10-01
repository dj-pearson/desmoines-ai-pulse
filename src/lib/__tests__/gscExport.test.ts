import { describe, expect, it } from "vitest";
import {
  parseChartRange,
  parseCsv,
  parseDimensionCsv,
  parseFilters,
  totalsOf,
} from "@/lib/gscExport";

describe("parseCsv", () => {
  it("handles quoted commas, doubled quotes and a BOM", () => {
    const rows = parseCsv('\uFEFFTop queries,Clicks\r\n"dave\'s, west des moines",3\r\n"say ""hi""",1\r\n');
    expect(rows).toEqual([
      ["Top queries", "Clicks"],
      ["dave's, west des moines", "3"],
      ['say "hi"', "1"],
    ]);
  });
});

describe("parseDimensionCsv", () => {
  it("reads CTR as a percent number and position as a float", () => {
    const rows = parseDimensionCsv(
      "Top queries,Clicks,Impressions,CTR,Position\natlas cafe west des moines,28,188,14.89%,2.13\n",
      "Top queries",
    );
    expect(rows).toEqual([
      { key: "atlas cafe west des moines", clicks: 28, impressions: 188, ctr: 14.89, position: 2.13 },
    ]);
  });

  it("refuses a file whose key column is not the expected one", () => {
    // Pages.csv handed in as Queries.csv must not load page URLs as queries.
    expect(() =>
      parseDimensionCsv("Top pages,Clicks,Impressions\nhttps://x/,1,2\n", "Top queries"),
    ).toThrow(/Top queries/);
  });

  it("fails on a repeated key rather than letting the unique index reject a batch", () => {
    expect(() =>
      parseDimensionCsv("Top queries,Clicks,Impressions\na,1,2\na,1,2\n", "Top queries"),
    ).toThrow(/Duplicate/);
  });

  it("totals what it parsed", () => {
    const rows = parseDimensionCsv("Top pages,Clicks,Impressions\n/a,1,10\n/b,2,20\n", "Top pages");
    expect(totalsOf(rows)).toEqual({ rows: 2, clicks: 3, impressions: 30 });
  });
});

describe("parseChartRange", () => {
  it("takes the range from the first and last dated row, in date order", () => {
    const range = parseChartRange(
      "Date,Clicks,Impressions,CTR,Position\n2026-09-27,1,1,1%,1\n2026-06-29,1,1,1%,1\n2026-07-01,1,1,1%,1\n",
    );
    expect(range).toEqual({ start: "2026-06-29", end: "2026-09-27", days: 91 });
  });
});

describe("parseFilters", () => {
  it("accepts search type and date", () => {
    expect(parseFilters("Filter,Value\nSearch type,Web\nDate,Last 3 months\n")).toEqual({
      searchType: "web",
      dateLabel: "Last 3 months",
    });
  });

  it("refuses an export filtered to a subset", () => {
    expect(() =>
      parseFilters("Filter,Value\nSearch type,Web\nDate,Last 3 months\nCountry,United States\n"),
    ).toThrow(/subset/);
  });
});
