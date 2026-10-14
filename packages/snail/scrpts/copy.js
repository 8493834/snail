// Copies the shared parser and builder from www/ so the package always matches the apps.
const fs = require("fs"), path = require("path");
const www = path.join(__dirname, "..", "..", "..", "www"), lib = path.join(__dirname, "..", "lib");
fs.mkdirSync(lib, { recursive: true });
for (const f of ["snail-core.js", "snailify-core.js"]) fs.copyFileSync(path.join(www, f), path.join(lib, f));
