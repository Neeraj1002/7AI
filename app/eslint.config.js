// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // The unit tests run with vitest from ../studio (cd studio && npx vitest run --root ../app); the app has no copy of it.
    files: ["**/*.test.ts"],
    rules: { "import/no-unresolved": "off" },
  },
]);
