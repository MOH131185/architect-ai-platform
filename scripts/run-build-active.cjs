#!/usr/bin/env node
/**
 * Canonical active-path build helper.
 *
 * Uses a dedicated BUILD_PATH so local Windows verification does not depend on
 * the default `build/` folder being unlocked.
 */

const path = require("path");
const { spawnSync } = require("child_process");

const buildScript = require.resolve("react-scripts/scripts/build");
const defaultBuildPath = `build_active_${new Date()
  .toISOString()
  .replace(/[:.]/g, "-")}`;
const buildPath =
  process.env.BUILD_PATH || process.env.ACTIVE_BUILD_PATH || defaultBuildPath;

const env = {
  ...process.env,
  BUILD_PATH: buildPath,
  GENERATE_SOURCEMAP: process.env.GENERATE_SOURCEMAP || "false",
};

console.log(`Using BUILD_PATH=${buildPath}`);

const result = spawnSync(process.execPath, [buildScript], {
  stdio: "inherit",
  env,
  cwd: path.resolve(__dirname, ".."),
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
