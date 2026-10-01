# AI citation prompts (SEO-049)

Twenty questions a Des Moines resident or visitor asks, each paired with the desmoinesinsider.com page that ought to be the cited answer. The baseline results live in `docs/seo/ai-citation-baseline-2026-10.csv`. `scripts/ai-citation-check.ts` reads the table below, so keep its shape (`| n | prompt | target | source |`) when editing.

## Baseline summary, 2026-10-01

**What was measured.** For each prompt: is desmoinesinsider.com among the sources, is catchdesmoines.com among them, and what else is. No AI answer engine actually ran this month. The two engines that did run are classic search result pages, Bing and DuckDuckGo top 10, used as a retrieval proxy. ChatGPT search and Copilot ground on Bing, and DuckDuckGo results are largely Bing's, so a page missing from these top 10s is unlikely to be cited by those assistants. Showing up is necessary, not sufficient: a "yes" here means we were retrievable, not that an assistant quoted us.

**Coverage: 6 of 160 cells produced a measurement** (8 engines x 20 prompts). That is too thin to call a baseline for anything except the four prompts it covers; November's run needs an API key or a connected browser to be worth comparing against.

- Bing: 20 requested, 4 usable. The other 16 came back as dictionary, shopping and news results for a single word of the prompt ("the contrary des moines menu" returned merriam-webster and thesaurus.com), which is what Bing serves a cookieless scraper. The script flags a SERP as degraded when fewer than 3 results match 2+ of the prompt's words, logs it "not run", and keeps the junk domains in `other_sources` as evidence.
- DuckDuckGo: 2 usable, then an HTTP 202 anomaly page on prompt 3. The remaining 18 are "not run"; it was not retried.
- Claude Code WebSearch (20): the session's search budget was already spent (200 of 200 calls) before this story started.
- Anthropic API with web search (20): no `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` in `.env` or the environment.
- Perplexity, Google AI Mode, ChatGPT, Gemini (80): no Claude-in-Chrome browser was connected.
- Brave Search, the index behind Claude's web search, answered the first probe with HTTP 429 and a captcha, so it isn't in the CSV as an engine.

**Results.** desmoinesinsider.com appeared in 4 of the 6 measured cells, catchdesmoines.com in 1.

| prompt | engine | us | Catch Des Moines |
|---|---|---|---|
| is jungle tea in des moines open | Bing | #6 | no |
| is jungle tea in des moines open | DuckDuckGo | #7 | no |
| atlas cafe west des moines menu | Bing | #3 | no |
| atlas cafe west des moines menu | DuckDuckGo | #3 | no |
| kura revolving sushi bar des moines | Bing | absent | no |
| things to do in des moines this weekend | Bing | absent | #1 |

**The three clearest gaps.**

1. **"This weekend" belongs to Catch Des Moines.** On the one weekend query that measured, catchdesmoines.com is #1 and `/events/this-weekend` is not in the top 10. The slots are taken by eventbrite.com, allevents.in, desmoinesregister.com, desmoinesgirl.com and greaterdsmusa.com: aggregators and local press, not just the CVB. This is the highest-volume intent in the set and the one an assistant answers from a single list page.
2. **Restaurant pages surface where the restaurant's own web presence is thin, and drop out where it isn't.** Three cells is a small sample, but the split is clean. Jungle Tea and Atlas Cafe have thin official sites and we rank #3 to #7 for them. Kura Revolving Sushi Bar has a chain site, and on Bing we drop out behind kurasushi.com, Yelp, DoorDash, restaurantji and checkle, even though Google gives the page 419 impressions at an average position of 7.4. Chain and well-listed restaurants are where a directory page has to carry facts the official site doesn't (hours by location, parking, what's nearby).
3. **Nothing measures an AI answer yet.** All 6 cells are search-result proxies. Whether ChatGPT, Perplexity or Google AI Mode quote us, or just retrieve us and cite Yelp, is unknown. Until a key or browser session runs the 120 AI-engine cells, no SEO-Q4 story can claim an AI-citation effect from this file.

Known without measuring: prompt 9 has no East Village brunch page to cite, so an engine that answers it correctly cannot cite us.

## Prompts

| n | prompt | target | source |
|---|---|---|---|
| 1 | is jungle tea in des moines open | /restaurants/jungle-tea | GSC: jungle tea (1,407 impr) |
| 2 | atlas cafe west des moines menu | /restaurants/atlas-caf | GSC: atlas cafe west des moines (28 clicks) |
| 3 | yard house west des moines hours | /restaurants/yard-house | GSC: yard house (1,265 impr) |
| 4 | kura revolving sushi bar des moines | /restaurants/kura-revolving-sushi-bar | GSC: kura revolving sushi bar (419 impr) |
| 5 | marv's mainstreet dive norwalk menu | /restaurants/marvs-mainstreet-dive | GSC: marvs norwalk (323 impr) |
| 6 | the contrary des moines menu | /restaurants/the-contrary | GSC: the contrary menu (811 impr) |
| 7 | canopy restaurant des moines | /restaurants/canopy | GSC: canopy des moines (37% CTR) |
| 8 | new restaurants des moines 2026 | /restaurants/new | GSC: 15 clicks, position 8.8 |
| 9 | best brunch in east village des moines | /things-to-do/brunch | keyword file: best brunch in des moines (500/mo), narrowed to a neighborhood |
| 10 | best brunch in des moines | /things-to-do/brunch | keyword file (500/mo) |
| 11 | things to do in des moines this weekend | /events/this-weekend | keyword file: /events/this-weekend live |
| 12 | free things to do in des moines this weekend | /events/free | keyword file (500/mo) |
| 13 | haunted houses near des moines | /articles/haunted-houses-near-des-moines | keyword file: haunted houses des moines (5,000/mo) |
| 14 | restaurants open now des moines | /restaurants/open-now | SEO landing route |
| 15 | playgrounds with splash pads des moines | /playgrounds | keyword file: splash pads des moines (500/mo) |
| 16 | big creek state park playground | /playgrounds/big-creek-state-park-playground | GSC: 3 clicks, position 4.3 |
| 17 | des moines festivals 2026 | /things-to-do/festivals | GSC: 133 impr, position 9.3 |
| 18 | things to do in east village des moines | /things-to-do/east-village | GSC: east village des moines (458 impr) |
| 19 | things to do in west des moines iowa | /things-to-do/west-des-moines | keyword file (5,000/mo) |
| 20 | kid friendly events in des moines this weekend | /events/kids | keyword file: /events/kids live |

The `target` is the page a correct answer should cite, not a claim that it ranks. Prompt 9 has no East Village brunch page; `/things-to-do/brunch` is the nearest, and the gap is the point of including it. Prompt 2's slug really is `atlas-caf` (the accented e was dropped when the slug was generated).

## Monthly re-run

Run on the first business day of the month and save as a new file, `docs/seo/ai-citation-baseline-YYYY-MM.csv`, so months can be diffed.

1. Automated part (Bing, DuckDuckGo, and the Anthropic API when a key is set):

   ```bash
   npx tsx scripts/ai-citation-check.ts --out docs/seo/ai-citation-baseline-2026-11.csv
   ```

   The Anthropic engine runs only when `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY`) is set in the shell and `@anthropic-ai/sdk` is installed (`npm i -D @anthropic-ai/sdk`). It asks `claude-opus-5-5` each prompt with the `web_search_20260209` tool and records the URLs it cites. Without the key it writes "not run" rows and says why. The script stops an engine at its first captcha or 429 and marks the remaining prompts "not run" rather than retrying.

2. Manual part (Perplexity, Google AI Mode, ChatGPT search, Gemini): in a signed-out or fresh browser profile, paste each prompt, open the sources panel, and fill the engine's rows. Pass the reason for anything skipped:

   ```bash
   npx tsx scripts/ai-citation-check.ts --out ... --skip "perplexity:reason" --skip "chatgpt:reason"
   ```

   Then edit those rows by hand with what each engine cited. Record "not run" with a reason rather than leaving a row blank, and never fill a row from memory.

3. Update the results section above: cells run, cited-us count per engine, and the gaps that changed.
