#!/usr/bin/env node
"use strict";
const fs = require("fs"), path = require("path");
const { Snail, build } = (() => { const m = require("../index.js"); return { Snail: m.Snail, build: m.build }; })();
const USAGE = `snail check FILE.snail
snail build FILE[:lang]... [-o out.snail] [--escape] [--inline] [--note "text"]`;
const [cmd, ...args] = process.argv.slice(2);
const die = (m) => { console.error("snail: " + m); process.exit(1); };
if (cmd === "check") {
  if (!args[0]) die(USAGE);
  let p;
  try { p = Snail.parse(fs.readFileSync(args[0], "utf8"), args[0]); } catch (e) { die(`${args[0]}: ${e.message}`); }
  console.log(`${args[0]}: ${p.kind} file, version ${p.version || "not declared"}, ${p.blocks.length} code block(s)`);
  p.blocks.forEach((b, i) => console.log(`  block ${i + 1}: ${b.lang}, line ${b.line}`));
} else if (cmd === "build") {
  const files = []; const o = { escape: false, inline: false, note: "" }; let out = "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-o") out = args[++i]; else if (a === "--escape") o.escape = true; else if (a === "--inline") o.inline = true;
    else if (a === "--note") o.note = args[++i] || ""; else if (a.startsWith("-")) die("unknown option " + a);
    else { const m = /^(.*):([a-z]+)$/i.exec(a); const f = m && !fs.existsSync(a) ? m[1] : a;
      try { files.push({ name: path.basename(f), text: fs.readFileSync(f, "utf8"), lang: m && !fs.existsSync(a) ? m[2] : "" }); } catch (e) { die(e.message); } }
  }
  if (!files.length) die(USAGE);
  let r; try { r = build(files, o); } catch (e) { die(e.message); }
  r.report.forEach((l) => console.error(l)); r.warnings.forEach((w) => console.error("check: " + w));
  if (out) { fs.writeFileSync(out, r.text); console.error(`wrote ${out}`); } else process.stdout.write(r.text);
} else die(USAGE);
