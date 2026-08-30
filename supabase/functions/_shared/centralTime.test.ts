/**
 * Unit tests for Central Time conversion.
 * Run with: `deno test --allow-none supabase/functions/_shared/centralTime.test.ts`
 *
 * These pin the DST boundaries that the old `month >= 2 && month <= 10` guess in
 * ai-crawler got wrong. US DST: starts 2nd Sunday of March at 02:00 local,
 * ends 1st Sunday of November at 02:00 local.
 */
import {
  centralOffsetMinutes,
  centralOffsetString,
  centralWallClockFromUtc,
  centralWallClockToUtc,
} from "./centralTime.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

Deno.test("mid-summer is CDT (-05:00)", () => {
  assert(
    centralOffsetString(2026, 7, 15, 19, 0) === "-05:00",
    `July, got ${centralOffsetString(2026, 7, 15, 19, 0)}`,
  );
  assert(centralOffsetMinutes(2026, 7, 15) === -300, "July offset minutes");
});

Deno.test("mid-winter is CST (-06:00)", () => {
  assert(
    centralOffsetString(2027, 1, 15, 19, 0) === "-06:00",
    `January, got ${centralOffsetString(2027, 1, 15, 19, 0)}`,
  );
  assert(centralOffsetMinutes(2027, 1, 15) === -360, "January offset minutes");
});

Deno.test("early March is still CST — the old month-range guess said CDT", () => {
  // 2026 DST starts Sunday March 8. A March 6 show is CST (-06:00); the old
  // `month >= 2` check treated all of March as CDT and stored it an hour early.
  assert(
    centralOffsetString(2026, 3, 6, 18, 5) === "-06:00",
    `Mar 6 2026, got ${centralOffsetString(2026, 3, 6, 18, 5)}`,
  );
  assert(
    centralOffsetString(2026, 3, 7, 19, 0) === "-06:00",
    "Mar 7 2026 (day before the switch) is CST",
  );
  assert(
    centralOffsetString(2026, 3, 9, 19, 0) === "-05:00",
    "Mar 9 2026 (day after the switch) is CDT",
  );
});

Deno.test("most of November is CST — the old guess said CDT through Nov 30", () => {
  // 2026 DST ends Sunday November 1.
  assert(
    centralOffsetString(2026, 11, 14, 19, 0) === "-06:00",
    `Nov 14 2026, got ${centralOffsetString(2026, 11, 14, 19, 0)}`,
  );
  assert(
    centralOffsetString(2026, 10, 31, 19, 0) === "-05:00",
    "Oct 31 2026 is still CDT",
  );
});

Deno.test("Central wall clock converts to the correct UTC instant", () => {
  // A 7:00 PM CDT show is 00:00 UTC the next day.
  const summer = centralWallClockToUtc(2026, 7, 15, 19, 0, 0)!;
  assert(
    summer.toISOString() === "2026-07-16T00:00:00.000Z",
    `summer, got ${summer.toISOString()}`,
  );

  // A 7:00 PM CST show is 01:00 UTC the next day.
  const winter = centralWallClockToUtc(2026, 12, 5, 19, 0, 0)!;
  assert(
    winter.toISOString() === "2026-12-06T01:00:00.000Z",
    `winter, got ${winter.toISOString()}`,
  );

  // The bug case: a 6:05 PM March 6 game. CST → 00:05 UTC. The old guess said
  // CDT and produced 23:05 UTC the same day — an hour early.
  const marchGame = centralWallClockToUtc(2026, 3, 6, 18, 5, 0)!;
  assert(
    marchGame.toISOString() === "2026-03-07T00:05:00.000Z",
    `Mar 6 game, got ${marchGame.toISOString()}`,
  );
});

Deno.test("round-trips: UTC → Central wall clock → UTC", () => {
  for (
    const iso of [
      "2026-03-06T00:05:00.000Z",
      "2026-07-16T00:00:00.000Z",
      "2026-11-14T01:00:00.000Z",
      "2027-01-02T02:30:00.000Z",
    ]
  ) {
    const wall = centralWallClockFromUtc(iso);
    const m = wall.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    assert(m !== null, `wall clock shape for ${iso}: ${wall}`);
    const back = centralWallClockToUtc(
      Number(m![1]),
      Number(m![2]),
      Number(m![3]),
      Number(m![4]),
      Number(m![5]),
      Number(m![6]),
    )!;
    assert(
      back.toISOString() === iso,
      `round trip ${iso} → ${wall} → ${back.toISOString()}`,
    );
  }
});

Deno.test("midnight renders as 00, not 24", () => {
  const wall = centralWallClockFromUtc("2026-07-16T05:00:00.000Z"); // 00:00 CDT
  assert(wall === "2026-07-16 00:00:00", `got ${wall}`);
});

Deno.test("invalid components return null rather than an Invalid Date", () => {
  assert(centralWallClockToUtc(2026, 13, 45, 99, 99, 99) === null, "nonsense date");
});
