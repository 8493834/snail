/* snailify-core.js - browser/Node port of tools/snailify.py (no Python needed, so it works on GitHub Pages).
   build(files, opts, Snail) -> { text, report, warnings, blocks }   (throws Error with a plain message)
   files: [{ name, text, lang? }]   opts: { escape, inline, note }   Snail: the parser from snail-core.js */
const Snailify = (function () {
  const BS = String.fromCharCode(92);          // a backslash (built this way so it survives being copied around)
  const COMMENT = "#s" + "s#";                 // written in two pieces so this file never contains the hazard itself
  const CLOSE = /<code\?+>/g;
  const RAWBLOCK = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi;
  const JS_TYPE = /type\s*=\s*["']?(?:module|(?:text|application)\/(?:java|ecma)script)/i;
  const MODULE_TYPE = /type\s*=\s*["']?module/i;
  const RAW_JS_ANY = /String\.raw|RegExp\s*\(/;
  const RAW_JS_RE = /\/(?![/*])[^/\n]*<code\?+>/;
  const RAW_PY = /\b(?:[rR][bBfF]?|[bBfF][rR])["']/;
  const LANGS = { html: "html en", htm: "html en", js: "js", mjs: "js", py: "python", java: "java" };

  const lineOf = (t, i) => t.slice(0, i).split("\n").length;
  const allIdx = (t, re) => [...t.matchAll(new RegExp(re.source, "g"))].map((m) => m.index);

  function hazards(t) {
    const found = [];
    for (let i = t.indexOf(COMMENT); i >= 0; i = t.indexOf(COMMENT, i + 1)) found.push([lineOf(t, i), "#ss# comment"]);
    for (const i of allIdx(t, CLOSE)) found.push([lineOf(t, i), "end tag"]);
    return found.sort((a, b) => a[0] - b[0]);
  }
  function rawLines(base, t) {          // hazards where escaping may change meaning (see tools/snailify.py)
    if (base !== "js" && base !== "python") return [];
    const lines = t.split("\n"), out = new Set();
    for (const [l, what] of hazards(t)) {
      const line = lines[l - 1];
      const hit = base === "python" ? RAW_PY.test(line)
        : line.trimStart().startsWith("//") ? false
        : RAW_JS_ANY.test(line) || (what === "end tag" && RAW_JS_RE.test(line));
      if (hit) out.add(l);
    }
    return [...out].sort((x, y) => x - y);
  }
  const esc = (t, comment, close) => t.split(COMMENT).join(comment).replace(CLOSE, close);
  const viaEscape = (hex, q) => (t) => esc(t, "#s" + BS + hex + "#", (s) => s.replace(/\?/g, BS + q));
  const ESCAPERS = {
    js: viaEscape("x73", "x3f"),
    python: viaEscape("x73", "x3f"),
    java: viaEscape("u0073", "u003f"),
  };

  function escapeHtml(text, name, warn) {
    const textPart = (t) => esc(t, "#s&#115;#", (s) => "&lt;" + s.slice(1).replace(/>/g, "&gt;"));
    let out = "", pos = 0;
    for (const m of text.matchAll(RAWBLOCK)) {
      const [, tag, kindRaw, body, end] = m;
      const kind = kindRaw.toLowerCase();
      out += textPart(text.slice(pos, m.index));
      let b = body;
      if (hazards(b).length) {
        const at = lineOf(text, m.index + tag.length);
        if (kind === "style") throw new Error(`${name}: line ${at}: <style> contains #ss# or an end tag; CSS can't be escaped automatically, edit it by hand`);
        if (!JS_TYPE.test(tag) && /type\s*=/i.test(tag)) throw new Error(`${name}: line ${at}: a <script> that isn't JavaScript contains #ss# or an end tag; edit it by hand`);
        for (const l of rawLines("js", b)) warn.push(`${name}: line ${at + l - 1}`);
        b = ESCAPERS.js(b);
      }
      out += tag + b + end;
      pos = m.index + m[0].length;
    }
    return out + textPart(text.slice(pos));
  }

  function inlineScripts(text, files, name) {
    return text.replace(/(<script\b[^>]*>)\s*<\/script\s*>/gi, (all, open) => {
      const mm = open.match(/src\s*=\s*["']([^"']+)["']/i);
      if (!mm || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(mm[1])) return all;
      const want = mm[1].split(/[?#]/)[0].split("/").pop();
      const f = files.find((x) => x.name === want);
      if (!f) throw new Error(`${name}: inline: ${mm[1]} isn't among the files you added (add ${want} too)`);
      const js = f.text.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
      if (/<\/script/i.test(js)) throw new Error(`${f.name} contains </script>, so it can't be put inside a page`);
      return open.replace(/\s*src\s*=\s*["'][^"']+["']/i, "") + js + "</script>";
    });
  }

  function cleanBody(src) {            // what Snail does to a block's text before using it
    const lines = src.split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const ind = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length);
    const cut = ind.length ? Math.min(...ind) : 0;
    return lines.map((l) => l.slice(cut)).join("\n");
  }

  // Best-effort syntax checks. Python and module scripts can't be checked in a browser; those are skipped.
  function syntaxCheck(lang, text, name, warn) {
    const base = lang.split(" ")[0];
    const js = (code, label, module) => {
      if (module) return warn.push(`${label}: module script not syntax-checked in the browser`);
      try { new Function(code); } catch (e) { throw new Error(`${label}: the escaped JavaScript no longer parses: ${e.message}`); }
    };
    if (base === "js") js(text, name, /\.mjs$/i.test(name));
    else if (base === "html") {
      let i = 0;
      for (const m of text.matchAll(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi)) {
        i++;
        if (m[2].trim() && (!/type\s*=/i.test(m[1]) || JS_TYPE.test(m[1]))) js(m[2], `${name} (script ${i})`, MODULE_TYPE.test(m[1]));
      }
    } else if (base === "python") warn.push(`${name}: Python syntax is not checked in the browser`);
  }

  function build(files, opts, Snail) {
    if (!files.length) throw new Error("add at least one file");
    if (opts.note && /[#\n\r]/.test(opts.note)) throw new Error("the note can't contain # or a newline");
    const blocks = [], report = [], warnings = [];
    for (const f of files) {
      const ext = (f.name.match(/\.([^.]+)$/) || [])[1];
      let lang = f.lang ? f.lang.trim().toLowerCase() : LANGS[(ext || "").toLowerCase()];
      if (!lang) throw new Error(`${f.name}: don't know this file type; choose a language for it`);
      if (lang === "html" || lang === "htm") lang = "html en";
      let text = f.text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
      const base = lang.split(" ")[0];
      if (base === "html" && opts.inline) text = inlineScripts(text, files, f.name);
      const found = hazards(text);
      if (found.length) {
        if (!opts.escape) {
          const where = found.slice(0, 8).map(([l, w]) => `line ${l} (${w})`).join(", ") + (found.length > 8 ? " ..." : "");
          throw new Error(`${f.name}: Snail would mangle this: ${where}. Turn on "Escape" to rewrite them safely.`);
        }
        if (base === "html") text = escapeHtml(text, f.name, warnings);
        else if (ESCAPERS[base]) {
          for (const l of rawLines(base, text)) warnings.push(`${f.name}: line ${l}`);
          text = ESCAPERS[base](text);
        } else throw new Error(`${f.name}: can't escape '${base}' automatically; remove those ${found.length} spot(s) by hand`);
        if (hazards(text).length) throw new Error(`${f.name}: still contains something Snail would mangle after escaping`);
        syntaxCheck(lang, text, f.name, warnings);
        report.push(`${f.name}: escaped ${found.length} spot(s)`);
      }
      blocks.push({ lang, body: text.replace(/^\n+|\n+$/g, ""), name: f.name });
    }
    let out = "#s" + "s# generated by snailify #\n#s" + "s# ver 1.0 ###\n";
    if (opts.note) out += `#s` + `s# ${opts.note} #\n`;
    for (const b of blocks) out += `\n<code lang="${b.lang}">\n${b.body}\n<code?>\n`;

    // Final check: Snail's own parser must hand every block back exactly as written.
    let got;
    try { got = Snail.parse(out, "x.snail").blocks; } catch (e) { throw new Error("Snail couldn't read the file it just got: " + e.message); }
    const same = got.length === blocks.length && got.every((g, i) =>
      g.body === cleanBody(blocks[i].body) && g.lang + (g.extras.length ? " " + g.extras.join(" ") : "") === blocks[i].lang);
    if (!same) throw new Error("Snail does not hand the blocks back exactly as written (nothing was produced)");
    return { text: out, report, warnings, blocks };
  }

  return { build, hazards, LANGS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Snailify;
