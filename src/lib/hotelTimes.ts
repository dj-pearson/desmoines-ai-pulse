/**
 * Hotel check-in and check-out times, as schema.org wants them (plan-stay-pass2
 * WP2 item 11).
 *
 * `hotels.check_in_time` is free text. The seed wrote "15:00", the old admin
 * import wrote "3:00 PM", and an editor can type anything. schema.org's
 * checkinTime is a Time, so "3:00 PM" in JSON-LD is an invalid value, and
 * "after 3" is worse. This returns "HH:MM" for the forms we can read with
 * certainty and null for everything else, so the caller omits the property
 * instead of guessing.
 */

const TWELVE_HOUR = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i;
const TWENTY_FOUR_HOUR = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "15:00" from "3:00 PM", "3 pm", "15:00" or "15:00:00"; otherwise null. */
export function parseHotelTime(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;

  const twelve = TWELVE_HOUR.exec(text);
  if (twelve) {
    const hour = Number(twelve[1]);
    const minute = twelve[2] === undefined ? 0 : Number(twelve[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const isPm = twelve[3].toLowerCase() === "p";
    const h24 = (hour % 12) + (isPm ? 12 : 0);
    return `${pad(h24)}:${pad(minute)}`;
  }

  const twentyFour = TWENTY_FOUR_HOUR.exec(text);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    const second = twentyFour[3] === undefined ? 0 : Number(twentyFour[3]);
    if (hour > 23 || minute > 59 || second > 59) return null;
    return `${pad(hour)}:${pad(minute)}`;
  }

  return null;
}
