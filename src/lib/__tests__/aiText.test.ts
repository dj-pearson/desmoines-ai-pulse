import { describe, it, expect } from "vitest";
import { markdownBlocks, markdownToPlainText, stripAiLabels } from "@/lib/aiText";

/** The stored enhanced_description of event 57564c69 ("Schedule"), shortened. */
const SCHEDULE = `**Enhanced Event Description:**

**Iowa Cubs Baseball at Principal Park**

Experience the thrill of America's pastime at beautiful Principal Park! Join us for an exciting professional baseball game.

Don't miss this opportunity to catch future big leaguers in action!

**Location:**`;

/** Event 4e190bd2 ("Iowa Cubs"): a bold heading and a two-field footer. */
const CUBS = `**Professional Baseball Action at Principal Park**

Experience the excitement of live baseball as the Iowa Cubs take the field.

**Category:** Sports
**Location:** Principal Park`;

/** The shape of 222 restaurant ai_writeup rows. */
const WRITEUP = `# Table 128 | New American Dining in Des Moines

Tucked inside the Gray's Landing development at 220 SW 9th Street, Table 128
serves New American food.

## What to order

- The *seasonal* menu
- **Brunch** on weekends`;

describe("stripAiLabels", () => {
  it("removes the leading model label and the empty trailing field", () => {
    const out = stripAiLabels(SCHEDULE);
    expect(out.startsWith("**Iowa Cubs Baseball at Principal Park**")).toBe(true);
    expect(out).not.toMatch(/Enhanced Event Description/i);
    expect(out).not.toMatch(/Location:/);
    expect(out.endsWith("in action!")).toBe(true);
  });

  it("removes a bolded key/value footer and keeps the heading", () => {
    const out = stripAiLabels(CUBS);
    expect(out).toBe(
      "**Professional Baseball Action at Principal Park**\n\nExperience the excitement of live baseball as the Iowa Cubs take the field.",
    );
  });

  it("strips an inline label but keeps the sentence after it", () => {
    expect(stripAiLabels("Description: Join us for trivia night.")).toBe("Join us for trivia night.");
    expect(stripAiLabels("**Event Summary:** Live jazz on the patio.")).toBe("Live jazz on the patio.");
    expect(stripAiLabels("## Enhanced Description\nLive jazz.")).toBe("Live jazz.");
  });

  it("strips a chatty preamble line", () => {
    expect(stripAiLabels("Here's an enhanced description of the event:\n\nLive jazz.")).toBe("Live jazz.");
  });

  it("leaves ordinary text alone, including text that merely mentions a description", () => {
    const plain = "Description of the venue follows on the official site. Doors at 7.";
    expect(stripAiLabels(plain)).toBe(plain);
    expect(stripAiLabels("On September 11 we **remember, reflect, and serve.**")).toBe(
      "On September 11 we **remember, reflect, and serve.**",
    );
    expect(stripAiLabels("Tickets: $20 at the door.")).toBe("Tickets: $20 at the door.");
  });

  it("keeps a lone field line rather than emptying the text", () => {
    expect(stripAiLabels("**Location:** Principal Park")).toBe("**Location:** Principal Park");
  });

  it("handles null, undefined and CRLF", () => {
    expect(stripAiLabels(null)).toBe("");
    expect(stripAiLabels(undefined)).toBe("");
    expect(stripAiLabels("**Description:**\r\n\r\nHello.")).toBe("Hello.");
  });
});

describe("markdownBlocks", () => {
  it("flags headings and list items as their own blocks, with markers removed", () => {
    expect(markdownBlocks(WRITEUP)).toEqual([
      { text: "Table 128 | New American Dining in Des Moines", heading: true },
      {
        text: "Tucked inside the Gray's Landing development at 220 SW 9th Street, Table 128 serves New American food.",
        heading: false,
      },
      { text: "What to order", heading: true },
      { text: "The seasonal menu", heading: false },
      { text: "Brunch on weekends", heading: false },
    ]);
  });
});

describe("markdownToPlainText", () => {
  it("gives the Schedule row a clean sentence run with no label or asterisks", () => {
    const out = markdownToPlainText(SCHEDULE);
    expect(out).toBe(
      "Iowa Cubs Baseball at Principal Park. Experience the thrill of America's pastime at beautiful Principal Park! Join us for an exciting professional baseball game. Don't miss this opportunity to catch future big leaguers in action!",
    );
  });

  it("removes links, code and emphasis but keeps snake_case and lone asterisks", () => {
    expect(markdownToPlainText("See [the listing](https://x.test) for `details`, my_var and 5* rating.")).toBe(
      "See the listing for details, my_var and 5* rating.",
    );
  });

  it("returns empty for empty input", () => {
    expect(markdownToPlainText("")).toBe("");
    expect(markdownToPlainText(null)).toBe("");
  });
});
