/**
 * Parsing for a Google Search Console UI export (Performance > Export > CSV,
 * unzipped). Pure functions, no I/O: scripts/import-gsc-export.ts reads the
 * files and writes the rows, and src/lib/__tests__/gscExport.test.ts pins the
 * parsing.
 *
 * The export folder holds Chart.csv (one row per DAY, property totals),
 * Queries.csv and Pages.csv (one row per query/page, AGGREGATED over the whole
 * range), plus Countries, Devices, Search appearance and Filters. Two facts
 * shape everything here:
 *
 * 1. Filters.csv names the range only as a label ("Last 3 months"). The actual
 *    dates come from Chart.csv's first and last Date, which is the only place
 *    the export states them.
 * 2. An export taken with a query, page, country or device filter is a SUBSET.
 *    Loading it as if it were the property's totals would be wrong in a way
 *    that looks right, so any filter beyond Search type and Date is refused.
 */

export interface GscExportRow {
  key: string;
  clicks: number;
  impressions: number;
  /** Percent: 14.89 for "14.89%". */
  ctr: number | null;
  position: number | null;
}

export interface GscExportRange {
  start: string;
  end: string;
  days: number;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines in quotes. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function toInt(value: string, label: string): number {
  const n = Number(value.replace(/,/g, "").trim());
  if (!Number.isFinite(n)) throw new Error(`${label}: "${value}" is not a number`);
  return Math.round(n);
}

function toOptionalNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const cleaned = value.replace(/%$/, "").replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Queries.csv ("Top queries") or Pages.csv ("Top pages"). Header names are
 * matched by column, not position, so a reordered export still parses.
 */
export function parseDimensionCsv(text: string, expectedFirstHeader: string): GscExportRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const keyIdx = idx(expectedFirstHeader.toLowerCase());
  const clicksIdx = idx("clicks");
  const imprIdx = idx("impressions");
  const ctrIdx = idx("ctr");
  const posIdx = idx("position");
  if (keyIdx < 0 || clicksIdx < 0 || imprIdx < 0) {
    throw new Error(
      `Expected columns "${expectedFirstHeader}", "Clicks", "Impressions"; got ${JSON.stringify(header)}`,
    );
  }

  const rows: GscExportRow[] = [];
  const seen = new Set<string>();
  for (const [n, cells] of body.entries()) {
    const key = cells[keyIdx];
    if (key === undefined || key === "") continue;
    // The UI export does not repeat a key; if one ever does, the unique index
    // would reject the batch, so fail here with the line number instead.
    if (seen.has(key)) throw new Error(`Duplicate ${expectedFirstHeader} on line ${n + 2}: ${key}`);
    seen.add(key);
    rows.push({
      key,
      clicks: toInt(cells[clicksIdx] ?? "0", `line ${n + 2} clicks`),
      impressions: toInt(cells[imprIdx] ?? "0", `line ${n + 2} impressions`),
      ctr: ctrIdx >= 0 ? toOptionalNumber(cells[ctrIdx]) : null,
      position: posIdx >= 0 ? toOptionalNumber(cells[posIdx]) : null,
    });
  }
  return rows;
}

/** First and last Date in Chart.csv. */
export function parseChartRange(text: string): GscExportRange {
  const [header, ...body] = parseCsv(text);
  const dateIdx = (header ?? []).findIndex((h) => h.trim().toLowerCase() === "date");
  if (dateIdx < 0) throw new Error("Chart.csv has no Date column");
  const dates = body
    .map((r) => (r[dateIdx] ?? "").trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (dates.length === 0) throw new Error("Chart.csv has no dated rows");
  const start = dates[0];
  const end = dates[dates.length - 1];
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  return { start, end, days };
}

const ALLOWED_FILTERS = new Set(["search type", "date"]);

/**
 * Filters.csv -> search type ("web", "image", "video", "news", "discover").
 * Throws on any filter that would make the export a subset of the property.
 */
export function parseFilters(text: string): { searchType: string; dateLabel: string | null } {
  const [, ...body] = parseCsv(text);
  let searchType = "web";
  let dateLabel: string | null = null;
  const refused: string[] = [];
  for (const [name = "", value = ""] of body) {
    const n = name.trim().toLowerCase();
    if (n === "search type") searchType = value.trim().toLowerCase();
    else if (n === "date") dateLabel = value.trim();
    if (!ALLOWED_FILTERS.has(n) && n !== "") refused.push(`${name}=${value}`);
  }
  if (refused.length > 0) {
    throw new Error(
      `Export was filtered (${refused.join(", ")}), so its rows are a subset of the property. Re-export with only Search type and Date set.`,
    );
  }
  return { searchType, dateLabel };
}

/** Sum of a parsed dimension file, for the import report. */
export function totalsOf(rows: GscExportRow[]): { rows: number; clicks: number; impressions: number } {
  return rows.reduce(
    (acc, r) => ({ rows: acc.rows + 1, clicks: acc.clicks + r.clicks, impressions: acc.impressions + r.impressions }),
    { rows: 0, clicks: 0, impressions: 0 },
  );
}
