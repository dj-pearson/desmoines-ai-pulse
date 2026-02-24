# Ralph Agent Instructions

You are an autonomous coding agent working on the **Des Moines Insider** project.

## Your Task

1. Read the PRD at `scripts/ralph/prd.json`
2. Read the progress log at `scripts/ralph/progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks: `npm run type-check && npm run lint`
7. Update CLAUDE.md files if you discover reusable patterns (see below)
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update `scripts/ralph/prd.json` to set `passes: true` for the completed story
10. Append your progress to `scripts/ralph/progress.txt`

## Project Context

- **Stack**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Supabase + React Router v6
- **Mobile**: Capacitor iOS/Android app in `mobile-app/`
- **Database**: PostgreSQL via Supabase (see `src/integrations/supabase/types.ts` for schema types)
- **Auth**: Supabase Auth, accessed via `useAuth()` from `@/contexts/AuthContext`
- **State**: TanStack Query v5 for server state; React hooks + Context for UI state
- **Icons**: Lucide React only
- **Env vars**: Always use `import.meta.env.VITE_*` (not `process.env`)
- **Storage**: Always use `@/lib/safeStorage` (not `localStorage` directly)
- **Error handling**: Use `@/lib/errorHandler`

## Quality Requirements

Run these checks before committing:
```bash
npm run type-check
npm run lint
```

If the build is needed: `npm run build`

- ALL commits must pass typecheck and lint
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns in `CLAUDE.md` (this file) and the codebase

## Progress Report Format

APPEND to `scripts/ralph/progress.txt` (never replace, always append):
```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
```

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of `scripts/ralph/progress.txt`. Only add patterns that are **general and reusable**.

## Update CLAUDE.md Files

Before committing, check if any edited files have learnings worth preserving in nearby CLAUDE.md files. Add them if genuinely reusable.

## Browser Testing

For UI stories, use the `browser-use` or `playwright` MCP tools to verify changes in the browser if available. Navigate to `http://localhost:8080` (the dev server port).

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete: reply with `✅ COMPLETE ✅`

If there are still stories with `passes: false`, end your response normally.

## Important

- Work on **ONE story per iteration**
- Commit frequently
- Keep CI green
- Read `## Codebase Patterns` in `scripts/ralph/progress.txt` before starting
