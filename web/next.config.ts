import type { NextConfig } from "next";
// Validate public wallet settings during build/startup, before client-only code runs.
import "./src/config/wallet";

const config: NextConfig = {};
export default config;
