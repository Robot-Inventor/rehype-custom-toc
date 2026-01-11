import { defineConfig } from "eslint/config";
import { eslintConfig } from "@robot-inventor/eslint-config";

export default defineConfig(...eslintConfig, {
    ignores: ["./src/**/*.test.ts"]
});
