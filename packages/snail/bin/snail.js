#!/usr/bin/env node
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), https = require("https"), http = require("http");
const pkg = require("../package.json");
const { Snail, build } = (() => { const m = require("../index.js"); return { Snail: m.Snail, build: m.build }; })();
const REPO = process.env.SNAIL_REPO || pkg.snailRepo || "8493834/snail";
const API = process.env.SNAIL_API || "https://api.github.com";
const USAGE = `snail run FILE.snail [--no-open]
snail check FILE.snail
snail build FILE[:lang]... [-o out.snail] [--escape] [--inline] [--note "text"]
snail update                    (installs the newest version of this command)
snail install-app               (installs the desktop app from the newest Release)
snail --version`;
const [cmd, ...args] = process.argv.slice(2);
const die = (m) => { console.error("snail: " + m); process.exit(1); };

// ---- update check: is there a newer release? (asked at most every 12 hours; never blocks or breaks a command) ----
const newer = (a, b) => {                       // is version a newer than b?
  const x = String(a).replace(/^v/, "").split(".").map(Number), y = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
};
const cacheFile = path.join(os.homedir(), ".snail-update.json");
function startCheck() {
  if (process.env.SNAIL_NO_UPDATE_CHECK || process.env.CI) return Promise.resolve(null);
  try { const c = JSON.parse(fs.readFileSync(cacheFile, "utf8")); if (Date.now() - c.t < 12 * 3600e3 && c.repo === REPO) return Promise.resolve(c.v); } catch {}
  return new Promise((resolve) => {
    try {
      const url = new URL(`${API}/repos/${REPO}/releases/latest`);
      const req = (url.protocol === "http:" ? http : https).get(url, { headers: { "user-agent": "snail-cli", accept: "application/vnd.github+json" } }, (res) => {
        let body = ""; res.setEncoding("utf8");
        res.on("data", (d) => { body += d; if (body.length > 1e6) res.destroy(); });
        res.on("end", () => {
          try { const v = JSON.parse(body).tag_name; if (!v) return resolve(null);
            try { fs.writeFileSync(cacheFile, JSON.stringify({ t: Date.now(), v, repo: REPO })); } catch {}
            resolve(v); } catch { resolve(null); }
        });
        res.on("error", () => resolve(null));
      });
      req.on("error", () => resolve(null));
      req.setTimeout(3000, () => { req.destroy(); resolve(null); });
    } catch { resolve(null); }
  });
}
async function finish(code, upd) {
  const latest = await Promise.race([upd, new Promise((r) => setTimeout(() => r(null), 2000))]);
  if (latest && newer(latest, pkg.version) && process.stderr.isTTY)
    console.error(`\nUpdate recommended: Snail ${String(latest).replace(/^v/, "")} is available (you have ${pkg.version}).\nUpdate with:  snail update`);
  process.exit(code);
}

(async () => {
  const upd = startCheck();
  let code = 0;
  if (cmd === "--version" || cmd === "-v") console.log(pkg.version);
  else if (cmd === "update") {
    const url = `https://github.com/${REPO}/releases/latest/download/snail.tgz`;
    console.error(`Installing the newest version from ${url}`);
    code = require("child_process").spawnSync("npm", ["install", "-g", url], { stdio: "inherit" }).status || 0;
    try { fs.unlinkSync(cacheFile); } catch {}
    return process.exit(code);
  } else if (cmd === "install-app") {
    const r = require("child_process").spawnSync("sh", [path.join(__dirname, "..", "install.sh")], { stdio: "inherit" });
    code = r.status === null ? 1 : r.status;
  } else if (cmd === "run") {
    if (!args[0]) die(USAGE);
    code = require("../src-run.js")(args[0], !args.includes("--no-open"));
  } else if (cmd === "check") {
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
  } else { console.error("snail: " + USAGE); code = cmd ? 1 : 0; }
  await finish(code, upd);
})();
