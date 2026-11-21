/**
 * WEB-SEO-060. Model-written geo_faq (events via generate-seo-content, hotels
 * via the scripts/content-fill agent batch) is shown, labelled AI-assisted, and
 * never published as FAQPage JSON-LD. AiAnswersList is the shared visible half.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { AiAnswersList } from "@/components/AiAnswersList";

const FAQ = [
  { question: "Is breakfast included?", answer: "Yes. AAA lists breakfast as included." },
  { question: "", answer: "dropped: no question" },
  { question: "Does the hotel allow pets?", answer: "Yes, for an additional fee." },
];

function mount(faq: unknown) {
  return render(
    <HelmetProvider>
      <AiAnswersList title="Questions about Fixture Inn" faq={faq} tooltip="Written with AI." headingId="t-ai" />
    </HelmetProvider>,
  );
}

afterEach(cleanup);

describe("AiAnswersList", () => {
  it("shows each answer under a labelled heading", () => {
    mount(FAQ);
    const heading = screen.getByRole("heading", { name: "Questions about Fixture Inn" });
    expect(heading.id).toBe("t-ai");
    expect(heading.closest("section")?.getAttribute("aria-labelledby")).toBe("t-ai");
    expect(screen.getByText("Is breakfast included?")).toBeTruthy();
    expect(screen.getByText("Yes, for an additional fee.")).toBeTruthy();
    expect(screen.queryByText("dropped: no question")).toBeNull();
    expect(screen.getAllByText("AI-assisted")).toHaveLength(1);
  });

  it("publishes no JSON-LD, so no FAQPage", () => {
    mount(FAQ);
    expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0);
    expect(document.documentElement.innerHTML).not.toContain("FAQPage");
  });

  it("renders nothing for an empty or malformed geo_faq", () => {
    for (const faq of [null, [], "not json", [{ question: "  ", answer: "x" }]]) {
      const { container, unmount } = mount(faq);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });
});

describe("HotelDetails source", () => {
  const code = readFileSync(resolve(__dirname, "../../pages/HotelDetails.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("routes geo_faq through AiAnswersList, not FAQSection", () => {
    expect(code).not.toMatch(/FAQSection/);
    expect(code).toMatch(/<AiAnswersList[\s\S]*?faq=\{hotel\.geo_faq\}/);
  });
});
