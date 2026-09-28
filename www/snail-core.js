/* snail-core.js - Snail v1.0 parser plus the runners that work in any browser. */
const Snail = (function () {
  const SUPPORTED = [1, 0];
  const PROGRAM_EXTS = [".snail"];
  const SYSTEM_EXTS = [".cofigsnail", ".configsnail"];

  // Comments: version directive, #ss## multi-line #, #ss# single-line #
  const COMMENT_RE =
    /(?<ver>#ss#[ \t]*ver[ \t]+(?<num>\d+(?:\.\d+)*)[ \t]*#*)|(?<multi>#ss##.*?(?<mend>#|$))|(?<single>#ss#[^#\n]*#?)/gs;
  const OPEN_RE = /<code\s+lang\s*=\s*"?([^">\n]*)"?\s*>/gi;
  const CLOSE_RE = /<code\?+>/g; // <code?> or <code??>

  class SnailError extends Error {
    constructor(message, line) {
      super(line ? `line ${line}: ${message}` : message);
      this.line = line;
    }
  }

  const lineOf = (text, i) => text.slice(0, i).split("\n").length;
  const find = (re, s, from) => ((re.lastIndex = from), re.exec(s));

  function cleanBody(body) {
    const lines = body.split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length);
    const cut = indents.length ? Math.min(...indents) : 0;
    return lines.map((l) => l.slice(cut)).join("\n");
  }

  function parse(text, filename) {
    text = text.replace(/\r\n?/g, "\n");
    const dot = filename.lastIndexOf(".");
    const ext = dot < 0 ? "" : filename.slice(dot).toLowerCase();
    let kind;
    if (PROGRAM_EXTS.includes(ext)) kind = "program";
    else if (SYSTEM_EXTS.includes(ext)) kind = "system";
    else throw new SnailError(`unknown file type '${ext}' (expected .snail or .cofigsnail)`);

    const prog = { kind, version: null, blocks: [] };

    // Pass 1: strip comments, keeping newlines so line numbers stay right.
    const clean = text.replace(COMMENT_RE, (...a) => {
      const g = a[a.length - 1];
      const offset = a[a.length - 3];
      if (g.ver) prog.version = prog.version || g.num;
      else if (g.multi !== undefined && g.mend === "")
        throw new SnailError("multi-line comment is never closed (missing #)", lineOf(text, offset));
      return "\n".repeat(a[0].split("\n").length - 1);
    });

    // Pass 2: find <code lang="..."> ... <code?> blocks.
    let pos = 0;
    for (;;) {
      const m = find(OPEN_RE, clean, pos);
      const stray = clean.slice(pos, m ? m.index : clean.length);
      if (stray.trim()) {
        const at = pos + stray.length - stray.trimStart().length;
        throw new SnailError(`unexpected text outside a code block: '${stray.trim().slice(0, 40)}'`, lineOf(clean, at));
      }
      if (!m) break;
      const words = m[1].split(/\s+/).filter(Boolean);
      if (!words.length) throw new SnailError("<code> tag has no language", lineOf(clean, m.index));
      const end = find(CLOSE_RE, clean, m.index + m[0].length);
      if (!end) throw new SnailError("code block is never closed (expected <code?>)", lineOf(clean, m.index));
      prog.blocks.push({
        lang: words[0].toLowerCase(),
        extras: words.slice(1),
        body: cleanBody(clean.slice(m.index + m[0].length, end.index)),
        line: lineOf(clean, m.index),
      });
      pos = end.index + end[0].length;
    }
    return prog;
  }

  // ---- runners that work everywhere (html, javascript) ----
  function htmlPage(block, name) {
    if (/<html/i.test(block.body)) return block.body;
    const lang = block.extras[0] || "en";
    const title = name.replace(/</g, "&lt;");
    return `<!DOCTYPE html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n</head>\n<body>\n${block.body}\n</body>\n</html>\n`;
  }

  function runJs(code) {
    const out = [];
    const fmt = (args) =>
      args.map((x) => {
        if (typeof x !== "object" || x === null) return String(x);
        try { return JSON.stringify(x); } catch { return String(x); }
      }).join(" ");
    const log = (...a) => out.push(fmt(a));
    try {
      new Function("console", code)({ log, info: log, warn: log, error: log });
      return { ok: true, out: out.join("\n") };
    } catch (e) {
      out.push("Error: " + e.message);
      return { ok: false, out: out.join("\n") };
    }
  }

  return { parse, SnailError, htmlPage, runJs, SUPPORTED };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Snail;
