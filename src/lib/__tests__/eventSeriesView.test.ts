import { describe, expect, it } from "vitest";
import { getEventSeries, type EventSeriesDef } from "@/lib/eventSeries";
import {
  buildEventSeriesJsonLd,
  buildSeriesView,
  editionDateLabel,
  isModeratorHidden,
  unannouncedLabel,
  type SeriesEventRow,
} from "@/lib/eventSeriesView";

function series(slug: string): EventSeriesDef {
  const def = getEventSeries(slug);
  if (!def) throw new Error(`no series ${slug}`);
  return def;
}

let nextId = 0;
/** 00:00 UTC is 7 pm Central the evening before, so start at 23:00 UTC (6 pm Central same day). */
function row(title: string, day: string, extra: Partial<SeriesEventRow> = {}): SeriesEventRow {
  const start = `${day}T23:00:00+00:00`;
  return {
    id: `id-${++nextId}`,
    title,
    date: start,
    event_start_utc: start,
    venue: "Venue",
    location: null,
    city: "Des Moines",
    source_url: null,
    is_hidden: false,
    hidden_at: null,
    archived_at: null,
    ...extra,
  } as unknown as SeriesEventRow;
}

const NOW = new Date("2026-10-01T15:00:00Z");

describe("buildSeriesView", () => {
  it("picks the edition still to come and lists earlier years newest first", () => {
    const def = series("cloris-awards");
    const view = buildSeriesView(
      def,
      [
        row("10th Annual Cloris Awards", "2025-08-31", { is_hidden: true, hidden_at: "2025-09-10T00:00:00Z" }),
        row("11th Annual Cloris Awards", "2026-08-30", { is_hidden: true, hidden_at: "2026-09-10T00:00:00Z" }),
        row("12th Annual Cloris Awards", "2027-08-29"),
      ],
      NOW,
    );
    expect(view.current?.year).toBe(2027);
    expect(view.past.map((e) => e.year)).toEqual([2026, 2025]);
    expect(view.unannouncedYear).toBeNull();
    expect(view.total).toBe(3);
  });

  it("says next year's date is not announced when every edition is over", () => {
    const view = buildSeriesView(
      series("jazz-in-july"),
      ["07", "14", "21", "28"].map((d) =>
        row(`Jazz in July 2026: Night ${d}`, `2026-07-${d}`, {
          venue: "Hoyt Sherman Place",
          is_hidden: true,
          hidden_at: "2026-08-05T00:00:00Z",
        }),
      ),
      NOW,
    );
    expect(view.current).toBeNull();
    expect(view.unannouncedYear).toBe(2027);
    expect(unannouncedLabel(view.unannouncedYear as number)).toBe("2027 date not announced yet");
    expect(view.past[0].instances).toHaveLength(4);
    expect(editionDateLabel(view.past[0])).toBe("Tuesday, July 7 to Tuesday, July 28, 2026");
  });

  it("never names a year already past as not announced", () => {
    const view = buildSeriesView(
      series("cloris-awards"),
      [row("Cloris Awards", "2024-08-30", { is_hidden: true, hidden_at: "2024-09-10T00:00:00Z" })],
      NOW,
    );
    expect(view.unannouncedYear).toBe(2026);
  });

  it("links a live date, lists a sweep-hidden one without a link, and drops a moderator-hidden one", () => {
    const def = series("panda-fest");
    const swept = row("Panda Fest 2025", "2025-10-03", { is_hidden: true, hidden_at: "2025-10-12T08:00:00Z" });
    const takenDown = row("Panda Fest 2025", "2025-10-04", { is_hidden: true, hidden_at: "2025-09-01T08:00:00Z" });
    const live = row("Panda Fest 2026", "2026-10-02");
    const view = buildSeriesView(def, [swept, takenDown, live], NOW);

    expect(isModeratorHidden(takenDown)).toBe(true);
    expect(isModeratorHidden(swept)).toBe(false);
    expect(view.current?.instances[0].href).toBe("/events/panda-fest-2026-2026-10-02");
    expect(view.past[0].instances.map((i) => [i.day, i.href])).toEqual([["2025-10-03", null]]);
  });

  it("links an archived date (it renders as a past event) but does not call it current", () => {
    const view = buildSeriesView(
      series("panda-fest"),
      [row("Panda Fest 2026", "2026-10-02", { archived_at: "2026-09-30T00:00:00Z" })],
      NOW,
    );
    expect(view.current).toBeNull();
    expect(view.past[0].instances[0].href).toBe("/events/panda-fest-2026-2026-10-02");
  });

  it("keeps one row per day, preferring a live row and then the shorter title", () => {
    const view = buildSeriesView(
      series("hinterland-music-festival"),
      [
        row("Hinterland Music Festival (4 Day Pass) with KATSEYE, Lorde", "2027-07-29"),
        row("Hinterland 2027 Music Festival", "2027-07-29"),
        row("Hinterland Music Festival (Friday Pass) with Lorde", "2027-07-30"),
      ],
      NOW,
    );
    expect(view.current?.instances.map((i) => i.row.title)).toEqual([
      "Hinterland 2027 Music Festival",
      "Hinterland Music Festival (Friday Pass) with Lorde",
    ]);
    expect(view.total).toBe(2);
  });

  it("ignores rows the loose database filter let through", () => {
    const view = buildSeriesView(
      series("beaverdale-fall-festival"),
      [
        row("Beaverdale Fall Festival", "2026-09-18"),
        row("Backyard BBQ Contest at Beaverdale Fall Festival", "2026-09-19"),
      ],
      NOW,
    );
    expect(view.total).toBe(1);
  });

  it("runs an edition to its end_date", () => {
    const view = buildSeriesView(
      series("center-grove-orchard-pumpkin-fest"),
      [
        row("Pumpkin Fest", "2026-10-01", {
          venue: "Center Grove Orchard",
          end_date: "2026-11-07T05:59:00+00:00",
          time_tbd: true,
        }),
      ],
      NOW,
    );
    expect(view.current?.lastDay).toBe("2026-11-06");
    expect(editionDateLabel(view.current!)).toBe("Thursday, October 1 to Friday, November 6, 2026");
  });

  it("takes the official link from the newest row on the organiser's host", () => {
    const view = buildSeriesView(
      series("panda-fest"),
      [
        row("Panda Fest 2025", "2025-10-03", {
          source_url: "https://www.pandafests.com/2025",
          is_hidden: true,
          hidden_at: "2025-10-12T00:00:00Z",
        }),
        row("Panda Fest 2026", "2026-10-02", { source_url: "https://www.pandafests.com/" }),
      ],
      NOW,
    );
    expect(view.officialUrl).toBe("https://www.pandafests.com/");
  });
});

describe("buildEventSeriesJsonLd", () => {
  it("references a live instance's Event by @id and gives a gone one no URL", () => {
    const def = series("panda-fest");
    const view = buildSeriesView(
      def,
      [
        row("Panda Fest 2025", "2025-10-03", { is_hidden: true, hidden_at: "2025-10-12T00:00:00Z" }),
        row("Panda Fest 2026", "2026-10-02", { source_url: "https://www.pandafests.com/" }),
      ],
      NOW,
    );
    const ld = buildEventSeriesJsonLd(def, view);
    expect(ld["@type"]).toBe("EventSeries");
    expect(ld["@id"]).toBe("https://desmoinesinsider.com/events/series/panda-fest#series");
    expect(ld.sameAs).toEqual(["https://www.pandafests.com/"]);
    const subs = ld.subEvent ?? [];
    expect(subs).toHaveLength(2);
    expect(subs[0]).toMatchObject({
      "@type": "Event",
      "@id": "https://desmoinesinsider.com/events/panda-fest-2026-2026-10-02#event",
      url: "https://desmoinesinsider.com/events/panda-fest-2026-2026-10-02",
    });
    expect(subs[1]).not.toHaveProperty("url");
    expect(subs[1]).not.toHaveProperty("@id");
    expect(subs[1].startDate).toMatch(/^2025-10-03/);
  });

  it("has no subEvent with no rows", () => {
    const def = series("eerie-evenings");
    const ld = buildEventSeriesJsonLd(def, buildSeriesView(def, [], NOW));
    expect(ld).not.toHaveProperty("subEvent");
    expect(ld.name).toBe("Eerie Evenings at the Botanical Garden");
  });
});
