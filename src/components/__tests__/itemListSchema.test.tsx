/**
 * ItemListSchema must not make a claim the page contradicts.
 *
 * Both cases below were measured on production 2026-08-28, not invented:
 * /restaurants served an ItemList with numberOfItems 0 and zero elements
 * while rendering six restaurants, and before it was fixed Restaurants.tsx
 * declared the collection total (478) against 20 supplied elements.
 */
import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import ItemListSchema from "@/components/schema/ItemListSchema";

/** Every ItemList node Helmet has committed to document.head right now. */
function inHead() {
  const tags = document.head.querySelectorAll(
    'script[type="application/ld+json"]',
  );
  return [...tags]
    .map((t) => JSON.parse(t.textContent ?? "{}"))
    .filter((n) => n["@type"] === "ItemList");
}

function renderList(items: { name: string; url: string }[]) {
  render(
    <HelmetProvider>
      <ItemListSchema name="Test list" items={items} />
    </HelmetProvider>,
  );
}

/**
 * waitFor must ASSERT, not just read. The first version of this returned
 * inHead() straight out of waitFor, so waitFor saw no throw, returned on the
 * first tick before Helmet had committed anything, and the empty-list case
 * passed for the wrong reason - it read zero ItemLists from a head that had
 * not been written yet.
 */
async function waitForList() {
  return await waitFor(() => {
    const found = inHead();
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
}

const THREE = [
  { name: "A", url: "https://example.com/a" },
  { name: "B", url: "https://example.com/b" },
  { name: "C", url: "https://example.com/c" },
];

describe("ItemListSchema", () => {
  it("emits nothing at all for an empty list", async () => {
    // Not an ItemList of nothing, which is what /restaurants shipped. The
    // non-empty case below is what proves this assertion is not vacuous: the
    // same harness does commit a list when there is one to commit.
    renderList([]);
    await expect(waitForList()).rejects.toThrow();
    expect(inHead()).toHaveLength(0);
  });

  it("counts the elements it actually supplies", async () => {
    renderList(THREE);
    const [list] = await waitForList();
    expect(list.numberOfItems).toBe(3);
    expect(list.itemListElement).toHaveLength(3);
    // The positive control: a passing test here must mean real content,
    // not an empty list agreeing with an empty count.
    expect(list.itemListElement[0].url).toBe("https://example.com/a");
    expect(list.itemListElement[2].position).toBe(3);
  });
});
