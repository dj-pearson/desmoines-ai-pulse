/**
 * WEB-BE-071: the weekly menu refresh budget, and publishing that never leaves
 * a restaurant without its previous menu.
 * Run with: `deno test supabase/functions/_shared/menu/menuRefresh.test.ts`
 *
 * The in-memory store models the one trigger that matters here,
 * unmark_previous_menu_versions: making a row current clears is_current on
 * every other version of that restaurant.
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  countRefreshResults,
  type MenuPublishStore,
  publishMenu,
  remainingWeeklyBudget,
  WEEKLY_MENU_REFRESH_CAP,
} from "./menuRefresh.ts";

interface MenuRow {
  id: string;
  restaurant_id: string;
  is_current: boolean;
}

function fakeStore(options: { failItemsAt?: number; failPromote?: boolean; failInsert?: boolean } = {}) {
  const menus: MenuRow[] = [{ id: "old", restaurant_id: "r1", is_current: true }];
  const items: Record<string, unknown>[] = [];
  let itemCalls = 0;
  let next = 0;

  const setCurrent = (row: MenuRow) => {
    row.is_current = true;
    for (const other of menus) {
      if (other.restaurant_id === row.restaurant_id && other.id !== row.id) other.is_current = false;
    }
  };

  const store: MenuPublishStore = {
    insertDraft(row) {
      if (options.failInsert) return Promise.resolve({ error: "insert refused" });
      const menu: MenuRow = { id: `new-${next++}`, restaurant_id: String(row.restaurant_id), is_current: false };
      menus.push(menu);
      // The trigger fires on INSERT too: a row inserted as current would
      // unmark the old one right here.
      if (row.is_current === true) setCurrent(menu);
      return Promise.resolve({ id: menu.id });
    },
    insertItems(rows) {
      itemCalls++;
      if (options.failItemsAt === itemCalls) return Promise.resolve("items refused");
      items.push(...rows);
      return Promise.resolve(null);
    },
    makeCurrent(menuId) {
      if (options.failPromote) return Promise.resolve("update refused");
      const row = menus.find((m) => m.id === menuId);
      if (row) setCurrent(row);
      return Promise.resolve(null);
    },
    discard(menuId) {
      const i = menus.findIndex((m) => m.id === menuId);
      if (i >= 0) menus.splice(i, 1);
      return Promise.resolve();
    },
  };

  const current = () => menus.filter((m) => m.is_current).map((m) => m.id);
  return { store, menus, items, current };
}

const items = (n: number) => (menuId: string) =>
  Array.from({ length: n }, (_, i) => ({ menu_id: menuId, item_name: `Dish ${i}` }));

Deno.test("publishMenu: a complete menu replaces the old one", async () => {
  const { store, current, items: written } = fakeStore();
  const out = await publishMenu(store, { restaurant_id: "r1" }, items(3), 3);
  assertEquals(out.ok, true);
  assertEquals(current(), ["new-0"]);
  assertEquals(written.length, 3);
});

Deno.test("publishMenu: an items failure keeps the previous menu current", async () => {
  const { store, current, menus } = fakeStore({ failItemsAt: 2 });
  const out = await publishMenu(store, { restaurant_id: "r1" }, items(150), 150);
  assertEquals(out.ok, false);
  assertEquals(current(), ["old"]);
  // The draft is gone, so no half-written version lingers in the history.
  assertEquals(menus.map((m) => m.id), ["old"]);
});

Deno.test("publishMenu: a failed promote keeps the previous menu current", async () => {
  const { store, current } = fakeStore({ failPromote: true });
  const out = await publishMenu(store, { restaurant_id: "r1" }, items(2), 2);
  assertEquals(out.ok, false);
  assertEquals(current(), ["old"]);
});

Deno.test("publishMenu: an empty extraction writes nothing", async () => {
  const { store, current, menus } = fakeStore();
  const out = await publishMenu(store, { restaurant_id: "r1" }, items(0), 0);
  assertEquals(out.ok, false);
  assertEquals(current(), ["old"]);
  assertEquals(menus.length, 1);
});

Deno.test("publishMenu: a caller-supplied is_current = true is overridden", async () => {
  const { store, current } = fakeStore({ failItemsAt: 1 });
  await publishMenu(store, { restaurant_id: "r1", is_current: true }, items(1), 1);
  assertEquals(current(), ["old"]);
});

Deno.test("publishMenu: a failed draft insert reports and writes nothing", async () => {
  const { store, current } = fakeStore({ failInsert: true });
  const out = await publishMenu(store, { restaurant_id: "r1" }, items(1), 1);
  assertEquals(out, { ok: false, error: "DB insert error: insert refused" });
  assertEquals(current(), ["old"]);
});

Deno.test("remainingWeeklyBudget counts down from the cap and stops at zero", () => {
  assertEquals(WEEKLY_MENU_REFRESH_CAP, 25);
  assertEquals(remainingWeeklyBudget(0), 25);
  assertEquals(remainingWeeklyBudget(24), 1);
  assertEquals(remainingWeeklyBudget(25), 0);
  assertEquals(remainingWeeklyBudget(40), 0);
  // An unreadable count is not a licence to run unbounded.
  assertEquals(remainingWeeklyBudget(Number.NaN), 0);
  assertEquals(remainingWeeklyBudget(-3), 0);
});

Deno.test("countRefreshResults: skips do not count against the cap", () => {
  assertEquals(
    countRefreshResults([
      { success: true, skipped: false },
      { success: false, skipped: false },
      { success: true, skipped: true },
    ]),
    { attempted: 2, succeeded: 1, failed: 1, skipped: 1 },
  );
});
