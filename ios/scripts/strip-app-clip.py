#!/usr/bin/env python3
"""Remove the DesMoinesInsiderClip target from project.yml before xcodegen runs.

The App Clip has not shipped yet. Release builds leave it out until it is set
up in App Store Connect; set IOS_INCLUDE_APP_CLIP=1 to keep it. Moved out of
the old release workflow's inline step unchanged, plus the entitlement strip
that went with it.

Run from the ios/ folder.
"""
import os
import re
import sys

if os.environ.get("IOS_INCLUDE_APP_CLIP") == "1":
    print("IOS_INCLUDE_APP_CLIP=1: keeping the App Clip target")
    sys.exit(0)

with open("project.yml") as f:
    lines = f.readlines()

output = []
i = 0
skip_section = False
skip_indent = -1
while i < len(lines):
    raw = lines[i].rstrip("\n")
    stripped = raw.lstrip()
    indent = len(raw) - len(stripped)
    if skip_section:
        if stripped == "" or indent > skip_indent:
            i += 1
            continue
        skip_section = False
    # A DesMoinesInsiderClip section: the target definition or a scheme entry.
    if stripped.startswith("DesMoinesInsiderClip:"):
        skip_section = True
        skip_indent = indent
        i += 1
        continue
    # The main app's dependency on the clip, and the embed line after it.
    if stripped == "- target: DesMoinesInsiderClip":
        i += 1
        if i < len(lines) and "embed:" in lines[i]:
            i += 1
        continue
    output.append(lines[i])
    i += 1

with open("project.yml", "w") as f:
    f.writelines(output)
print("Removed the App Clip target from project.yml")

# Without the clip, the main app must not claim an appclip associated domain,
# or App Store Connect marks the binary invalid.
ent = "DesMoinesInsider/App/DesMoinesInsider.entitlements"
if os.path.exists(ent):
    with open(ent) as f:
        text = f.read()
    new = re.sub(r"[ \t]*<string>appclip:desmoinesinsider\.com</string>\n", "", text)
    if new != text:
        with open(ent, "w") as f:
            f.write(new)
        print(f"Removed appclip:desmoinesinsider.com from {ent}")
