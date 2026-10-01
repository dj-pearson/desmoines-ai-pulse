import { describe, it, expect } from "vitest";
import { formatUsd, summarizeAiSpend } from "@/lib/aiSpend";

const budgets = [
  { provider: "anthropic", daily_usd: "15.00", kill_switch: false },
  { provider: "openai", daily_usd: 5, kill_switch: false },
  { provider: "google", daily_usd: 5, kill_switch: false },
];

describe("summarizeAiSpend", () => {
  it("sums only the global rows, so per-caller rows are not double counted", () => {
    const s = summarizeAiSpend(
      [
        { subject: "global:anthropic", feature: "discover-chat", calls: 10, cost_usd: "0.500000" },
        { subject: "global:anthropic", feature: "nlp-search", calls: 40, cost_usd: 0.08 },
        { subject: "user:abc", feature: "discover-chat", calls: 10, cost_usd: 0.5 },
        { subject: "ip:1.2.3.4", feature: "nlp-search", calls: 40, cost_usd: 0.08 },
      ],
      budgets,
    );
    expect(s.totalUsd).toBeCloseTo(0.58);
    expect(s.totalCalls).toBe(50);
    expect(s.features.map((f) => f.feature)).toEqual(["discover-chat", "nlp-search"]);
    const anthropic = s.providers.find((p) => p.provider === "anthropic");
    expect(anthropic?.ratio).toBeCloseTo(0.58 / 15);
    expect(anthropic?.state).toBe("ok");
  });

  it("lists a budgeted provider with no spend today", () => {
    const s = summarizeAiSpend([], budgets);
    expect(s.providers.map((p) => p.provider).sort()).toEqual(["anthropic", "google", "openai"]);
    expect(s.totalUsd).toBe(0);
  });

  it("reports the state consume_ai_quota would refuse on, kill switch first", () => {
    const s = summarizeAiSpend(
      [{ subject: "global:openai", feature: "personalized-recs", calls: 3, cost_usd: 6 }],
      [
        { provider: "anthropic", daily_usd: 15, kill_switch: true },
        { provider: "openai", daily_usd: 5, kill_switch: false },
        { provider: "google", daily_usd: 5, kill_switch: false },
      ],
      [
        { provider: "anthropic", paused: true },
        { provider: "google", paused: true },
      ],
    );
    const state = Object.fromEntries(s.providers.map((p) => [p.provider, p.state]));
    expect(state).toEqual({ anthropic: "kill_switch", openai: "over_budget", google: "paused" });
  });

  it("keeps spend from a provider with no budget row, with no ratio", () => {
    const s = summarizeAiSpend([{ subject: "global:mystery", feature: "x", calls: 1, cost_usd: 0.2 }], []);
    expect(s.providers).toEqual([
      { provider: "mystery", dailyUsd: 0, spentUsd: 0.2, calls: 1, ratio: null, state: "ok" },
    ]);
  });
});

describe("formatUsd", () => {
  it("shows sub-cent amounts instead of $0.00", () => {
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(12.345)).toBe("$12.35");
  });
});
