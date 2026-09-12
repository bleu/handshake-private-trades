import type { NextConfig } from "next";
// Validate public wallet settings during build/startup, before client-only code runs.
import "./src/config/wallet";
import "./src/config/deployments";

const config: NextConfig = {
  // Browser tests can run alongside a developer's ordinary Next.js server.
  distDir: process.env.PTL_E2E === "true" ? ".next-e2e" : ".next",
};
export default config;
