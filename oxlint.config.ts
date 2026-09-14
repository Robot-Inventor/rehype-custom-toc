import { defineConfig } from "oxlint";
import { oxlintConfig } from "@robot-inventor/oxlint-config";

export default defineConfig({
    ...oxlintConfig,
    ignorePatterns: ["src/**/*.test.ts"]
});
