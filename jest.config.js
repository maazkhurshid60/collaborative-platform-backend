const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  testMatch: ["**/src/tests/**/*.test.ts", "**/src/**/*.spec.ts"],
  modulePathIgnorePatterns: ["/node_modules/"],
};