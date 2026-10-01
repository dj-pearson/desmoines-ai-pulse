/**
 * Refuses event titles that name a page, not an event (SEO-031).
 *
 * On 2025-07-26/27 the LLM extraction of https://www.milb.com/iowa/schedule
 * wrote two rows for 2026-09-26 at Principal Park: one titled "Schedule" (the
 * page heading) and one titled "Iowa Cubs" (the team, with no opponent). The
 * Iowa Cubs played no game that day; statsapi.mlb.com shows their 2026 season
 * ending at Omaha on 2026-09-20. The "Schedule" row was live at
 * /events/schedule-2026-09-26, ranking second for its query, titled
 * "Schedule - Sat, Sep 26 | Principal Park".
 *
 * Since 2026-05-11 milb.com/iowa goes through the statsapi adapter, which always
 * titles a game "Iowa Cubs vs <opponent from the API>". The other three sports
 * schedule domains still go through the model, and nothing stopped the model
 * returning the page heading or the bare team name as an event. This does.
 *
 * Two rules, both on the trimmed, case-folded title:
 *   1. A page label ("Schedule", "Tickets", "Calendar", ...) is never an
 *      event title, on any source.
 *   2. On a team-schedule source, a game title must name both sides: it has to
 *      contain a matchup separator (vs, v., at, @, x). A bare team name is the
 *      shape a schedule row takes when the opponent was not read, and the
 *      opponent is not something this pipeline may make up.
 *
 * Pure, so the Deno suite needs no network.
 */

/** Titles that are the name of a listing page or a button, not an event. */
const PAGE_LABEL_TITLES = new Set([
  "schedule",
  "full schedule",
  "team schedule",
  "game schedule",
  "season schedule",
  "calendar",
  "event calendar",
  "events",
  "event",
  "upcoming events",
  "tickets",
  "buy tickets",
  "single game tickets",
  "home",
  "game",
  "games",
  "home game",
  "home games",
  "upcoming games",
  "untitled event",
]);

/**
 * "Iowa Cubs vs Omaha", "Wisconsin vs. Iowa", "Iowa at Cleveland",
 * "Iowa @ Omaha", "Grand View University x Baker University". The separator
 * must stand between two non-empty sides.
 */
const MATCHUP = /\S\s+(?:vs\.?|v\.?|versus|at|@|x)\s+\S/i;

export type TitleVerdict = { ok: true } | { ok: false; reason: string };

function normalize(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isPageLabelTitle(title: string): boolean {
  return PAGE_LABEL_TITLES.has(normalize(title).replace(/[.:!]+$/, ""));
}

export function namesBothSides(title: string): boolean {
  return MATCHUP.test(title.trim());
}

/**
 * @param title    the extracted event title
 * @param isTeamSchedule true when the source is a team's game schedule (the
 *                 caller's isSportsScheduleDomain)
 */
export function checkEventTitle(title: unknown, isTeamSchedule: boolean): TitleVerdict {
  const t = typeof title === "string" ? title.trim() : "";
  if (!t) return { ok: false, reason: "no title" };
  if (isPageLabelTitle(t)) {
    return { ok: false, reason: `"${t}" is a page label, not an event` };
  }
  if (isTeamSchedule && !namesBothSides(t)) {
    return { ok: false, reason: `"${t}" names no opponent; a schedule row without one is not written` };
  }
  return { ok: true };
}
