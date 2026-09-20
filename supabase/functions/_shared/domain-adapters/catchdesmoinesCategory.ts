/**
 * schema.org @type -> the category vocabulary this project stores (WEB-BE-042 AC3).
 *
 * THE ADAPTER PARSED @type AND THEN THREW IT AWAY, stamping `category:
 * "Community"` on every event it produced. So every Catch Des Moines event
 * that arrived through this path was Community - concerts, Iowa Wild games,
 * Des Moines Playhouse runs, the lot - and the category filters on /events and
 * the "free events" and music/sports hubs could not see any of them.
 *
 * IT MATTERED MORE THAN A WRONG LABEL, because two live writers ingest this
 * source. The GitHub Actions Python crawler asks Sonnet for
 * Music/Sports/Arts/Community/Entertainment/Festival/Food
 * (crawlers/catchdesmoines_crawler.py:440) and gets a real answer; this adapter
 * wrote Community. Whichever landed first won, so one event's category
 * depended on which of two schedules happened to reach it - and the cheaper,
 * more accurate signal (the site's own ld+json) was the one being discarded.
 *
 * The vocabulary is deliberately the Python crawler's, not a new one: until
 * AC2 retires one of the two paths they have to agree, and inventing a third
 * spelling here would guarantee they never do. WEB-BE-049 owns normalising the
 * vocabulary itself.
 */
const TYPE_TO_CATEGORY: Record<string, string> = {
  MusicEvent: "Music",
  SportsEvent: "Sports",
  TheaterEvent: "Arts",
  DanceEvent: "Arts",
  VisualArtsEvent: "Arts",
  ExhibitionEvent: "Arts",
  LiteraryEvent: "Arts",
  ScreeningEvent: "Entertainment",
  ComedyEvent: "Entertainment",
  Festival: "Festival",
  FoodEvent: "Food",
  ChildrensEvent: "Community",
  SocialEvent: "Community",
  BusinessEvent: "Community",
  EducationEvent: "Community",
  CourseInstance: "Community",
  Event: "Community",
};

/**
 * "Community" stays the fallback - it is what this adapter has always written,
 * so an unmapped subtype behaves exactly as before rather than producing a
 * category nothing on the site filters on.
 */
export function categoryForEventType(t: unknown): string {
  if (typeof t !== "string") return "Community";
  return TYPE_TO_CATEGORY[t] ?? "Community";
}
