"use strict";
// Runs the blocks of a .snail file from the terminal (used by `snail run`).
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const { Snail } = require("./index.js");
const have = (cmd) => !cp.spawnSync(cmd, ["--version"], { stdio: "ignore" }).error;
const first = (list) => list.find(have);
function exec(cmd, args, cwd) {
  const r = cp.spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.error) return `${cmd} could not start: ${r.error.message}`;
  return r.status === 0 ? null : `${cmd} exited with code ${r.status}`;
}
function runBlock(b, n, dir, open) {
  const w = (ext, text) => { const f = path.join(dir, `block${n}.${ext}`); fs.writeFileSync(f, text); return f; };
  switch (b.lang) {
    case "js": case "javascript": return exec(process.execPath, [w("js", b.body)], dir);
    case "python": case "py": {
      const py = first(process.platform === "win32" ? ["python", "py"] : ["python3", "python"]);
      return py ? exec(py, ["-u", w("py", b.body)], dir) : "Python was not found";
    }
    case "sh": case "bash": case "shell": {
      const sh = first(b.lang === "sh" ? ["sh", "bash"] : ["bash", "sh"]);
      return sh ? exec(sh, [w("sh", b.body)], dir) : "bash/sh was not found (on Windows install Git for Windows or WSL)";
    }
    case "java": {
      const m = /\bpublic\s+(?:final\s+|abstract\s+)*class\s+(\w+)/.exec(b.body) || /\bclass\s+(\w+)/.exec(b.body);
      let cls = m && m[1], src = b.body;
      if (!cls) { cls = "SnailBlock" + n; src = `public class ${cls} { public static void main(String[] a) throws Exception {\n${b.body}\n} }`; }
      fs.writeFileSync(path.join(dir, cls + ".java"), src);
      return exec("javac", [cls + ".java"], dir) || exec("java", ["-cp", dir, cls], dir);
    }
    case "html": {
      const f = w("html", Snail.htmlPage(b, "snail"));
      console.log("  html written to " + f);
      if (open) { const o = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open"; cp.spawn(o, [f], { stdio: "ignore", detached: true }).unref(); }
      return null;
    }
    default: return `no runner for language '${b.lang}'`;
  }
}
module.exports = function run(file, open) {
  let p;
  try { p = Snail.parse(fs.readFileSync(file, "utf8"), file); } catch (e) { console.error(`snail: ${file}: ${e.message}`); return 1; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snail-"));
  try {
    for (let i = 0; i < p.blocks.length; i++) {
      const b = p.blocks[i];
      console.log(`[block ${i + 1}] running ${b.lang}`);
      const err = runBlock(b, i + 1, dir, open);
      if (err) { console.error(`snail: block ${i + 1} (line ${b.line}): ${err}`); return 1; }
    }
    return 0;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
