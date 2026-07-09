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

// Keep test files out of the native bundle. Expo Router builds a require.context
// over the whole app/ directory, so a colocated `*.test.tsx` would otherwise get
// bundled — dragging in @testing-library/react-native and Node built-ins
// (console, util) that don't exist in the RN runtime, and failing the build.
// Metro's blockList removes them from resolution (and thus from require.context);
// Jest doesn't read this config, so `npm test` still finds and runs them.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  /\.(test|spec)\.[jt]sx?$/,
  /[/\\]__tests__[/\\]/,
];

module.exports = config;
