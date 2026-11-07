export const meta = {
  name: 'improvement-loop-round',
  description: 'One continuous-improvement loop per lane, each agent in its own worktree, one committed improvement each',
  whenToUse: 'Running a round of docs/improvement-loops. args: { repo, lanes, date, trailers }',
  phases: [{ title: 'Loop', detail: 'one agent per lane: pick, implement, verify, commit' }],
}

// args.repo     absolute path of the main checkout (for the node_modules symlink)
// args.lanes    lane names from docs/improvement-loops/lanes/
// args.date     YYYY-MM-DD for the loop-log rows
// args.trailers commit trailer lines, newline-separated
const LANES = args.lanes
const REPO = args.repo
const DATE = args.date
const TRAILERS = args.trailers

const SCHEMA = {
  type: 'object',
  properties: {
    lane: { type: 'string' },
    story_id: { type: 'string', description: 'prd.json story id worked (existing or newly created)' },
    story_is_new: { type: 'boolean' },
    new_story: { type: 'object', description: 'full prd.json story object if story_is_new, else empty object' },
    commit_sha: { type: 'string', description: 'full sha of the single commit in your worktree, empty if nothing committed' },
    commit_subject: { type: 'string' },
    passes: { type: 'boolean', description: 'true if the story is fully done by this loop' },
    notes: { type: 'string', description: 'one or two sentences for the prd.json notes field: what changed and how it was verified' },
    verification: { type: 'string', description: 'exact commands run and their result (pass/fail counts)' },
    handoff: { type: 'string', description: 'remaining slices if split, else empty' },
    additional_stories: { type: 'array', items: { type: 'object' }, description: 'other prd.json-shaped stories you found but did not do (max 3)' },
  },
  required: ['lane', 'story_id', 'story_is_new', 'commit_sha', 'passes', 'notes', 'verification', 'handoff', 'additional_stories'],
}

phase('Loop')
const results = await parallel(LANES.map(lane => () => agent(
`You are the "${lane}" lane agent running ONE continuous-improvement loop on Des Moines Insider (main checkout at ${REPO}; you are in a separate git worktree of it).

Setup: if node_modules is missing in your worktree, run: ln -s ${REPO}/node_modules node_modules

Read docs/improvement-loops/README.md (the protocol) and docs/improvement-loops/lanes/${lane}.md, then run exactly one loop:
1. If the lane file has a Handoff, continue it. Otherwise pick the highest-value open story ("passes": false) in prd.json for your lane's prefixes. For shared prefixes (WEB-FEAT, WEB-BE, XPLAT) only take stories about your lane's topic. If nothing open fits or is worth it, audit your lane's paths and define the single most valuable gap as a new story (next free id in your lane's prefix; check prd.json for the max number).
2. Size it to one commit (~400 changed lines, one concern). If bigger, do a complete, shippable first slice and describe the rest as handoff.
3. Implement it, following CLAUDE.md (backward-compatible DB/edge changes, server decides money, safeStorage, handleError, no any). Reproduce bugs first. Do not touch code owned by another lane unless the fix requires it.
4. Verify with the checks for the area you touched (README "Checks by area"). Run them; report real results. Never skip/disable a test or loosen a baseline. For ios/android, no compiler is available: say "not compiled" plainly.
5. Do NOT edit prd.json (the orchestrator applies story updates). DO update docs/improvement-loops/lanes/${lane}.md: add one loop-log row (date ${DATE}, story id, "this commit", result) and set or clear the Handoff section.
6. Commit everything in ONE commit in your worktree: conventional commit "<type>(<scope>): <what> (<STORY-ID>)", body says why and how verified, ending with these lines:
${TRAILERS}
Do not push. Do not include any model name elsewhere in the commit.

Return the structured result. If you could not produce a verified improvement, commit nothing and return commit_sha "" with the reason in notes.`,
  { label: `lane:${lane}`, phase: 'Loop', isolation: 'worktree', schema: SCHEMA }
)))

return results.map((r, i) => r || { lane: LANES[i], failed: true })
