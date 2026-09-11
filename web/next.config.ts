import type { NextConfig } from "next";
// Validate public wallet settings during build/startup, before client-only code runs.
import "./src/config/wallet";
import "./src/config/deployments";

const config: NextConfig = {};
export default config;
