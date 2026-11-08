#!/usr/bin/env node
// Merge an improvement-loop round onto the current branch.
//
//   node scripts/merge-loop-round.mjs <results.json> [landed.json]
//
// 1. Assigns real prd.json ids to new stories. Lanes name a new story
//    <PREFIX>-NEW-<lane> (see .claude/workflows/improvement-loop-round.js);
//    a numeric id that collides with prd.json or with another lane this round
//    is renumbered too.
// 2. Cherry-picks each lane's commit in lane order, rewriting the placeholder
//    (or colliding id) to the real one in the commit message and in every file
//    the commit touches. A conflict confined to docs/improvement-loops/lanes/
//    takes the lane's version; any other conflict skips that lane.
// 3. Writes the landed lanes' results (with real ids) to landed.json, ready for
//    scripts/apply-loop-results.mjs once validate and vitest pass.
//
// It does not edit prd.json, run checks, commit the round log or push.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [inFile, outFile = "landed.json"] = process.argv.slice(2);
if (!inFile) {
  console.error("usage: node scripts/merge-loop-round.mjs <results.json> [landed.json]");
  process.exit(2);
}

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const tryGit = (...args) => {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
};

let results = JSON.parse(readFileSync(inFile, "utf8"));
if (!Array.isArray(results)) results = results.result;
results = results.filter((r) => r && !r.failed && r.commit_sha);

const prd = JSON.parse(readFileSync("prd.json", "utf8"));
const taken = new Set(prd.userStories.map((s) => s.id));
const ID_RE = /^([A-Z]+(?:-[A-Z]+)*)-(\d+)$/;
const PLACEHOLDER_RE = /^([A-Z]+(?:-[A-Z]+)*)-NEW(?:-[a-z-]+)?$/;

function nextId(prefix) {
  let max = 0;
  for (const id of taken) {
    const m = ID_RE.exec(id);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  const id = `${prefix}-${String(max + 1).padStart(3, "0")}`;
  taken.add(id);
  return id;
}

// Assign ids. Existing stories keep theirs.
for (const r of results) {
  if (!r.story_is_new) continue;
  const id = r.story_id;
  const ph = PLACEHOLDER_RE.exec(id);
  let real = id;
  if (ph) real = nextId(ph[1]);
  else if (taken.has(id)) real = nextId(ID_RE.exec(id)?.[1] ?? "WEB-QA");
  else taken.add(id);
  if (real !== id) {
    r.rename = { from: id, to: real };
    r.story_id = real;
    if (r.new_story) r.new_story.id = real;
    for (const k of ["notes", "commit_subject"]) if (r[k]) r[k] = r[k].split(id).join(real);
  }
}

const landed = [];
for (const r of results) {
  const sha = r.commit_sha;
  const label = `${r.lane} ${sha.slice(0, 10)}`;
  const rename = r.rename;
  const ok = tryGit("cherry-pick", "--no-commit", sha);
  if (!ok) {
    const conflicted = git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
    const other = conflicted.filter((f) => !f.startsWith("docs/improvement-loops/lanes/"));
    if (other.length) {
      tryGit("cherry-pick", "--abort") || tryGit("reset", "--hard", "HEAD");
      console.log(`SKIP ${label}: conflict in ${other.join(", ")}`);
      continue;
    }
    for (const f of conflicted) {
      git("checkout", "--theirs", "--", f);
      git("add", f);
    }
    console.log(`  ${label}: lane file conflict, took the lane's version`);
  }
  if (rename) {
    for (const f of git("diff", "--cached", "--name-only").split("\n").filter(Boolean)) {
      let text;
      try {
        text = readFileSync(f, "utf8");
      } catch {
        continue; // deleted in this commit
      }
      if (text.includes(rename.from)) {
        writeFileSync(f, text.split(rename.from).join(rename.to));
        git("add", f);
      }
    }
  }
  let msg = git("log", "-1", "--format=%B", sha);
  if (rename) msg = msg.split(rename.from).join(rename.to);
  execFileSync("git", ["commit", "-q", "--allow-empty", "-F", "-"], { input: `${msg}\n` });
  console.log(`ok   ${label}${rename ? `  ${rename.from} -> ${rename.to}` : ""}`);
  landed.push(r);
}

writeFileSync(outFile, `${JSON.stringify(landed, null, 2)}\n`);
console.log(`${landed.length}/${results.length} landed; results for apply-loop-results in ${outFile}`);
