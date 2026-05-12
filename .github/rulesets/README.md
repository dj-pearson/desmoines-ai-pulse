# Branch Protection Rulesets

This folder holds **versioned GitHub Rulesets** (not classic branch protection rules) that enforce the branching model documented in [`CLAUDE.md`](../../CLAUDE.md#branching--release). Rulesets here are the source of truth — re-apply them via `gh api` whenever they change.

## What's enforced

| Ruleset | Branch pattern | Block delete | Block force-push | Require PR | Required approvals |
|---|---|---|---|---|---|
| `protect-main` | `main` | ✅ | ✅ | ✅ | 0 (solo) |
| `protect-develop` | `develop` | ✅ | ✅ | ✅ | 0 (solo) |
| `protect-release` | `release/*` | ✅ | ✅ | ✅ | 0 (solo) |
| `protect-hotfix` | `hotfix/*` | ✅ | ✅ | ❌ (direct commits OK; gate is the PR into `main`) | n/a |

Repository admins (`actor_id: 5`, `RepositoryRole`) can bypass `always` — i.e. emergencies. Use sparingly.

### Why `required_approving_review_count: 0`?

This is a solo repo. GitHub will not let you approve your own PR, so requiring ≥ 1 approval would deadlock every merge. PRs are still required (the `pull_request` rule enforces that); you just self-merge. **When a second active contributor joins, bump these to `1`** and re-apply (see "Re-apply loop" below).

### Why no `required_status_checks` yet?

GitHub treats a required check that has never run on a PR as **pending forever**, blocking all merges. The existing workflow names in this repo (`pr-checks.yml` job `Lint, Type Check, Test & Build`, etc.) only become "real" check names after they've run on a PR at least once. Adding them prematurely breaks merges.

**To add them later**, after you've seen the check names show up green on a PR:

```jsonc
// add to the "rules" array of main.json / develop.json
{
  "type": "required_status_checks",
  "parameters": {
    "strict_required_status_checks_policy": true,
    "do_not_enforce_on_create": false,
    "required_status_checks": [
      { "context": "Lint, Type Check, Test & Build", "integration_id": 15368 },
      { "context": "Android CI",                     "integration_id": 15368 },
      { "context": "iOS CI",                         "integration_id": 15368 }
    ]
  }
}
```

`integration_id: 15368` is GitHub Actions. Use the exact `context` string GitHub shows on the PR checks tab (often the job `name:`, not the workflow `name:`). For `iOS CI` / `Android CI`, those workflows are path-filtered (`ios/**`, `android/**`) and won't run on every PR — make them required **only** if you want to force every PR to touch those paths, otherwise leave them off.

## Apply / re-apply (the loop)

The `gh` CLI on Windows Git Bash requires **no leading slash** on the API path. On macOS/Linux either works.

```bash
# 1. List existing rulesets — find the id of a ruleset with the same name (if any)
gh api repos/dj-pearson/desmoines-ai-pulse/rulesets

# 2a. If it doesn't exist yet — POST
gh api -X POST repos/dj-pearson/desmoines-ai-pulse/rulesets \
  --input .github/rulesets/main.json

# 2b. If it exists — PUT to update in place
gh api -X PUT repos/dj-pearson/desmoines-ai-pulse/rulesets/<RULESET_ID> \
  --input .github/rulesets/main.json
```

A reusable bash snippet that does "find by name → PUT if exists, else POST":

```bash
apply_ruleset() {
  local repo="dj-pearson/desmoines-ai-pulse"
  local file="$1"
  local name
  name=$(jq -r .name "$file")
  local id
  id=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id")
  if [ -n "$id" ]; then
    echo "Updating ruleset $name (id=$id)…"
    gh api -X PUT "repos/$repo/rulesets/$id" --input "$file"
  else
    echo "Creating ruleset $name…"
    gh api -X POST "repos/$repo/rulesets" --input "$file"
  fi
}

for f in .github/rulesets/*.json; do
  apply_ruleset "$f"
done
```

Run this any time a JSON file in this folder changes. It's idempotent.

## Verifying

```bash
# Confirm all four are present and active
gh api repos/dj-pearson/desmoines-ai-pulse/rulesets \
  --jq '.[] | {name, enforcement, target}'
```

Expected:

```json
{"name":"protect-main","enforcement":"active","target":"branch"}
{"name":"protect-develop","enforcement":"active","target":"branch"}
{"name":"protect-release","enforcement":"active","target":"branch"}
{"name":"protect-hotfix","enforcement":"active","target":"branch"}
```

Then try a forbidden action to confirm it's blocked (it should error):

```bash
# This should fail with "Changes must be made through a pull request"
git checkout main && git commit --allow-empty -m "test direct push" && git push
git checkout -  # back to your branch
```

## Editing a ruleset

1. Edit the JSON file in this folder.
2. Commit and PR the change like any other code change.
3. After merge to `main`, re-run the `apply_ruleset` loop above so the live ruleset matches the file.

Don't edit rulesets in the GitHub UI — it drifts from this folder. If you must, re-export afterward:

```bash
gh api repos/dj-pearson/desmoines-ai-pulse/rulesets/<ID> > .github/rulesets/<name>.json
```

## Bypass

`bypass_actors` is set to admin (`actor_id: 5`) with `bypass_mode: "always"`, so as repo owner you can override in genuine emergencies (e.g. you must force-push `main` to undo a leaked secret). This is intentional. Don't add other bypass actors without thinking about it.
