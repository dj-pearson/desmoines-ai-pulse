import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * WEB-FEAT-075: DealManager's picker read a linked restaurant by id and showed
 * its name, so a deal still stored against a merged duplicate looked like a
 * normal link. fetchLinkedDealVenue follows merged_into to the kept row and
 * mergedLinkNote says so.
 */
type Row = Record<string, unknown>;
const tables: Record<string, Record<string, Row>> = {};
const reads: Array<[string, string]> = [];
const selects: Array<[string, string]> = [];
let failWith: Error | null = null;

vi.mock("@/integrations/supabase/client", () => {
  function builder(table: string) {
    let id = "";
    const b: Record<string, unknown> = {};
    b.select = (cols: string) => {
      selects.push([table, cols]);
      return b;
    };
    b.eq = (_col: string, value: string) => {
      id = value;
      return b;
    };
    b.maybeSingle = () => {
      reads.push([table, id]);
      if (failWith) return Promise.resolve({ data: null, error: failWith });
      return Promise.resolve({ data: tables[table]?.[id] ?? null, error: null });
    };
    return b;
  }
  return { supabase: { from: (table: string) => builder(table) } };
});

import { fetchLinkedDealVenue, mergedLinkNote, MERGE_CHAIN_LIMIT } from "@/lib/dealVenueSearch";
import { DEAL_LINKED_RESTAURANT_COLUMNS } from "@/lib/listColumns";

function restaurant(id: string, name: string, mergedInto: string | null = null): Row {
  return { id, name, location: `${id} St`, is_merged: mergedInto !== null, merged_into: mergedInto };
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  reads.length = 0;
  selects.length = 0;
  failWith = null;
});

describe("fetchLinkedDealVenue", () => {
  it("returns a live restaurant as it is, with no merge note", async () => {
    tables.restaurants = { a: restaurant("a", "Noce") };
    const found = await fetchLinkedDealVenue("restaurant", "a");
    expect(found).toEqual({
      venue: { id: "a", name: "Noce", place: "a St" },
      mergedFrom: null,
      survivorMissing: false,
    });
    expect(mergedLinkNote(found!)).toBeNull();
    expect(selects).toContainEqual(["restaurants", DEAL_LINKED_RESTAURANT_COLUMNS]);
  });

  it("follows a merge chain to the kept row and names both", async () => {
    tables.restaurants = {
      a: restaurant("a", "Noce Jazz Club", "b"),
      b: restaurant("b", "Noce Jazz", "c"),
      c: restaurant("c", "Noce"),
    };
    const found = await fetchLinkedDealVenue("restaurant", "a");
    expect(found?.venue).toEqual({ id: "c", name: "Noce", place: "c St" });
    expect(found?.mergedFrom).toEqual({ id: "a", name: "Noce Jazz Club", place: "a St" });
    expect(mergedLinkNote(found!)).toBe(
      "Was linked to Noce Jazz Club (merged into Noce). Saving links Noce.",
    );
  });

  it("stops on a cycle and keeps the stored row, flagged as merged", async () => {
    tables.restaurants = {
      d: restaurant("d", "Dup One", "e"),
      e: restaurant("e", "Dup Two", "d"),
    };
    const found = await fetchLinkedDealVenue("restaurant", "d");
    expect(found).toEqual({
      venue: { id: "d", name: "Dup One", place: "d St" },
      mergedFrom: null,
      survivorMissing: true,
    });
    expect(mergedLinkNote(found!)).toBe("Dup One was merged, but the row it was merged into was not found.");
    expect(reads).toEqual([
      ["restaurants", "d"],
      ["restaurants", "e"],
    ]);
  });

  it("flags a merged row whose kept row is gone", async () => {
    tables.restaurants = { a: restaurant("a", "Gone Dup", "missing") };
    const found = await fetchLinkedDealVenue("restaurant", "a");
    expect(found?.survivorMissing).toBe(true);
    expect(found?.venue.id).toBe("a");
  });

  it("gives up after MERGE_CHAIN_LIMIT hops", async () => {
    const rows: Record<string, Row> = {};
    for (let i = 0; i <= MERGE_CHAIN_LIMIT + 1; i++) rows[`r${i}`] = restaurant(`r${i}`, `R${i}`, `r${i + 1}`);
    tables.restaurants = rows;
    const found = await fetchLinkedDealVenue("restaurant", "r0");
    expect(found?.survivorMissing).toBe(true);
    expect(reads.length).toBe(MERGE_CHAIN_LIMIT + 1);
  });

  it("returns null when the linked row does not exist", async () => {
    tables.restaurants = {};
    await expect(fetchLinkedDealVenue("restaurant", "nope")).resolves.toBeNull();
  });

  it("reads attractions and hotels without merge columns", async () => {
    tables.hotels = { h: { id: "h", name: "Hyatt", city: "Des Moines" } };
    const found = await fetchLinkedDealVenue("hotel", "h");
    expect(found).toEqual({
      venue: { id: "h", name: "Hyatt", place: "Des Moines" },
      mergedFrom: null,
      survivorMissing: false,
    });
    expect(selects).toContainEqual(["hotels", "id, name, city"]);
  });

  it("does not query for a type with no venue table", async () => {
    await expect(fetchLinkedDealVenue("event", "x")).resolves.toBeNull();
    expect(reads).toEqual([]);
  });

  it("throws the query error for the caller's handleError", async () => {
    failWith = new Error("boom");
    await expect(fetchLinkedDealVenue("restaurant", "a")).rejects.toThrow("boom");
  });
});
