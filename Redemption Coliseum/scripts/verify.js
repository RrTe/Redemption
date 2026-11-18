// scripts/verify.js
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT_DIR, "server");
const CLIENT_DIR = path.join(ROOT_DIR, "client");
const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";
const TSC_BIN = path.join(CLIENT_DIR, "node_modules", "typescript", "bin", "tsc");

/**
 * Runs a single verification step and aborts with its exit code on failure.
 *
 * @param {string} label Human-readable step label.
 * @param {string} command Executable path or binary.
 * @param {string[]} args CLI arguments.
 * @param {string} cwd Working directory for the process.
 */
function runStep(label, command, args, cwd) {
  console.log(`\n[verify] === ${label} ===`);
  const useShell = process.platform === "win32" && command.endsWith(".cmd");
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: useShell,
  });

  if (result.error) {
    console.error(`[verify] Failed to launch '${label}':`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[verify] Step '${label}' failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

/**
 * Parses CLI flags and executes selected server/client verification gates.
 */
function main() {
  const args = new Set(process.argv.slice(2));
  const serverOnly = args.has("--server");
  const clientOnly = args.has("--client");
  const runServer = serverOnly || !clientOnly;
  const runClient = clientOnly || !serverOnly;

  if (runServer) {
    runStep("Server Jest Suite", NPM_BIN, ["test", "--", "--no-coverage"], SERVER_DIR);
  }
  if (runClient) {
    runStep(
      "Client TypeScript Check",
      process.execPath,
      [TSC_BIN, "-p", path.join(CLIENT_DIR, "tsconfig.json"), "--noEmit"],
      ROOT_DIR
    );
    runStep("Client Vite Build", NPM_BIN, ["run", "build"], CLIENT_DIR);
  }

  console.log("\n[verify] ALL SELECTED CHECKS PASSED.");
}

main();
