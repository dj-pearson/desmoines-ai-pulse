/**
 * WEB-SEO-059. An event's geo_summary, geo_key_facts and geo_faq are written by
 * a model (generate-seo-content). They are shown, labelled AI-assisted, and
 * never published as FAQPage JSON-LD, the rule the restaurant page already
 * follows (src/lib/restaurantFaqs.ts, WP3.1).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { EventAiAnswers } from "@/components/events/EventAiAnswers";

const FAQ = [
  { question: "Is parking available?", answer: "The listing mentions a lot on the north side." },
  { question: "  ", answer: "dropped: no question" },
  { question: "Is it family friendly?", answer: "Yes, according to the listing." },
];

function mount(props: Parameters<typeof EventAiAnswers>[0]) {
  return render(
    <HelmetProvider>
      <EventAiAnswers {...props} />
    </HelmetProvider>,
  );
}

afterEach(cleanup);

describe("EventAiAnswers", () => {
  it("shows the questions and answers visibly, labelled AI-assisted", () => {
    mount({ title: "Jazz Night", faq: FAQ });
    expect(screen.getByRole("heading", { name: "Jazz Night: Questions and Answers" })).toBeTruthy();
    expect(screen.getByText("Is parking available?")).toBeTruthy();
    expect(screen.getByText("Yes, according to the listing.")).toBeTruthy();
    expect(screen.queryByText("dropped: no question")).toBeNull();
    expect(screen.getAllByText("AI-assisted")).toHaveLength(1);
  });

  it("publishes no JSON-LD at all, so no FAQPage", () => {
    mount({ title: "Jazz Night", summary: "A summary.", keyFacts: ["Fact one"], faq: FAQ });
    expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0);
    expect(document.documentElement.innerHTML).not.toContain("FAQPage");
  });

  it("labels the Quick Facts block too, and drops blank facts", () => {
    mount({ title: "Jazz Night", summary: "  A summary.  ", keyFacts: ["Fact one", "  "] });
    expect(screen.getByRole("heading", { name: "Quick Facts" })).toBeTruthy();
    expect(screen.getByText("A summary.")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getAllByText("AI-assisted")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: /Questions and Answers/ })).toBeNull();
  });

  it("renders nothing when the row has no GEO fields", () => {
    const { container } = mount({ title: "Jazz Night", summary: null, keyFacts: null, faq: null });
    expect(container.innerHTML).toBe("");
  });
});

describe("EventDetails source", () => {
  const code = readFileSync(resolve(__dirname, "../../../pages/EventDetails.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("routes geo_faq through EventAiAnswers, not FAQSection", () => {
    expect(code).not.toMatch(/<FAQSection/);
    expect(code).toMatch(/<EventAiAnswers[\s\S]*?faq=\{event\.geo_faq\}/);
  });
});
