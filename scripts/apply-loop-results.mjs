#!/usr/bin/env node
// Apply an improvement-loop round's results to prd.json.
//
//   node scripts/apply-loop-results.mjs <results.json>
//
// <results.json> is the array the improvement-loop-round workflow returns
// (or a {result: [...]} wrapper). Primary stories are added before the
// "additional_stories" so a lane's extra finding can never take an id another
// lane already used for its own story; colliding or placeholder ids get the
// next free number in their prefix.
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-loop-results.mjs <results.json>");
  process.exit(2);
}
let results = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(results)) results = results.result;
results = results.filter((r) => r && !r.failed && r.commit_sha);

const prd = JSON.parse(readFileSync("prd.json", "utf8"));
const stories = prd.userStories;
const byId = new Map(stories.map((s) => [s.id, s]));

const ID_RE = /^([A-Z]+(?:-[A-Z]+)*)-(\d+)$/;
function nextId(prefix) {
  let max = 0;
  for (const id of byId.keys()) {
    const m = ID_RE.exec(id);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
function prefixOf(id) {
  const m = /^([A-Z]+(?:-[A-Z]+)*?)(?=-(?:\d|X))/.exec(id || "");
  return m ? m[1] : "WEB-QA";
}

for (const r of results) {
  if (r.story_is_new && !byId.has(r.story_id)) {
    const s = { ...r.new_story, id: r.story_id };
    stories.push(s);
    byId.set(s.id, s);
  }
}
for (const r of results) {
  const s = byId.get(r.story_id);
  if (!s) {
    console.error(`skip: ${r.lane} reported unknown story ${r.story_id}`);
    continue;
  }
  s.passes = Boolean(r.passes);
  const handoff = r.handoff ? ` Handoff: docs/improvement-loops/lanes/${r.lane}.md` : "";
  s.notes = (s.notes ? `${s.notes} | ` : "") + r.notes + handoff;
  console.log(`${r.lane}: ${s.id} passes=${s.passes}`);
}
for (const r of results) {
  for (const a of r.additional_stories || []) {
    let id = a.id;
    if (!ID_RE.test(id || "") || byId.has(id)) id = nextId(prefixOf(id));
    const s = { priority: 4, ...a, id, passes: false };
    stories.push(s);
    byId.set(id, s);
    console.log(`${r.lane}: + ${id} ${String(s.title || "").slice(0, 70)}`);
  }
}
if (byId.size !== stories.length) {
  console.error("duplicate story ids in prd.json; not writing");
  process.exit(1);
}
writeFileSync("prd.json", `${JSON.stringify(prd, null, 2)}\n`);
