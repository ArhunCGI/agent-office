import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/visual",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4318", browserName: "chromium" },
  webServer: {
    command: "DEMO=0 PORT=4318 node --import tsx server/index.ts",
    url: "http://localhost:4318/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
