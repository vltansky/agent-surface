import { pathgrade } from "@wix/pathgrade/plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [pathgrade({ timeout: 180 })],
});
