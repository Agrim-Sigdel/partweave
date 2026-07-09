// Monorepo-aware Metro config: watch the workspace root and resolve deps from
// both the app and the hoisted root node_modules.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Keep Metro's default hierarchical node_modules lookup ON: under npm (and any
// non-hoisted install) some Expo sub-deps (e.g. expo-asset) resolve from
// expo/node_modules, and disabling the walk-up breaks bundling them.

module.exports = config;
