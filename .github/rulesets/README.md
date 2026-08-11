# Branch Protection Rulesets

This folder holds **versioned GitHub Rulesets** (not classic branch protection rules) that enforce the branching model documented in [`CLAUDE.md`](../../CLAUDE.md#branching--release). Rulesets here are the source of truth — re-apply them via `gh api` whenever they change.

## What's enforced

| Ruleset | Branch pattern | Block delete | Block force-push | Require PR | Required approvals |
|---|---|---|---|---|---|
| `protect-main` | `main` | ✅ | ✅ | ✅ | 1 |
| `protect-develop` | `develop` | ✅ | ✅ | ✅ | 1 |
| `protect-release` | `release/*` | ✅ | ✅ | ✅ | 1 |
| `protect-hotfix` | `hotfix/*` | ✅ | ✅ | ❌ (direct commits OK; gate is the PR into `main`) | n/a |

Repository admins (`actor_id: 5`, `RepositoryRole`) can bypass `always` — i.e. emergencies. Use sparingly.

### Required approvals

`protect-main`, `protect-develop`, and `protect-release` require **1 approving review** (WEB-CI-001). Because GitHub won't let you approve your own PR, a genuine solo merge with no other reviewer available goes through the admin `bypass_actors` path — keep that for the solo case only, and let real reviews gate everything else. Automated/Copilot review can satisfy this if enabled.

### Required status checks

The three protected rulesets require the `pr-checks.yml` validation checks to pass before merge:

```jsonc
{
  "type": "required_status_checks",
  "parameters": {
    "strict_required_status_checks_policy": true,
    "do_not_enforce_on_create": false,
    "required_status_checks": [
      { "context": "Lint, Type Check, Test & Build", "integration_id": 15368 },
      { "context": "Secret Scanning (gitleaks)",      "integration_id": 15368 }
    ]
  }
}
```

`integration_id: 15368` is GitHub Actions. The `context` strings are the **job `name:`** values in `pr-checks.yml` (not the workflow `name:`), which is what GitHub shows on the PR checks tab. `pr-checks.yml` is configured to run on PRs into `main`, `develop`, and `release/*` (WEB-CI-002).

> **Configured to run is not the same as running.** Checked 2026-08-11: `gh workflow list --all` reported **PR Checks** as `disabled_manually`, and its last run was 2026-02-12 — under job names the current file no longer contains, so the workflow as written had never executed. Two of the three required contexts here (`Lint, Type Check, Test & Build` and `Secret Scanning (gitleaks)`) are produced by that workflow, so both had been unreportable for six months while merges proceeded on the bypass below. If you are reading this and something seems oddly permissive, check the workflow's **state** before you check its logic. See WEB-CI-025.

> **First-apply caveat:** GitHub treats a required check that has *never* run on a PR as pending forever. Before re-applying these rulesets, make sure `pr-checks.yml` has run green on at least one PR into each protected branch so the check contexts are "real". This is also the failure mode above — it was live and unnoticed, because a permanently-pending check and a disabled workflow look identical from the PR page.

**`App project type ratchet`** is deliberately **not** required, and that is a decision worth revisiting rather than an oversight. It is the only gate that compiles the app project: `npm run type-check` in the validate job runs bare `tsc --noEmit` against the root tsconfig, which is `"files": []` plus project references and therefore compiles **zero files** (WEB-CI-023). Two P1 crashes shipped straight through it in one week. The ratchet runs `tsc -p tsconfig.app.json` and takes several minutes, which is why it is a separate job. Left advisory because it cannot gate on zero — the app project carries ~395 pre-existing errors and the job passes only if no file gets *worse*. Make it required once you are comfortable that a re-baseline is a deliberate act rather than a routine one.

**iOS/Android CI** (`Android CI`, `iOS CI`) are path-filtered (`ios/**`, `android/**`) and won't run on every PR — deliberately left out of the required set so web-only PRs aren't blocked waiting on a check that never starts. Add them only if you want to force every PR through those builds.

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
