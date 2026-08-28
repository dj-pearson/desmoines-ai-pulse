/**
 * DMI-007 — the extraction prompts, declared once and rendered by both callers.
 *
 * WHY. `firecrawl-scraper` and the hub's new ingest run are about to extract
 * events from the same pages with the same intent, and a copied prompt is how
 * the two paths come to disagree about what an event is. This repo already
 * carries the scar tissue for exactly that: `htmlContentWindow.ts` exists, in
 * its own header, "so the two paths can't drift again."
 *
 * AND IT HAS ALREADY HAPPENED HERE, WHICH IS WORTH KNOWING BEFORE READING ON.
 * Measured 2026-08-28: `ai-crawler/index.ts` holds its OWN copy of
 * `isSportsScheduleDomain`, `getSportsSchedulePrompt` and the category map, and
 * the sports prompt has drifted — ai-crawler's carries roughly seventeen extra
 * lines of date-conversion and ticket-url instruction that firecrawl-scraper's
 * does not, and the two window their content differently (a 25,000-character
 * substring here, a pre-windowed `relevantContent` there). This module holds
 * FIRECRAWL-SCRAPER'S text verbatim, because this story's contract is that its
 * behaviour is unchanged. Folding ai-crawler in means choosing between two
 * prompts, which is a decision with a measurable output and belongs in its own
 * story rather than smuggled into a refactor.
 *
 * WHY JSON WITH TOKENS RATHER THAN A TEMPLATE FUNCTION. The second caller is
 * the hub, which is Node and cannot import a `.ts` module. A TypeScript
 * template would have forced the prompt TEXT to be copied across the runtime
 * boundary, which is the thing being prevented. So the text is data and each
 * runtime keeps its own ten-line substitution: what can drift is the prompt,
 * and a `String.replaceAll` cannot.
 *
 * WHY THE FILE IS IMPORTED RATHER THAN READ AT RUNTIME. An edge function is
 * bundled, so a static import guarantees the data ships with the code and a
 * genuinely missing file is a build failure — louder than any runtime refusal.
 * What can still go wrong after a bad edit is a template that is present and
 * WRONG: a missing category, an empty string, a placeholder nobody filled. Those
 * are the named refusals below, and they are named because an empty prompt sent
 * to a model returns a confident empty array, which reads exactly like a page
 * that listed no events.
 */
import data from './eventExtraction.json' with { type: 'json' };

export type PromptCategory = 'events' | 'events-sports' | 'restaurants';

export interface PromptVars {
  URL?: string;
  CONTENT?: string;
  CURRENT_DATE?: string;
  CURRENT_YEAR?: string;
  TEAM_NAME?: string;
  VENUE?: string;
  DEFAULT_TICKET_BASE?: string;
}

interface CategoryData {
  contentWindow: number;
  requires: string[];
  template: string;
}

/** How many characters of page content this category's prompt is built to hold.
 *  It differs per category (sports reads 25,000, the others 15,000) and used to
 *  be an inline `.substring()` at the call site, where the difference was
 *  invisible to anyone not reading both lines. */
export function contentWindowFor(category: PromptCategory): number {
  return categoryOrThrow(category).contentWindow;
}

export function promptCategories(): string[] {
  return Object.keys((data as { categories: Record<string, CategoryData> }).categories);
}

function categoryOrThrow(category: string): CategoryData {
  const categories = (data as { categories?: Record<string, CategoryData> }).categories;
  if (!categories || typeof categories !== 'object') {
    throw new Error(
      'PROMPT_DATA_UNUSABLE: _shared/prompts/eventExtraction.json has no `categories` object. '
      + 'Extraction cannot run without a prompt; it is not falling back to an empty one.',
    );
  }
  const found = categories[category];
  if (!found) {
    throw new Error(
      `PROMPT_CATEGORY_MISSING: no prompt declared for "${category}" in `
      + `_shared/prompts/eventExtraction.json (declared: ${Object.keys(categories).join(', ') || 'none'}).`,
    );
  }
  if (typeof found.template !== 'string' || found.template.trim() === '') {
    throw new Error(
      `PROMPT_TEMPLATE_EMPTY: the "${category}" prompt is present but empty. `
      + 'An empty prompt returns a confident empty array, which is indistinguishable from a page that listed nothing.',
    );
  }
  return found;
}

/**
 * Render one category's prompt.
 *
 * A REQUIRED PLACEHOLDER LEFT UNFILLED IS A REFUSAL, NOT A BLANK. Sending a
 * prompt that still reads `{{CURRENT_DATE}}` produces plausible output with
 * every date wrong by up to a year — this repo has already paid for that once,
 * when a hardcoded "July 30, 2025" made the model stamp bare month/day values
 * with a past year and the future filter then dropped them silently.
 */
export function renderExtractionPrompt(category: PromptCategory, vars: PromptVars): string {
  const cat = categoryOrThrow(category);
  let out = cat.template;
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined || value === null) continue;
    out = out.split(`{{${key}}}`).join(String(value));
  }
  const unfilled = (cat.requires || []).filter((p) => out.includes(p));
  if (unfilled.length > 0) {
    throw new Error(
      `PROMPT_PLACEHOLDER_UNFILLED: the "${category}" prompt still contains ${unfilled.join(', ')}. `
      + 'Rendering it anyway would send the model a literal placeholder and get plausible, wrong answers back.',
    );
  }
  return out;
}
