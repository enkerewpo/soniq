// Soniq.Bridge — Node for Max launcher
//
// Why this file exists: Max's node.script object resolves filenames via Max's
// file-search-path system (NOT Node.js require). That mechanism behaves
// inconsistently across macOS and Windows when given subdirectory paths like
// `code/server.js`. The portable workaround — recommended by the Cycling '74
// community — is to keep node.script pointing at a single, uniquely-named
// top-level file that lives next to the .amxd, then let Node.js's own
// require() handle subdirectory paths. require() is platform-stable.
//
// In the Max patcher:  [node.script soniq.bridge.launcher.js @autostart 1]
//
// This folder has its own package.json with "type": "commonjs" so Node does
// not walk up to the workspace root's package.json (which is type:module).
// Without that scoping, this file would be treated as ESM and require()
// + top-level error handling would break.

let Max = null;
try {
  Max = require("max-api");
} catch (err) {
  // Without max-api we cannot signal to the Max console. Best we can do is
  // log to stderr; Node for Max forwards stderr to the Max console too.
  console.error("[soniq] launcher: max-api unavailable:", err.message);
}

try {
  require("./code/server.js");
} catch (err) {
  const message = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? err.stack : "(no stack)";
  if (Max) {
    Max.post(`[soniq] launcher failed to load ./code/server.js: ${message}`);
    Max.post(`[soniq] expected layout: Soniq.Bridge/code/server.js next to launcher`);
    Max.post(`[soniq] stack:\n${stack}`);
  } else {
    console.error(`[soniq] launcher failed: ${message}\n${stack}`);
  }
}
