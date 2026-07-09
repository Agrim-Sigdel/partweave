// Runs `*.test.ts(x)` files that modules ship alongside their source, using the
// Expo/React Native preset so component tests work too. `@/…` resolves to ./src
// (same as the tsconfig path). Pure-logic tests can opt into the faster node env
// with a `/** @jest-environment node */` docblock.
module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // A mobile app whose selected modules ship no tests shouldn't fail `pnpm test`.
  passWithNoTests: true,
};
