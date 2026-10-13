#!/usr/bin/env python3
"""Builds examples/snail-in-snail.snail: the Snail app itself as ONE html block, so Snail can run inside Snail.

Why this is needed: Snail removes #ss# comments and stops a block at the first end tag, even inside a code block, so the app's
own source can't contain those literally. This script spells them in a way Snail can't see (but means the same), inlines
snail-core.js, then checks that Snail passes the page through unchanged.

Usage:  python3 tools/make-snail-in-snail.py        (run from the repo root; needs Node for the check)
"""
import re, subprocess, sys, json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
core = (root / "www/snail-core.js").read_text()
page = (root / "www/index.html").read_text()

def swap(text, old, new, label):
    if old not in text:
        sys.exit(f"make-snail-in-snail: expected text not found ({label}); the source changed, update this script")
    return text.replace(old, new)

# --- snail-core.js ---
core = swap(core, "// Comments: version directive, #ss## multi-line #, #ss# single-line #", "// Comments: version directive, multi-line and single-line forms", "core comment")
core = core.replace("#ss#", "#s{2}#")                                   # same regex, different spelling
core = swap(core, "/<code\\s+lang", "/<co(?:de)\\s+lang", "open tag regex")
core = swap(core, "/<code\\?+>/g; // <code?> or <code??>", "/<co(?:de)\\?+>/g; // the end tag has one or more ?", "close tag regex")
core = swap(core, '// Pass 2: find <code lang="..."> ... <code?> blocks.', "// Pass 2: find the code blocks.", "pass 2 comment")
core = swap(core, '"<code> tag has no language"', '"<co" + "de> tag has no language"', "message 1")
core = swap(core, '"code block is never closed (expected <code?>)"', '"code block is never closed (expected <co" + "de?>)"', "message 2")

# --- index.html: the sample program is a template string, so splice the pieces in ---
m = re.search(r"const SAMPLE = `.*?`;", page, re.S)
if not m: sys.exit("make-snail-in-snail: SAMPLE not found")
sample = m.group(0).replace("#ss#", '#s${"s"}#').replace("<code", '<co${"de"}')
page = page.replace(m.group(0), sample)
page = swap(page, '<script src="snail-core.js"></script>', "<script>" + core.rstrip() + "</script>", "core script tag")

left = [(t, i) for t in ("#ss#", "<code") for i in [page.find(t)] if i >= 0]
if left: sys.exit(f"make-snail-in-snail: still contains {left}; Snail would mangle it")

out = "#ss# copyright snail coding development inc. #\n#ss# ver 1.0 ###\n\n#ss## Snail running inside Snail. Run this file in Snail,\nand the app appears in the preview below the output. #\n\n"
out += '<code lang="html en">\n' + page.strip("\n") + "\n<code?>\n"
dest = root / "examples/snail-in-snail.snail"
dest.write_text(out)

# --- check: Snail must hand the page over exactly as written ---
check = f"""
const Snail = require({json.dumps(str(root / 'www/snail-core.js'))});
const text = require('fs').readFileSync({json.dumps(str(dest))}, 'utf8');
const p = Snail.parse(text, 'snail-in-snail.snail');
const same = p.blocks.length === 1 && p.blocks[0].body === {json.dumps(page.strip(chr(10)))};
console.log(same ? 'ok' : 'MISMATCH');
"""
r = subprocess.run(["node", "-e", check], capture_output=True, text=True)
if r.stdout.strip() != "ok":
    sys.exit("make-snail-in-snail: Snail changes the page when it runs it!\n" + r.stdout + r.stderr)
print(f"wrote {dest.relative_to(root)} ({dest.stat().st_size} bytes); Snail passes the page through unchanged")
