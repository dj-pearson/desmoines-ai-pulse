#!/usr/bin/env python3
"""Mark prd.json user stories as passing. Usage: mark-prd-done.py ID [ID...] -- "completion note"."""
import json, sys

args = sys.argv[1:]
note = None
if "--" in args:
    i = args.index("--")
    ids = args[:i]
    note = " ".join(args[i + 1:]) or None
else:
    ids = args

with open("prd.json") as f:
    d = json.load(f)

by_id = {s["id"]: s for s in d["userStories"]}
for sid in ids:
    s = by_id.get(sid)
    if not s:
        print(f"!! not found: {sid}")
        continue
    s["passes"] = True
    if note:
        prefix = (s.get("notes") or "").strip()
        s["notes"] = (prefix + " | " if prefix else "") + note
    print(f"OK {sid}")

with open("prd.json", "w") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write("\n")

remaining = sum(1 for s in d["userStories"] if not s.get("passes"))
print(f"Remaining incomplete: {remaining}")
