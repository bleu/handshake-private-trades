import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_ENABLE_ANVIL: "true",
      NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS:
        "0x0000000000000000000000000000000000001000",
    },
  },
});
