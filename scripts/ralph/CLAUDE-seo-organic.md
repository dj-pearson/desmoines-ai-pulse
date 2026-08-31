# Ralph Agent Instructions - SEO organic recovery

You are an autonomous coding agent working on the **Des Moines Insider** project.

## Your Task

1. Read the PRD at `prd-seo-organic.json` (project root, NOT `scripts/ralph/prd.json`)
2. Read the progress log at `scripts/ralph/progress.txt` (check Codebase Patterns section first)
3. You must be on branch `claude/seo-organic-phase1`, cut from `main`. If you are not on it, check it out. Never commit to `main` or `develop`. Never force-push any protected branch.
4. Pick the story with the lowest `priority` number where `passes: false`. Break ties by `id` order.
5. Implement that single user story
6. Run quality checks: `npm run type-check && npm run lint`
7. If checks pass, commit ALL changes with message: `fix: [Story ID] - [Story Title]` for phase 1 stories, `feat: [Story ID] - [Story Title]` for phase 2
8. Update `prd-seo-organic.json` to set `passes: true` for the completed story
9. Append your progress to `scripts/ralph/progress.txt`

## Verification standard for this PRD - read this before anything else

**A unit test passing is not evidence that an SEO fix works.** This PRD exists partly
because SEO-004 shipped with 23 passing checks over `trailingSlashRedirect()` and does
the opposite thing in production, where the function is never reached. The function was
correct and the behaviour was wrong.

So for every story here:

- Verify the **observable behaviour**, at the layer a crawler sees it. `curl -A GPTBot`
  and `curl -A Googlebot` against the real URL, or against a real local build, not a mock.
- Check the **status code and the redirect target**, not just the final body. `curl -L`
  reports the status after following, which is how the plan's original probe concluded
  `/weekend` was broken when it had been a working 301 for weeks. Use `-o /dev/null -w "%{http_code} %{redirect_url}"`.
- If you cannot verify a claim from this environment, **say so in the progress log** and
  state what you did verify. Do not assert something is fixed because the code looks right.
- Baselines in the PRD were measured 2026-08-31 with those methods. Re-measure rather
  than trusting them if a story's premise looks wrong - and if a premise IS wrong, record
  the correction in the progress log. The 2026-08-28 plan got four things wrong and the
  corrections were more useful than the original claims.

## Story-specific guardrails

- **SEO-021**: confirm what `scripts/prerender.mjs` actually emits (`<route>/index.html`
  vs `<route>.html`) from a real build BEFORE choosing a fix. Moving the trailing-slash
  check ahead of the asset bypass without changing the output shape creates an infinite
  redirect loop on the five highest-impression pages. Pick one direction; make canonical,
  redirect and sitemap all agree with it.
- **SEO-022**: do NOT weaken or remove the strict per-page prerender validation. It is
  fail-closed for a recorded reason - a build with an unreachable database produced ~1,370
  characters of identical boilerplate for every entity URL. A route that renders as the
  homepage shell must fail the build.
- **SEO-024 / SEO-025 / SEO-026**: read the actual rows in
  `docs/seo/keyword-research/keyword-opportunities.csv` before writing content. Target the
  terms that are there, not ones you assume.

## Reading the keyword data

`docs/seo/keyword-research/` holds the seed list, the Keyword Planner export and the join.
Two things about it that change how you should use it:

- Volumes are Planner **buckets** (50 / 500 / 5,000 / 50,000) from an account with no
  active ad spend. They are order-of-magnitude only. Never derive a traffic forecast.
- The `competition` column is **paid** competition, a proxy for commercial contest, not for
  organic difficulty.
- **Blank volume is suppression, not zero demand.** Every playground and kids term came
  back blank while Search Console measures that module at 6,706 impressions ranking 6-7.
  Use blanks to deprioritise, never as evidence to delete a page that already ranks.

## Project Context

- **Stack**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Supabase + React Router v6
- **Database**: PostgreSQL via Supabase (see `src/integrations/supabase/types.ts` for schema types)
- **Auth**: Supabase Auth, accessed via `useAuth()` from `@/contexts/AuthContext`
- **State**: TanStack Query v5 for server state; React hooks + Context for UI state
- **Icons**: Lucide React only
- **Env vars**: Always use `import.meta.env.VITE_*` (not `process.env`)
- **Storage**: Always use `@/lib/safeStorage` (not `localStorage` directly)
- **Error handling**: Use `@/lib/errorHandler`
- Do not assume a table exists because `types.ts` names it. Probe PostgREST first - see the
  Database section of the root `CLAUDE.md`.

## Quality Requirements

```bash
npm run type-check
npm run lint
```

- ALL commits must pass typecheck and lint
- Never skip hooks with `--no-verify`
- Do NOT commit broken code
- Keep changes focused and minimal
- Respect the Backward Compatibility rules in the root `CLAUDE.md`: no destructive
  migration, no removed response field, no tightened validation in a single release

## Progress Report Format

APPEND to `scripts/ralph/progress.txt` (never replace, always append):

```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- How it was VERIFIED (the actual command and its actual output)
- What could NOT be verified from this environment
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
---
```

## Consolidate Patterns

If you discover a **reusable pattern** future iterations should know, add it to the
`## Codebase Patterns` section at the TOP of `scripts/ralph/progress.txt`. Only genuinely
general and reusable ones.

## Stop Condition

After completing a story, check whether ALL stories in `prd-seo-organic.json` have
`passes: true`. If so, reply with `COMPLETE`. Otherwise end your response normally.

## Important

- Work on **ONE story per iteration**
- Never open or merge a PR - a human does that
- Keep CI green
- Read `## Codebase Patterns` in `scripts/ralph/progress.txt` before starting
