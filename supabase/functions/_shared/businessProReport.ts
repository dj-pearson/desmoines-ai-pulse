/**
 * The Business Pro weekly email (growth roadmap #3, part 3): pure text, no
 * network, so _tests/business-pro-report.test.ts can check every line.
 *
 * One email per owner per listing. The numbers are whatever
 * business_pro_weekly_report_rows() (20261102000007) returned; nothing here
 * estimates or rounds a count.
 */
import { escapeHtml } from "./escapeHtml.ts";

export interface WeeklyReportRow {
  user_id: string;
  email: string;
  listing_type: "restaurant" | "attraction";
  listing_id: string;
  listing_name: string | null;
  week_start: string;
  week_end: string;
  views: number;
  shares: number;
  clicks: number;
  prev_views: number;
  prev_shares: number;
  prev_clicks: number;
}

/**
 * "up 50% on the week before", "the same as the week before", "none the week
 * before". A percentage from a zero base is not a number, so it is not shown.
 */
export function weekChange(now: number, prev: number): string {
  if (now === prev) return "the same as the week before";
  if (prev === 0) return "none the week before";
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return "about the same as the week before";
  return `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on the week before`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 26 to Nov 1" from two ISO dates, read as calendar days (no time zone shift). */
export function weekLabel(start: string, end: string): string {
  const fmt = (d: string) => {
    const [, m, day] = d.split("-").map(Number);
    return `${MONTHS[m - 1]} ${day}`;
  };
  return `${fmt(start)} to ${fmt(end)}`;
}

export interface WeeklyReportEmail {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export function buildWeeklyReport(row: WeeklyReportRow, siteUrl: string): WeeklyReportEmail {
  const name = row.listing_name?.trim() || "your listing";
  const week = weekLabel(row.week_start, row.week_end);
  const dashboard = `${siteUrl.replace(/\/+$/, "")}/business`;
  const lines: Array<[string, number, number]> = [
    ["Page views", row.views, row.prev_views],
    ["Contact and website clicks", row.clicks, row.prev_clicks],
    ["Shares", row.shares, row.prev_shares],
  ];

  const subject = `${name}: ${row.views.toLocaleString("en-US")} page views last week`;

  const bodyText = [
    `Last week on Des Moines Insider (${week}), ${name} had:`,
    "",
    ...lines.map(([label, n, p]) => `${label}: ${n.toLocaleString("en-US")}, ${weekChange(n, p)}`),
    "",
    `Your rank among similar places, the daily numbers and a spreadsheet download are on your dashboard: ${dashboard}`,
    "",
    "Counts include only visitors who allowed analytics cookies, so your real traffic is higher. Weeks run Monday to Sunday, Central time.",
    "You get this because Business Pro is on for this listing. Cancelling Business Pro from the dashboard stops it.",
  ].join("\n");

  const rowsHtml = lines
    .map(
      ([label, n, p]) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(label)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${n.toLocaleString("en-US")}</td>
  <td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;color:#555;">${escapeHtml(weekChange(n, p))}</td>
</tr>`,
    )
    .join("\n");

  const bodyHtml = `<h1 style="font-size:20px;margin:0 0 8px;">${escapeHtml(name)}, last week</h1>
<p style="margin:0 0 16px;color:#555;">${escapeHtml(week)}, on Des Moines Insider.</p>
<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
${rowsHtml}
</table>
<p style="margin:0 0 20px;"><a href="${escapeHtml(dashboard)}" style="color:#0b5cad;font-weight:600;">See your rank, the daily numbers and the spreadsheet download</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#555;">Counts include only visitors who allowed analytics cookies, so your real traffic is higher. Weeks run Monday to Sunday, Central time.</p>
<p style="margin:0;font-size:13px;color:#555;">You get this because Business Pro is on for this listing. Cancelling Business Pro from the dashboard stops it.</p>`;

  return { subject, bodyHtml, bodyText };
}
