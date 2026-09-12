import { defineConfig } from "@playwright/test";

// These suites write from the same Anvil accounts; concurrent suites race nonces.
const anvilTransactions =
  /(?:approval|signing|trade-link|acceptance|cancellation)\.spec\.ts$/;

export default defineConfig({
  projects: [
    { name: "browser", testIgnore: anvilTransactions },
    { name: "anvil", testMatch: anvilTransactions, workers: 1 },
  ],
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
      PTL_E2E: "true",
      NEXT_PUBLIC_ENABLE_ANVIL: "true",
      NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS:
        "0x0000000000000000000000000000000000001000",
    },
  },
});
