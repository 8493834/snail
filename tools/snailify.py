#!/usr/bin/env python3
"""snailify - make a Snail program (.snail) out of ordinary source files.

    python3 tools/snailify.py page.html script.js tool.py -o my.snail
    python3 tools/snailify.py www/index.html --inline --escape -o examples/snail-in-snail.snail

Each file becomes one <code lang="..."> block (by file extension: .html .js .py .java; or force one with  file.txt:python ).

Two things inside a block confuse Snail itself, because it looks at them before it runs any code:
  1. a  #ss# ... #  comment is deleted, even inside a code block
  2. the end tag (a '<code' followed by one or more '?' and '>') ends the block early
snailify finds them. By default it stops and tells you where. With --escape it rewrites them so the code means the same thing
(\\x73 / \\x3f in JavaScript and Python, \\u0073 / \\u003f in Java, &#115; / &lt; in html text), and then checks that Snail
hands every block back exactly as intended. That check only compares text, so it can't see meaning: inside a JS regex literal,
String.raw, or a Python raw string the rewrite changes what the code does. snailify warns about lines that look like that.
In a JS regex, write <cod(?:e)?> instead of <code?> before running snailify. Hazards inside <style> can't be escaped
automatically (CSS doesn't decode entities); edit those by hand.

Other options:  --inline   put <script src="local.js"></script> files inside the page (a block must be one piece)
                --note "text"   add a comment line at the top (must not contain # or a newline)
                --core PATH     Snail's parser for the final check (default: www/snail-core.js next to tools/)
Needs Python 3 and Node (Node is used for the final check and for syntax-checking escaped JavaScript).
"""
import argparse, json, os, re, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = {".html": "html en", ".htm": "html en", ".js": "js", ".mjs": "js", ".py": "python", ".java": "java"}
BS = chr(92)                                # a backslash (built this way so it survives being copied around)
COMMENT = "#ss#"
CLOSE = re.compile(r"<code\?+>")            # what ends a block
SCRIPT = re.compile(r"(<script\b[^>]*>)(.*?)(</script\s*>)", re.S | re.I)
RAWBLOCK = re.compile(r"(<(script|style)\b[^>]*>)(.*?)(</\2\s*>)", re.S | re.I)
JS_TYPE = re.compile(r"""type\s*=\s*["']?(?:module|(?:text|application)/(?:java|ecma)script)""", re.I)
MODULE_TYPE = re.compile(r"""type\s*=\s*["']?module""", re.I)
# lines where escaping may change meaning rather than just spelling. In a JS regex only the end-tag rewrite does
# (\x73 is still "s"); in String.raw / RegExp( / Python raw strings both rewrites do.
RAW_JS_ANY = re.compile(r"String\.raw|RegExp\s*\(")
RAW_JS_RE = re.compile(r"/(?![/*])[^/\n]*<code\?+>")
RAW_PY = re.compile(r"""\b(?:[rR][bBfF]?|[bBfF][rR])["']""")

TMP = None                                  # half-written output, removed if we bail out

def die(msg):
    if TMP is not None:
        TMP.unlink(missing_ok=True)
    sys.exit("snailify: " + msg)

def line_of(text, i):
    return text.count("\n", 0, i) + 1

def hazards(text):
    """[(line, what)] for everything Snail would mangle."""
    found = [(line_of(text, m.start()), "#ss# comment") for m in re.finditer(re.escape(COMMENT), text)]
    found += [(line_of(text, m.start()), "end tag") for m in CLOSE.finditer(text)]
    return sorted(found)

def raw_lines(base, text):
    """Line numbers of hazards sitting where escaping may change meaning (regex literals, raw strings)."""
    if base not in ("js", "python"):
        return []
    lines, out = text.split("\n"), set()
    for l, what in hazards(text):
        line = lines[l - 1]
        if base == "python":
            hit = RAW_PY.search(line)
        elif line.lstrip().startswith("//"):
            hit = False                                  # a hazard inside a line comment is harmless
        else:
            hit = RAW_JS_ANY.search(line) or (what == "end tag" and RAW_JS_RE.search(line))
        if hit: out.add(l)
    return sorted(out)

def esc(text, comment, close):
    """Replace both hazards: comment/close are the replacement texts."""
    text = text.replace(COMMENT, comment)
    return CLOSE.sub(lambda m: close(m.group(0)), text)

ESCAPERS = {
    "js":     lambda t: esc(t, "#s" + BS + "x73#", lambda s: s.replace("?", BS + "x3f")),
    "python": lambda t: esc(t, "#s" + BS + "x73#", lambda s: s.replace("?", BS + "x3f")),
    "java":   lambda t: esc(t, "#s" + BS + "u0073#", lambda s: s.replace("?", BS + "u003f")),
}

def escape_html(text, name, warn):
    out, pos = [], 0
    def text_part(t):    # plain html text and attributes: entities mean the same thing
        return esc(t, "#s&#115;#", lambda s: "&lt;" + s[1:].replace(">", "&gt;"))
    for m in RAWBLOCK.finditer(text):
        out.append(text_part(text[pos:m.start()]))
        tag, kind, body, end = m.group(1), m.group(2).lower(), m.group(3), m.group(4)
        if hazards(body):
            at = line_of(text, m.start(3))
            if kind == "style":
                die(f"{name}: line {at}: <style> contains #ss# or an end tag; CSS can't be escaped automatically, edit it by hand")
            if not JS_TYPE.search(tag) and re.search(r"type\s*=", tag, re.I):
                die(f"{name}: line {at}: a <script> that isn't JavaScript contains #ss# or an end tag; edit it by hand")
            warn += [f"{name}: line {at + l - 1}" for l in raw_lines("js", body)]
            body = ESCAPERS["js"](body)
        out.append(tag + body + end); pos = m.end()
    out.append(text_part(text[pos:]))
    return "".join(out)

def inline_scripts(text, base, name):
    def sub(m):
        mm = re.search(r"""src\s*=\s*["']([^"']+)["']""", m.group(1), re.I)
        if not mm or re.match(r"[a-z][a-z0-9+.-]*:|//", mm.group(1), re.I):
            return m.group(0)                      # no src, or a web address: leave it
        f = (base / mm.group(1)).resolve()
        if not f.is_file(): die(f"{name}: --inline: {mm.group(1)} not found next to the page")
        js = f.read_text(encoding="utf-8-sig").replace("\r\n", "\n").rstrip()
        if re.search(r"</script", js, re.I): die(f"{f.name} contains </script>, so it can't be put inside a page")
        attrs = re.sub(r"""\s*src\s*=\s*["'][^"']+["']""", "", m.group(1), flags=re.I)
        return attrs + js + "</script>"
    return re.sub(r"(<script\b[^>]*>)\s*</script\s*>", sub, text, flags=re.I)

def clean_body(src):             # what Snail does to a block's text before using it
    lines = src.split("\n")
    while lines and not lines[0].strip(): lines.pop(0)
    while lines and not lines[-1].strip(): lines.pop()
    ind = [len(l) - len(l.lstrip(" \t")) for l in lines if l.strip()]
    cut = min(ind) if ind else 0
    return "\n".join(l[cut:] for l in lines)

def run_node(args):
    try:
        return subprocess.run(["node"] + args, capture_output=True, text=True)
    except FileNotFoundError:
        die("Node isn't installed (or isn't on PATH); it's needed for the final check")

def syntax_check(lang, text, name, module=False):
    base = lang.split()[0]
    with tempfile.TemporaryDirectory() as d:
        if base == "js":
            f = Path(d) / ("x.mjs" if module else "x.js"); f.write_text(text, encoding="utf-8")
            r = run_node(["--check", str(f)])
            if r.returncode: die(f"{name}: the escaped JavaScript no longer parses:\n{r.stderr.strip()[:400]}")
        elif base == "python":
            try: compile(text, name, "exec")
            except SyntaxError as e: die(f"{name}: the escaped Python no longer parses: {e}")
        elif base == "html":
            for i, m in enumerate(SCRIPT.finditer(text)):
                if m.group(2).strip() and (not re.search(r"type\s*=", m.group(1), re.I) or JS_TYPE.search(m.group(1))):
                    syntax_check("js", m.group(2), f"{name} (script {i + 1})", module=bool(MODULE_TYPE.search(m.group(1))))

def main():
    global TMP
    ap = argparse.ArgumentParser(description="Make a Snail program from ordinary source files.", epilog=(__doc__ or "").split("Other options")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help="source files, optionally file:language")
    ap.add_argument("-o", "--output", help="output .snail file (default: first file's name)")
    ap.add_argument("--escape", action="store_true", help="rewrite #ss# and end-tag text instead of stopping")
    ap.add_argument("--inline", action="store_true", help="inline local <script src=...> files into html")
    ap.add_argument("--note", help="a comment line for the top of the file")
    ap.add_argument("--core", default=str(ROOT / "www/snail-core.js"), help="Snail's parser, used for the final check")
    a = ap.parse_args()
    if a.note and ("#" in a.note or "\n" in a.note or "\r" in a.note): die("--note can't contain # or a newline")

    blocks, report, warn, paths = [], [], [], []
    for spec in a.files:
        path, _, forced = spec.partition(":") if not re.match(r"^[A-Za-z]:[\\/]", spec) else (spec, "", "")
        if re.match(r"^[A-Za-z]:[\\/]", spec) and ":" in spec[2:]: path, _, forced = spec[2:].rpartition(":"); path = spec[:2] + path
        p = Path(path)
        if not p.is_file(): die(f"{path}: no such file")
        paths.append(p)
        lang = (forced.strip().lower() if forced else LANGS.get(p.suffix.lower()))
        if not lang: die(f"{p.name}: don't know this file type; name the language, e.g.  {p.name}:python")
        if forced and forced.strip().lower() in ("html", "htm"): lang = "html en"
        try:
            text = p.read_text(encoding="utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
        except UnicodeDecodeError as e:
            die(f"{p.name}: not valid UTF-8 ({e.reason} at byte {e.start}); re-save it as UTF-8")
        base = lang.split()[0]
        if base == "html" and a.inline: text = inline_scripts(text, p.parent, p.name)
        found = hazards(text)
        if found:
            if not a.escape:
                where = ", ".join(f"line {l} ({w})" for l, w in found[:8]) + (" ..." if len(found) > 8 else "")
                die(f"{p.name}: Snail would mangle this: {where}.\n  Run again with --escape to rewrite them safely.")
            if base == "html": text = escape_html(text, p.name, warn)
            elif base in ESCAPERS:
                warn += [f"{p.name}: line {l}" for l in raw_lines(base, text)]
                text = ESCAPERS[base](text)
            else: die(f"{p.name}: can't escape '{base}' automatically; remove those {len(found)} spot(s) by hand")
            if hazards(text): die(f"{p.name}: still contains something Snail would mangle after escaping")
            syntax_check(lang, text, p.name, module=p.suffix.lower() == ".mjs")
            report.append(f"{p.name}: escaped {len(found)} spot(s)")
        blocks.append((lang, text.strip("\n"), p.name))

    out = "#ss# generated by snailify #\n#ss# ver 1.0 ###\n"
    if a.note: out += f"#ss# {a.note} #\n"
    for lang, body, name in blocks:
        out += f'\n<code lang="{lang}">\n{body}\n<code?>\n'
    dest = Path(a.output) if a.output else Path(paths[0].stem + ".snail")
    TMP = dest.with_name(dest.name + ".tmp")          # verify here; only a good file gets the real name
    TMP.write_text(out, encoding="utf-8")

    # Final check: run Snail's own parser on the result.
    core = Path(a.core).resolve()
    if not core.is_file(): die(f"can't find Snail's parser at {core}; point --core at snail-core.js")
    expect = [clean_body(b) for _, b, _ in blocks]
    check = f"""const S=require({json.dumps(str(core))});
const p=S.parse(require('fs').readFileSync({json.dumps(str(TMP))},'utf8'),'x.snail');
console.log(JSON.stringify(p.blocks.map(b=>[b.lang+(b.extras.length?' '+b.extras.join(' '):''),b.body])));"""
    r = run_node(["-e", check])
    if r.returncode: die("Snail couldn't read the file it just got:\n" + r.stderr.strip()[:400])
    got = json.loads(r.stdout)
    if len(got) != len(blocks) or any(g[1] != e or g[0] != b[0] for g, e, b in zip(got, expect, blocks)):
        die("Snail does not hand the blocks back exactly as written (nothing was written to %s)" % dest)
    os.replace(TMP, dest); TMP = None
    for line in report: print("  " + line)
    if warn:
        print("  warning: these escaped lines look like a regex literal, String.raw or a raw string, where the rewrite can change\n"
              "  what the code does (the check can't see that). Review them; in a JS regex use <cod(?:e)?> instead of <code?>:", file=sys.stderr)
        for w in warn: print("    " + w, file=sys.stderr)
    print(f"wrote {dest} ({len(blocks)} block(s): {', '.join(b[0].split()[0] for b in blocks)}); Snail reads every block back exactly")

if __name__ == "__main__":
    main()
