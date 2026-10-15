#!/usr/bin/env node
// Gives this build its own version, so every release gets a new tag instead of reusing one.
//   tag push  v1.4.0          -> 1.4.0
//   normal push, run number 57 -> <major>.<minor from package.json>.57   (1.2.0 -> 1.2.57)
//   run on your own computer   -> keeps the version in package.json
// Writes it into package.json and www/version.js (the app reads that to look for updates). Prints the version.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const env = process.env;
let version = pkg.version;
if (env.GITHUB_REF_TYPE === "tag" && /^v?\d+\.\d+\.\d+/.test(env.GITHUB_REF_NAME || "")) version = env.GITHUB_REF_NAME.replace(/^v/, "");
else if (env.GITHUB_RUN_NUMBER) version = pkg.version.split(".").slice(0, 2).join(".") + "." + env.GITHUB_RUN_NUMBER;
const repo = env.GITHUB_REPOSITORY || (pkg.snailRepo || "8493834/snail");
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
fs.writeFileSync(path.join(root, "www", "version.js"), `window.SNAIL = { version: ${JSON.stringify(version)}, repo: ${JSON.stringify(repo)} };\n`);
console.error(`version ${version} (${repo})`);
console.log(version);
