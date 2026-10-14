const Snail = require("./lib/snail-core.js");
const Snailify = require("./lib/snailify-core.js");
module.exports = { Snail, Snailify, parse: Snail.parse, SnailError: Snail.SnailError, build: (files, opts) => Snailify.build(files, opts || {}, Snail) };
